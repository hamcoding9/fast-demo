import { waitFor } from '@testing-library/react'
import { collection, doc, getFirestore, serverTimestamp, setDoc, type Firestore, type FieldValue } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getDownloadURL, getMetadata, getStorage, ref, uploadBytesResumable, type FirebaseStorage, type StorageReference } from 'firebase/storage'
import { FirebaseNotConfiguredError, getFirebaseStorage } from '../config/firebase'
import { AudioUploadMetadataError, getAudioDownloadUrl, uploadAudioRecording } from './audioStorage'
import { MAX_RECORDING_BYTES } from './recordingUploadFormat'
import { MockUploadTask } from '../test/uploadMocks'

vi.mock('firebase/firestore', () => ({ collection: vi.fn(), doc: vi.fn(), getFirestore: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn() }))
vi.mock('firebase/app', () => ({ getApps: vi.fn(), initializeApp: vi.fn() }))
vi.mock('firebase/storage', () => ({ getMetadata: vi.fn(), getStorage: vi.fn(), ref: vi.fn(), getDownloadURL: vi.fn(), uploadBytesResumable: vi.fn() }))

const storage = {} as FirebaseStorage
const app = { name: 'fast-demo' } as FirebaseApp
const folder = { fullPath: 'recordings/' } as StorageReference
const requiredEnv = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_APP_ID'] as const

beforeEach(() => {
  vi.resetAllMocks()
  requiredEnv.forEach((key) => vi.stubEnv(key, `test-${key}`))
  vi.mocked(getApps).mockReturnValue([])
  vi.mocked(initializeApp).mockReturnValue(app)
  vi.mocked(getStorage).mockReturnValue(storage)
  vi.mocked(ref).mockReturnValue(folder)
})
afterEach(() => vi.unstubAllEnvs())

describe('Firebase initialization', () => {
  it('initializes the named app with environment values', () => {
    expect(getFirebaseStorage()).toBe(storage)
    expect(initializeApp).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-VITE_FIREBASE_API_KEY',
      projectId: 'test-VITE_FIREBASE_PROJECT_ID',
      storageBucket: 'test-VITE_FIREBASE_STORAGE_BUCKET',
      appId: 'test-VITE_FIREBASE_APP_ID',
    }), 'fast-demo')
    expect(getStorage).toHaveBeenCalledWith(app)
  })

  it('reuses its existing app on refresh instead of initializing twice', () => {
    vi.mocked(getApps).mockReturnValue([app])
    expect(getFirebaseStorage()).toBe(storage)
    expect(initializeApp).not.toHaveBeenCalled()
  })

  it.each(requiredEnv)('does not initialize or query Storage when %s is missing', async (key) => {
    vi.stubEnv(key, '   ')
    await expect(getAudioDownloadUrl('recordings/memo.wav')).rejects.toBeInstanceOf(FirebaseNotConfiguredError)
    expect(initializeApp).not.toHaveBeenCalled()
    expect(getStorage).not.toHaveBeenCalled()
    expect(getDownloadURL).not.toHaveBeenCalled()
  })

  it('handles a completely empty Firebase configuration', async () => {
    requiredEnv.forEach((key) => vi.stubEnv(key, ''))
    await expect(getAudioDownloadUrl('recordings/memo.wav')).rejects.toThrow('Firebase configuration is required')
    expect(getDownloadURL).not.toHaveBeenCalled()
  })
})

describe('getAudioDownloadUrl', () => {
  it('retrieves the download URL of the selected Storage path', async () => {
    vi.mocked(getDownloadURL).mockResolvedValue('https://audio.test/memo.wav')
    await expect(getAudioDownloadUrl('recordings/memo.wav')).resolves.toBe('https://audio.test/memo.wav')
    expect(ref).toHaveBeenCalledWith(storage, 'recordings/memo.wav')
    expect(getDownloadURL).toHaveBeenCalledWith(folder)
  })

  it('propagates a download URL API failure', async () => {
    vi.mocked(getDownloadURL).mockRejectedValue(new Error('storage/object-not-found'))
    await expect(getAudioDownloadUrl('recordings/missing.wav')).rejects.toThrow('storage/object-not-found')
  })

  it('does not request a URL without Firebase configuration', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    await expect(getAudioDownloadUrl('recordings/memo.wav')).rejects.toThrow(FirebaseNotConfiguredError)
    expect(getDownloadURL).not.toHaveBeenCalled()
  })
})

