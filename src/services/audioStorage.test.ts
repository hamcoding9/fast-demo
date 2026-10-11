import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getDownloadURL, getMetadata, getStorage, listAll, ref, type FirebaseStorage, type FullMetadata, type StorageReference } from 'firebase/storage'
import { FirebaseNotConfiguredError, getFirebaseStorage } from '../config/firebase'
import { getAudioDownloadUrl, listAudioFiles } from './audioStorage'

vi.mock('firebase/app', () => ({ getApps: vi.fn(), initializeApp: vi.fn() }))
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(), ref: vi.fn(), listAll: vi.fn(), getMetadata: vi.fn(), getDownloadURL: vi.fn() }))

const storage = {} as FirebaseStorage
const app = { name: 'fast-demo' } as FirebaseApp
const folder = { fullPath: 'recordings/' } as StorageReference
const requiredEnv = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_APP_ID'] as const

function file(name: string, timeCreated: string, contentType?: string): FullMetadata {
  return { name, fullPath: `recordings/${name}`, timeCreated, contentType } as FullMetadata
}

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
    await expect(listAudioFiles()).rejects.toBeInstanceOf(FirebaseNotConfiguredError)
    expect(initializeApp).not.toHaveBeenCalled()
    expect(getStorage).not.toHaveBeenCalled()
    expect(listAll).not.toHaveBeenCalled()
  })

  it('handles a completely empty Firebase configuration', async () => {
    requiredEnv.forEach((key) => vi.stubEnv(key, ''))
    await expect(listAudioFiles()).rejects.toThrow('Firebase 설정이 필요합니다')
    expect(listAll).not.toHaveBeenCalled()
  })
})

describe('listAudioFiles', () => {
  it('reads recordings/ metadata and returns audio names and upload dates, newest first', async () => {
    const older = { fullPath: 'recordings/older.wav' } as StorageReference
    const newer = { fullPath: 'recordings/newer.mp3' } as StorageReference
    vi.mocked(listAll).mockResolvedValue({ items: [older, newer], prefixes: [] })
    vi.mocked(getMetadata)
      .mockResolvedValueOnce(file('older.wav', '2026-10-01T08:00:00Z', 'audio/wav'))
      .mockResolvedValueOnce(file('newer.mp3', '2026-10-02T08:00:00Z', 'audio/mpeg'))
    await expect(listAudioFiles()).resolves.toEqual([
      { id: 'recordings/newer.mp3', name: 'newer.mp3', uploadedAt: '2026-10-02T08:00:00Z' },
      { id: 'recordings/older.wav', name: 'older.wav', uploadedAt: '2026-10-01T08:00:00Z' },
    ])
    expect(ref).toHaveBeenCalledWith(storage, 'recordings/')
    expect(getMetadata).toHaveBeenCalledWith(older)
    expect(getMetadata).toHaveBeenCalledWith(newer)
  })

  it('returns an empty list for an empty folder', async () => {
    vi.mocked(listAll).mockResolvedValue({ items: [], prefixes: [] })
    await expect(listAudioFiles()).resolves.toEqual([])
    expect(getMetadata).not.toHaveBeenCalled()
  })

  it('filters non-audio files and recognizes generic audio uploads', async () => {
    const entries = [
      file('readme.txt', '2026-10-01T00:00:00Z', 'text/plain'),
      file('memo.m4a', '2026-10-01T00:00:00Z', 'application/octet-stream'),
      file('recording.webm', '2026-10-01T00:00:00Z', 'video/webm'),
      file('voice.ogg', '2026-10-01T00:00:00Z'),
    ]
    vi.mocked(listAll).mockResolvedValue({ items: entries.map((entry) => ({ fullPath: entry.fullPath }) as StorageReference), prefixes: [] })
    entries.forEach((entry) => vi.mocked(getMetadata).mockResolvedValueOnce(entry))
    const result = await listAudioFiles()
    expect(result.map((audio) => audio.name)).toEqual(['memo.m4a', 'recording.webm', 'voice.ogg'])
  })

  it('propagates a Storage list API error', async () => {
    const error = new Error('storage/unauthorized')
    vi.mocked(listAll).mockRejectedValue(error)
    await expect(listAudioFiles()).rejects.toBe(error)
    expect(getMetadata).not.toHaveBeenCalled()
  })

  it('propagates a metadata API error rather than silently showing a partial list', async () => {
    vi.mocked(listAll).mockResolvedValue({ items: [folder], prefixes: [] })
    vi.mocked(getMetadata).mockRejectedValue(new Error('storage/object-not-found'))
    await expect(listAudioFiles()).rejects.toThrow('storage/object-not-found')
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
