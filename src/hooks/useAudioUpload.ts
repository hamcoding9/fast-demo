import { useEffect, useRef, useState } from 'react'
import { FirebaseNotConfiguredError } from '../config/firebase'
import { uploadAudioRecording } from '../services/audioStorage'
import { AudioUploadValidationError } from '../services/recordingUploadFormat'
import type { RecordedAudio } from '../types/recording'
import type { RecordingUpload } from '../types/upload'

interface UploadState {
  blob: Blob | null
  status: 'idle' | 'uploading' | 'success' | 'error'
  progress: number
  message: string | null
}
interface ActiveUpload { blob: Blob; operation?: RecordingUpload }
const initialState: UploadState = { blob: null, status: 'idle', progress: 0, message: null }

function errorMessage(error: unknown) {
  if (error instanceof FirebaseNotConfiguredError || error instanceof AudioUploadValidationError) return error.message
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
  if (code === 'storage/unauthorized') return '업로드 권한이 없습니다. Storage Rules의 recordings/ 생성 권한을 확인하세요. (storage/unauthorized)'
  if (code === 'storage/canceled') return '업로드가 취소되었습니다. 다시 시도하세요.'
  return '업로드하지 못했습니다. 네트워크와 Firebase Storage 설정을 확인한 뒤 다시 시도하세요.'
}

export function useAudioUpload(recording: RecordedAudio | null) {
  const blob = recording?.blob ?? null
  const [state, setState] = useState<UploadState>(initialState)
  const active = useRef<ActiveUpload | null>(null)

  useEffect(() => {
    function cancel() {
      const upload = active.current
      if (!upload || upload.blob !== blob) return
      active.current = null
      upload.operation?.cancel()
    }
    window.addEventListener('pagehide', cancel)
    return () => { window.removeEventListener('pagehide', cancel); cancel() }
  }, [blob])

  function upload() {
    if (!blob || active.current || (state.blob === blob && state.status === 'success')) return
    const request: ActiveUpload = { blob }
    active.current = request
    setState({ blob, status: 'uploading', progress: 0, message: null })
    function fail(error: unknown) {
      if (active.current !== request) return
      active.current = null
      setState({ blob, status: 'error', progress: 0, message: errorMessage(error) })
    }
    try {
      request.operation = uploadAudioRecording(blob, (progress) => {
        if (active.current === request) setState({ blob, status: 'uploading', progress, message: null })
      })
      request.operation.promise.then(() => {
        if (active.current !== request) return
        active.current = null
        setState({ blob, status: 'success', progress: 100, message: '업로드가 완료되었습니다. Play 탭에서 새 오디오를 확인하세요.' })
      }, fail)
    } catch (error) { fail(error) }
  }

  return { ...(state.blob === blob ? state : initialState), upload }
}