describe('group audio upload', () => {
  let tasks: MockUploadTask[]
  const timestamp = { sentinel: 'serverTimestamp' } as unknown as FieldValue
  beforeEach(() => {
    tasks = []
    let nextId = 0
    vi.mocked(getFirestore).mockReturnValue({} as Firestore)
    vi.mocked(collection).mockReturnValue({} as ReturnType<typeof collection>)
    vi.mocked(doc).mockImplementation(() => ({ id: `audio-${++nextId}` }) as ReturnType<typeof doc>)
    vi.mocked(serverTimestamp).mockReturnValue(timestamp)
    vi.mocked(setDoc).mockResolvedValue()
    vi.mocked(getMetadata).mockRejectedValue({ code: 'storage/object-not-found' })
    vi.mocked(ref).mockImplementation((_storage, path) => ({ fullPath: path, name: path?.split('/').pop() }) as StorageReference)
    vi.mocked(uploadBytesResumable).mockImplementation((reference, blob, metadata) => {
      const task = new MockUploadTask(reference, blob as Blob, metadata)
      tasks.push(task)
      return task.sdkTask()
    })
  })
  const blob = () => new Blob(['audio'], { type: 'audio/webm;codecs=opus' })
  async function taskAt(index = 0) {
    await waitFor(() => expect(tasks.length).toBeGreaterThan(index))
    return tasks[index]
  }

  it.each([
    ['audio/webm;codecs=opus', 'webm'], ['audio/mp4;codecs=mp4a.40.2', 'm4a'],
    ['audio/ogg', 'ogg'], ['audio/wav', 'wav'], ['audio/mpeg', 'mp3'], ['audio/aac', 'aac'],
  ])('uploads %s and publishes metadata only after Storage succeeds', async (mimeType, extension) => {
    const recording = new Blob(['audio'], { type: mimeType })
    const operation = uploadAudioRecording(recording, 'group-a', vi.fn())
    const task = await taskAt()
    const document = vi.mocked(doc).mock.results[0].value
    const path = `recordings/group-a/${document.id}.${extension}`
    expect(task.snapshot.ref.fullPath).toBe(path)
    expect(collection).toHaveBeenCalledWith(expect.anything(), 'audios')
    expect(setDoc).toHaveBeenCalledTimes(1)
    expect(setDoc).toHaveBeenNthCalledWith(1, document, { groupId: 'group-a', fileName: `${document.id}.${extension}`,
      storagePath: path, contentType: mimeType, size: recording.size, status: 'pending', uploadedAt: timestamp })
    expect(uploadBytesResumable).toHaveBeenCalledWith(expect.anything(), recording,
      { contentType: mimeType, customMetadata: { audioId: document.id, groupId: 'group-a' } })
    task.complete()
    await expect(operation.promise).resolves.toEqual({ id: document.id, groupId: 'group-a', name: `${document.id}.${extension}`, storagePath: path })
    expect(setDoc).toHaveBeenNthCalledWith(2, document, { status: 'ready', uploadedAt: timestamp }, { merge: true })
    expect(task.unsubscribe).toHaveBeenCalled()
  })

  it('reports progress but remains pending during Firestore finalization', async () => {
    let finish!: () => void
    vi.mocked(setDoc).mockResolvedValueOnce().mockReturnValueOnce(new Promise((done) => { finish = done }))
    const progress = vi.fn()
    const operation = uploadAudioRecording(new Blob(['1234567890'], { type: 'audio/webm' }), 'group-a', progress)
    let finished = false
    void operation.promise.then(() => { finished = true })
    const task = await taskAt()
    task.progress(5)
    expect(progress).toHaveBeenLastCalledWith(50)
    task.complete()
    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(2))
    expect(progress).toHaveBeenLastCalledWith(100)
    expect(finished).toBe(false)
    finish()
    await operation.promise
  })

  it('deduplicates concurrent and successful uploads per recording and group', async () => {
    const recording = blob()
    const progress = vi.fn()
    const first = uploadAudioRecording(recording, 'group-a', vi.fn())
    expect(uploadAudioRecording(recording, 'group-a', progress)).toBe(first)
    const task = await taskAt()
    task.progress(2)
    expect(progress).toHaveBeenLastCalledWith(40)
    task.complete()
    await first.promise
    expect(uploadAudioRecording(recording, 'group-a', vi.fn())).toBe(first)
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
    expect(doc).toHaveBeenCalledTimes(1)
  })

  it('isolates the same Blob across groups, including cancellation', async () => {
    const recording = blob()
    const a = uploadAudioRecording(recording, 'group-a', vi.fn())
    const b = uploadAudioRecording(recording, 'group-b', vi.fn())
    await taskAt(1)
    expect(tasks[0].snapshot.ref.fullPath).toBe('recordings/group-a/audio-1.webm')
    expect(tasks[1].snapshot.ref.fullPath).toBe('recordings/group-b/audio-2.webm')
    a.cancel()
    await expect(a.promise).rejects.toMatchObject({ code: 'storage/canceled' })
    tasks[1].complete()
    expect((await b.promise).groupId).toBe('group-b')
    expect(tasks[1].cancel).not.toHaveBeenCalled()
  })

  it('does not start Storage when pending metadata fails; retry reuses the document ID', async () => {
    vi.mocked(setDoc).mockRejectedValueOnce(new Error('permission-denied'))
    const recording = blob()
    const first = uploadAudioRecording(recording, 'group-a', vi.fn())
    await expect(first.promise).rejects.toMatchObject({ fileUploaded: false })
    expect(uploadBytesResumable).not.toHaveBeenCalled()
    const retry = uploadAudioRecording(recording, 'group-a', vi.fn())
    const task = await taskAt()
    task.complete()
    await retry.promise
    expect(doc).toHaveBeenCalledTimes(1)
    expect(vi.mocked(setDoc).mock.calls[0][0]).toBe(vi.mocked(setDoc).mock.calls[1][0])
  })

  it('retries failed Storage with the same path without recreating pending metadata', async () => {
    const recording = blob()
    const first = uploadAudioRecording(recording, 'group-a', vi.fn())
    const task = await taskAt()
    task.fail(new Error('storage/unauthorized'))
    await expect(first.promise).rejects.toThrow('storage/unauthorized')
    expect(setDoc).toHaveBeenCalledTimes(1)
    const progress = vi.fn()
    const retry = uploadAudioRecording(recording, 'group-a', progress)
    const next = await taskAt(1)
    task.on.mock.calls[0][1]({ ...task.snapshot, bytesTransferred: task.snapshot.totalBytes })
    expect(progress).toHaveBeenLastCalledWith(0)
    expect(next.snapshot.ref.fullPath).toBe(task.snapshot.ref.fullPath)
    next.complete()
    await retry.promise
    expect(doc).toHaveBeenCalledTimes(1)
    expect(setDoc).toHaveBeenCalledTimes(2)
  })

  it('retries only ready metadata when Storage succeeded but Firestore finalization failed', async () => {
    vi.mocked(setDoc).mockResolvedValueOnce().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce()
    const recording = blob()
    const first = uploadAudioRecording(recording, 'group-a', vi.fn())
    const task = await taskAt()
    task.complete()
    await expect(first.promise).rejects.toBeInstanceOf(AudioUploadMetadataError)
    const retry = uploadAudioRecording(recording, 'group-a', vi.fn())
    await retry.promise
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
    expect(getMetadata).not.toHaveBeenCalled()
    expect(doc).toHaveBeenCalledTimes(1)
    expect(setDoc).toHaveBeenLastCalledWith(vi.mocked(doc).mock.results[0].value,
      { status: 'ready', uploadedAt: timestamp }, { merge: true })
  })

  it('recognizes a server-committed Storage object after an ambiguous upload error', async () => {
    const recording = blob()
    const first = uploadAudioRecording(recording, 'group-a', vi.fn())
    const task = await taskAt()
    task.fail(new Error('network response lost'))
    await expect(first.promise).rejects.toThrow('network response lost')
    vi.mocked(getMetadata).mockResolvedValueOnce(task.snapshot.metadata)
    await uploadAudioRecording(recording, 'group-a', vi.fn()).promise
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
    expect(setDoc).toHaveBeenCalledTimes(2)
  })

  it('refuses to overwrite a mismatched existing object on retry', async () => {
    const recording = blob()
    const first = uploadAudioRecording(recording, 'group-a', vi.fn())
    const task = await taskAt()
    task.fail(new Error('network error'))
    await expect(first.promise).rejects.toThrow()
    vi.mocked(getMetadata).mockResolvedValueOnce({ ...task.snapshot.metadata, size: 999 })
    await expect(uploadAudioRecording(recording, 'group-a', vi.fn()).promise).rejects.toThrow('does not match')
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
  })

  it('cancels Storage, unsubscribes and prevents publishing ready', async () => {
    const operation = uploadAudioRecording(blob(), 'group-a', vi.fn())
    const task = await taskAt()
    operation.cancel()
    await expect(operation.promise).rejects.toMatchObject({ code: 'storage/canceled' })
    task.on.mock.calls[0][3]()
    expect(task.cancel).toHaveBeenCalledTimes(1)
    expect(task.unsubscribe).toHaveBeenCalled()
    expect(setDoc).toHaveBeenCalledTimes(1)
  })

  it('serializes a canceled pending write before retrying, preventing an older pending write from replacing ready', async () => {
    let finish!: () => void
    vi.mocked(setDoc).mockReturnValueOnce(new Promise((done) => { finish = done }))
    const recording = blob()
    const first = uploadAudioRecording(recording, 'group-a', vi.fn())
    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1))
    first.cancel()
    await expect(first.promise).rejects.toMatchObject({ code: 'storage/canceled' })
    const retry = uploadAudioRecording(recording, 'group-a', vi.fn())
    expect(uploadBytesResumable).not.toHaveBeenCalled()
    finish()
    const task = await taskAt()
    task.complete()
    await retry.promise
    expect(setDoc).toHaveBeenCalledTimes(2)
  })

  it('creates separate document IDs for distinct recordings', async () => {
    const one = uploadAudioRecording(blob(), 'group-a', vi.fn())
    const two = uploadAudioRecording(blob(), 'group-a', vi.fn())
    await taskAt(1)
    expect(tasks[0].snapshot.ref.fullPath).not.toBe(tasks[1].snapshot.ref.fullPath)
    tasks.forEach((task) => task.complete())
    await Promise.all([one.promise, two.promise])
  })

  it('validates recordings, group IDs and configuration before starting cloud writes', () => {
    expect(() => uploadAudioRecording(new Blob([], { type: 'audio/webm' }), 'group-a', vi.fn())).toThrow('Empty recordings')
    expect(() => uploadAudioRecording(new Blob([new Uint8Array(MAX_RECORDING_BYTES + 1)], { type: 'audio/webm' }), 'group-a', vi.fn())).toThrow('10 MiB')
    expect(() => uploadAudioRecording(new Blob(['text'], { type: 'text/plain' }), 'group-a', vi.fn())).toThrow('This recording format')
    expect(() => uploadAudioRecording(blob(), '../group-b', vi.fn())).toThrow('valid group')
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    expect(() => uploadAudioRecording(blob(), 'group-a', vi.fn())).toThrow(FirebaseNotConfiguredError)
    expect(setDoc).not.toHaveBeenCalled()
    expect(uploadBytesResumable).not.toHaveBeenCalled()
  })
})

