import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getDownloadURL, getStorage, ref, uploadBytesResumable, type FirebaseStorage, type StorageReference } from 'firebase/storage'
import { FirebaseNotConfiguredError, getFirebaseStorage } from '../config/firebase'
import { getAudioDownloadUrl, uploadAudioRecording } from './audioStorage'
import { MAX_RECORDING_BYTES } from './recordingUploadFormat'
import { MockUploadTask } from '../test/uploadMocks'

vi.mock('firebase/app', () => ({ getApps: vi.fn(), initializeApp: vi.fn() }))
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(), ref: vi.fn(), getDownloadURL: vi.fn(), uploadBytesResumable: vi.fn() }))

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

describe('uploadAudioRecording', () => {
  let tasks: MockUploadTask[]
  beforeEach(() => {
    tasks = []
    vi.mocked(ref).mockImplementation((_storage, path) => ({ fullPath: path, name: path?.split('/').pop() }) as StorageReference)
    vi.mocked(uploadBytesResumable).mockImplementation((reference, blob, metadata) => {
      const task = new MockUploadTask(reference, blob as Blob, metadata)
      tasks.push(task)
      return task.sdkTask()
    })
  })

  it.each([
    ['audio/webm;codecs=opus', 'webm'], ['audio/mp4;codecs=mp4a.40.2', 'm4a'],
    ['audio/ogg', 'ogg'], ['audio/wav', 'wav'], ['audio/mpeg', 'mp3'], ['audio/aac', 'aac'],
  ])('uploads %s with a matching extension and original Content Type', async (mimeType, extension) => {
    const blob = new Blob(['audio'], { type: mimeType })
    const operation = uploadAudioRecording(blob, vi.fn())
    expect(tasks[0].snapshot.ref.fullPath).toMatch(new RegExp(`^recordings/recording-.+\\.${extension}$`))
    expect(uploadBytesResumable).toHaveBeenCalledWith(expect.anything(), blob, { contentType: mimeType })
    tasks[0].complete()
    await expect(operation.promise).resolves.toEqual({ id: tasks[0].snapshot.ref.fullPath,
      name: tasks[0].snapshot.metadata.name, uploadedAt: tasks[0].snapshot.metadata.timeCreated })
    expect(tasks[0].unsubscribe).toHaveBeenCalled()
  })

  it('reports progress and remains pending until completion', async () => {
    const progress = vi.fn()
    const operation = uploadAudioRecording(new Blob(['1234567890'], { type: 'audio/webm' }), progress)
    tasks[0].progress(5)
    expect(progress).toHaveBeenLastCalledWith(50)
    tasks[0].progress(10)
    expect(progress).toHaveBeenLastCalledWith(100)
    tasks[0].complete()
    await operation.promise
  })

  it('reuses in-flight and successful operations for the same Blob', async () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' })
    const first = uploadAudioRecording(blob, vi.fn())
    expect(uploadAudioRecording(blob, vi.fn())).toBe(first)
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
    tasks[0].complete()
    await first.promise
    expect(uploadAudioRecording(blob, vi.fn())).toBe(first)
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
  })

  it('propagates upload failure and retries using the original path', async () => {
    const blob = new Blob(['audio'], { type: 'audio/mp4' })
    const first = uploadAudioRecording(blob, vi.fn())
    const failure = new Error('storage/unauthorized')
    tasks[0].fail(failure)
    await expect(first.promise).rejects.toBe(failure)
    expect(tasks[0].unsubscribe).toHaveBeenCalled()
    const retry = uploadAudioRecording(blob, vi.fn())
    expect(tasks[1].snapshot.ref.fullPath).toBe(tasks[0].snapshot.ref.fullPath)
    tasks[1].complete()
    await retry.promise
  })

  it('creates unique paths for distinct recordings', async () => {
    const one = uploadAudioRecording(new Blob(['one'], { type: 'audio/webm' }), vi.fn())
    const two = uploadAudioRecording(new Blob(['two'], { type: 'audio/webm' }), vi.fn())
    expect(tasks[0].snapshot.ref.fullPath).not.toBe(tasks[1].snapshot.ref.fullPath)
    tasks.forEach((task) => task.complete())
    await Promise.all([one.promise, two.promise])
  })

  it('cancels the SDK task, unsubscribes and rejects the pending operation', async () => {
    const operation = uploadAudioRecording(new Blob(['audio'], { type: 'audio/webm' }), vi.fn())
    operation.cancel()
    await expect(operation.promise).rejects.toMatchObject({ code: 'storage/canceled' })
    expect(tasks[0].cancel).toHaveBeenCalledTimes(1)
    expect(tasks[0].unsubscribe).toHaveBeenCalled()
  })

  it('rejects empty, oversized and unsupported files before invoking the SDK', () => {
    expect(() => uploadAudioRecording(new Blob([], { type: 'audio/webm' }), vi.fn())).toThrow('Empty recordings')
    expect(() => uploadAudioRecording(new Blob([new Uint8Array(MAX_RECORDING_BYTES + 1)], { type: 'audio/webm' }), vi.fn())).toThrow('10 MiB')
    expect(() => uploadAudioRecording(new Blob(['text'], { type: 'text/plain' }), vi.fn())).toThrow('This recording format')
    expect(uploadBytesResumable).not.toHaveBeenCalled()
  })

  it('handles missing Firebase configuration without creating a task', () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    expect(() => uploadAudioRecording(new Blob(['audio'], { type: 'audio/webm' }), vi.fn())).toThrow(FirebaseNotConfiguredError)
    expect(uploadBytesResumable).not.toHaveBeenCalled()
  })
})
