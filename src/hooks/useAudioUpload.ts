import { useEffect, useRef, useState } from 'react'
import { FirebaseNotConfiguredError } from '../config/firebase'
import { AudioUploadMetadataError, uploadAudioRecording } from '../services/audioStorage'
import { AudioUploadValidationError } from '../services/recordingUploadFormat'
import type { RecordedAudio } from '../types/recording'
import type { RecordingUpload } from '../types/upload'

interface UploadState {
  groupId: string | null
  blob: Blob | null
  status: 'idle' | 'uploading' | 'success' | 'error'
  progress: number
  message: string | null
}
interface ActiveUpload { groupId: string; blob: Blob; operation?: RecordingUpload }
const initialState: UploadState = { groupId: null, blob: null, status: 'idle', progress: 0, message: null }

function errorMessage(error: unknown) {
  if (error instanceof FirebaseNotConfiguredError || error instanceof AudioUploadValidationError || error instanceof AudioUploadMetadataError) return error.message
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
  if (code === 'storage/unauthorized') return 'Upload permission denied. Check that Storage Rules allow creating files in recordings/. (storage/unauthorized)'
  if (code === 'storage/canceled') return 'Upload canceled. Please try again.'
  return 'Upload failed. Check your network connection and Firebase Storage configuration, then try again.'
}

export function useAudioUpload(recording: RecordedAudio | null, groupId: string | null) {
  const blob = recording?.blob ?? null
  const [state, setState] = useState<UploadState>(initialState)
  const active = useRef<ActiveUpload | null>(null)

  useEffect(() => {
    function cancel() {
      const upload = active.current
      if (!upload || upload.blob !== blob || upload.groupId !== groupId) return
      active.current = null
      upload.operation?.cancel()
    }
    function onPageHide() {
      cancel()
      setState(initialState)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => { window.removeEventListener('pagehide', onPageHide); cancel() }
  }, [blob, groupId])

  function upload() {
    if (!groupId || !blob || active.current || (state.groupId === groupId && state.blob === blob && state.status === 'success')) return
    const request: ActiveUpload = { groupId, blob }
    active.current = request
    setState({ groupId, blob, status: 'uploading', progress: 0, message: null })
    function fail(error: unknown) {
      if (active.current !== request) return
      active.current = null
      setState({ groupId, blob, status: 'error', progress: 0, message: errorMessage(error) })
    }
    try {
      request.operation = uploadAudioRecording(blob, groupId, (progress) => {
        if (active.current === request) setState({ groupId, blob, status: 'uploading', progress, message: null })
      })
      request.operation.promise.then(() => {
        if (active.current !== request) return
        active.current = null
        setState({ groupId, blob, status: 'success', progress: 100, message: 'Upload complete. Open the Play tab to find your new recording.' })
      }, fail)
    } catch (error) { fail(error) }
  }

  return { ...(state.groupId === groupId && state.blob === blob ? state : initialState), upload }
}
