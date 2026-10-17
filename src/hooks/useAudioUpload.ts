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
  if (code === 'storage/unauthorized') return 'Upload permission denied. Check that Storage Rules allow creating files in recordings/. (storage/unauthorized)'
  if (code === 'storage/canceled') return 'Upload canceled. Please try again.'
  return 'Upload failed. Check your network connection and Firebase Storage configuration, then try again.'
}

export function useAudioUpload(recording: RecordedAudio | null, enabled = true) {
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
  }, [blob, enabled])

  function upload() {
    if (!enabled || !blob || active.current || (state.blob === blob && state.status === 'success')) return
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
        setState({ blob, status: 'success', progress: 100, message: 'Upload complete. The file is stored in Firebase Storage.' })
      }, fail)
    } catch (error) { fail(error) }
  }

  return { ...(state.blob === blob ? state : initialState), upload }
}
