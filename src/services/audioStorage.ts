import { getDownloadURL, getMetadata, listAll, ref, uploadBytesResumable } from 'firebase/storage'
import { getFirebaseStorage } from '../config/firebase'
import type { AudioFile } from '../types/audio'
import type { RecordingUpload } from '../types/upload'
import { recordingUploadFormat, uniqueRecordingName } from './recordingUploadFormat'

const audioExtension = /\.(mp3|wav|m4a|aac|ogg|oga|opus|webm|flac|aif|aiff|mp4)$/i
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
  const promise = new Promise<AudioFile>((resolve, reject) => {
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

export async function listAudioFiles(): Promise<AudioFile[]> {
  const storage = getFirebaseStorage()
  const { items } = await listAll(ref(storage, 'recordings/'))
  const metadata = await Promise.all(items.map((item) => getMetadata(item)))

  // MIME type is authoritative when supplied. Fall back to extensions for uploads
  // with absent/generic metadata, including browser recordings saved as WebM.
  return metadata
    .filter((file) => file.contentType?.startsWith('audio/')
      || file.contentType === 'video/webm'
      || ((!file.contentType || file.contentType === 'application/octet-stream')
        && audioExtension.test(file.name)))
    .map((file) => ({ id: file.fullPath, name: file.name, uploadedAt: file.timeCreated }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.name.localeCompare(b.name))
}
