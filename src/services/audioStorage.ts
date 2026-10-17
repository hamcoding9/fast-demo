import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { getFirebaseStorage } from '../config/firebase'
import type { RecordingUpload, UploadedRecording } from '../types/upload'
import { recordingUploadFormat, uniqueRecordingName } from './recordingUploadFormat'

const uploads = new WeakMap<Blob, RecordingUpload>()
const uploadPaths = new WeakMap<Blob, string>()

// One operation per Blob, including completed uploads. Retry uses the same path
// to avoid duplicate objects if the server committed an upload before an error.
export function uploadAudioRecording(blob: Blob, onProgress: (percent: number) => void): RecordingUpload {
  const existing = uploads.get(blob)
  if (existing) return existing
  const { contentType, extension } = recordingUploadFormat(blob)
  const storage = getFirebaseStorage()
  const path = uploadPaths.get(blob) ?? `recordings/${uniqueRecordingName(extension)}`
  uploadPaths.set(blob, path)
  const task = uploadBytesResumable(ref(storage, path), blob, { contentType })
  let settled = false
  let unsubscribe: (() => void) | undefined
  let rejectUpload!: (error: unknown) => void
  const promise = new Promise<UploadedRecording>((resolve, reject) => {
    rejectUpload = reject
    unsubscribe = task.on('state_changed', (snapshot) => {
      if (!settled) onProgress(snapshot.totalBytes > 0
        ? Math.min(100, Math.max(0, Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100))) : 0)
    }, (error) => {
      if (settled) return
      settled = true
      uploads.delete(blob)
      unsubscribe?.()
      reject(error)
    }, () => {
      if (settled) return
      settled = true
      unsubscribe?.()
      const metadata = task.snapshot.metadata
      resolve({ id: task.snapshot.ref.fullPath, name: metadata.name, uploadedAt: metadata.timeCreated })
    })
  })
  const operation: RecordingUpload = {
    promise,
    cancel() {
      if (settled) return
      settled = true
      uploads.delete(blob)
      unsubscribe?.()
      task.cancel()
      rejectUpload(Object.assign(new Error('Upload canceled'), { code: 'storage/canceled' }))
    },
  }
  uploads.set(blob, operation)
  if (settled) unsubscribe?.()
  return operation
}

export async function getAudioDownloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(getFirebaseStorage(), path))
}
