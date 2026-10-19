import { collection, doc, serverTimestamp, setDoc, type DocumentReference } from 'firebase/firestore'
import { getDownloadURL, getMetadata, ref, uploadBytesResumable, type UploadTask } from 'firebase/storage'
import { getFirebaseFirestore, getFirebaseStorage } from '../config/firebase'
import type { RecordingUpload, UploadedRecording } from '../types/upload'
import { isValidGroupId } from './groups'
import { recordingUploadFormat } from './recordingUploadFormat'

interface UploadSession {
  document: DocumentReference
  result: UploadedRecording
  contentType: string
  size: number
  pendingSaved: boolean
  storageAttempted: boolean
  storageComplete: boolean
  ready: boolean
  progress: number
  tail: Promise<void>
  operation?: RecordingUpload
  listeners: Set<(percent: number) => void>
}
// A Blob can be uploaded independently to different groups. Weak keys release
// retry state when the in-memory recording is discarded.
const sessions = new WeakMap<Blob, Map<string, UploadSession>>()

export class AudioUploadMetadataError extends Error {
  readonly fileUploaded: boolean
  constructor(fileUploaded: boolean, options: ErrorOptions) {
    super(fileUploaded
      ? 'The audio file is stored, but its library entry could not be finalized. Retry Upload to finish without uploading the file again.'
      : 'Unable to prepare the audio library entry. Check your connection and Firestore permissions, then retry Upload.', options)
    this.name = 'AudioUploadMetadataError'
    this.fileUploaded = fileUploaded
  }
}
const canceledError = () => Object.assign(new Error('Upload canceled'), { code: 'storage/canceled' })

export function uploadAudioRecording(blob: Blob, groupId: string, onProgress: (percent: number) => void): RecordingUpload {
  if (!isValidGroupId(groupId)) throw new Error('A valid group is required to upload audio.')
  const { contentType, extension } = recordingUploadFormat(blob)
  const storage = getFirebaseStorage()
  const database = getFirebaseFirestore()
  let groups = sessions.get(blob)
  if (!groups) { groups = new Map(); sessions.set(blob, groups) }
  let session = groups.get(groupId)
  if (!session) {
    const document = doc(collection(database, 'audios'))
    const fileName = `${document.id}.${extension}`
    session = { document, result: { id: document.id, groupId, name: fileName, storagePath: `recordings/${groupId}/${fileName}` },
      contentType, size: blob.size, pendingSaved: false, storageAttempted: false,
      storageComplete: false, ready: false, progress: 0, tail: Promise.resolve(), listeners: new Set() }
    groups.set(groupId, session)
  }
  const current = session
  if (current.operation) {
    if (!current.ready) current.listeners.add(onProgress)
    onProgress(current.progress)
    return current.operation
  }
  current.listeners.add(onProgress)
  let canceled = false
  let settled = false
  let task: UploadTask | undefined
  let unsubscribe: (() => void) | undefined
  let rejectStorage: ((error: unknown) => void) | undefined
  let resolveOperation!: (result: UploadedRecording) => void
  let rejectOperation!: (error: unknown) => void
  const promise = new Promise<UploadedRecording>((resolve, reject) => { resolveOperation = resolve; rejectOperation = reject })
  const assertActive = () => { if (canceled) throw canceledError() }
  function progress(value: number) {
    if (canceled || settled || current.operation !== operation) return
    current.progress = value
    current.listeners.forEach((listener) => listener(value))
  }
  const operation: RecordingUpload = {
    promise,
    cancel() {
      if (settled) return
      canceled = true
      settled = true
      unsubscribe?.()
      task?.cancel()
      rejectStorage?.(canceledError())
      if (current.operation === operation) {
        current.operation = undefined
        current.listeners.clear()
      }
      rejectOperation(canceledError())
    },
  }
  current.operation = operation

  // Serialize retries behind any outstanding Firestore write. A canceled write
  // cannot be recalled; it must finish before a retry can publish newer state.
  const run = current.tail.then(async () => {
    assertActive()
    if (current.ready) { progress(100); return }
    if (!current.pendingSaved) {
      try {
        await setDoc(current.document, { groupId, fileName: current.result.name,
          storagePath: current.result.storagePath, contentType: current.contentType, size: current.size,
          status: 'pending', uploadedAt: serverTimestamp() })
        current.pendingSaved = true
      } catch (cause) { throw new AudioUploadMetadataError(false, { cause }) }
    }
    assertActive()
    const reference = ref(storage, current.result.storagePath)
    if (current.storageAttempted && !current.storageComplete) {
      try {
        const metadata = await getMetadata(reference)
        if (metadata.size !== blob.size || metadata.contentType !== contentType
          || metadata.customMetadata?.audioId !== current.result.id || metadata.customMetadata?.groupId !== groupId) {
          throw new Error('The existing audio file does not match this recording. Contact the project organizer.')
        }
        current.storageComplete = true
      } catch (error) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'storage/object-not-found')) throw error
      }
    }
    assertActive()
    if (!current.storageComplete) {
      current.storageAttempted = true
      progress(0)
      assertActive()
      task = uploadBytesResumable(reference, blob, { contentType,
        customMetadata: { audioId: current.result.id, groupId } })
      await new Promise<void>((resolve, reject) => {
        rejectStorage = reject
        unsubscribe = task!.on('state_changed', (snapshot) => {
          progress(snapshot.totalBytes > 0 ? Math.min(100, Math.max(0, Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100))) : 0)
        }, reject, () => { if (!canceled && !settled && current.operation === operation) { current.storageComplete = true; resolve() } })
      }).finally(() => { unsubscribe?.(); rejectStorage = undefined; task = undefined })
    }
    assertActive()
    progress(100)
    assertActive()
    try {
      await setDoc(current.document, { status: 'ready', uploadedAt: serverTimestamp() }, { merge: true })
      current.ready = true
    } catch (cause) { throw new AudioUploadMetadataError(true, { cause }) }
    assertActive()
  })
  current.tail = run.catch(() => {})
  run.then(() => {
    if (settled) return
    settled = true
    current.listeners.clear()
    resolveOperation(current.result)
  }, (error: unknown) => {
    if (settled) return
    settled = true
    if (current.operation === operation) {
      current.operation = undefined
      current.listeners.clear()
    }
    rejectOperation(error)
  })
  return operation
}

export async function getAudioDownloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(getFirebaseStorage(), path))
}