describe('cancellation during metadata confirmation', () => {
  it('does not start any cloud operation when canceled immediately', async () => {
    vi.mocked(getFirestore).mockReturnValue({} as Firestore)
    vi.mocked(collection).mockReturnValue({} as ReturnType<typeof collection>)
    vi.mocked(doc).mockReturnValue({ id: 'never-uploaded' } as ReturnType<typeof doc>)
    const operation = uploadAudioRecording(new Blob(['audio'], { type: 'audio/webm' }), 'group-a', vi.fn())
    operation.cancel()
    await expect(operation.promise).rejects.toMatchObject({ code: 'storage/canceled' })
    expect(setDoc).not.toHaveBeenCalled()
    expect(uploadBytesResumable).not.toHaveBeenCalled()
  })

  it('waits for a canceled ready write and reuses its success when retried', async () => {
    vi.mocked(getFirestore).mockReturnValue({} as Firestore)
    vi.mocked(collection).mockReturnValue({} as ReturnType<typeof collection>)
    vi.mocked(doc).mockReturnValue({ id: 'ready-after-cancel' } as ReturnType<typeof doc>)
    vi.mocked(ref).mockReturnValue({ fullPath: 'recordings/group-a/ready-after-cancel.webm' } as StorageReference)
    let finish!: () => void
    vi.mocked(setDoc).mockResolvedValueOnce().mockReturnValueOnce(new Promise((done) => { finish = done }))
    const recording = new Blob(['audio'], { type: 'audio/webm' })
    const task = new MockUploadTask({ fullPath: 'recordings/group-a/ready-after-cancel.webm' } as StorageReference, recording)
    vi.mocked(uploadBytesResumable).mockReturnValue(task.sdkTask())
    const first = uploadAudioRecording(recording, 'group-a', vi.fn())
    await waitFor(() => expect(task.on).toHaveBeenCalled())
    task.complete()
    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(2))
    first.cancel()
    await expect(first.promise).rejects.toMatchObject({ code: 'storage/canceled' })
    const retry = uploadAudioRecording(recording, 'group-a', vi.fn())
    finish()
    await expect(retry.promise).resolves.toMatchObject({ id: 'ready-after-cancel' })
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
    expect(setDoc).toHaveBeenCalledTimes(2)
  })
})
