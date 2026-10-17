import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { collection, getDocs, getFirestore, orderBy, query, Timestamp, where, type Firestore, type QuerySnapshot } from 'firebase/firestore'
import { FirebaseNotConfiguredError } from '../config/firebase'
import { InvalidAudioMetadataError, listAudioFiles } from './audios'

vi.mock('firebase/app', () => ({ getApps: vi.fn(), initializeApp: vi.fn() }))
vi.mock('firebase/firestore', async (importOriginal) => ({ ...await importOriginal<typeof import('firebase/firestore')>(),
  getFirestore: vi.fn(), collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), getDocs: vi.fn() }))

const database = {} as Firestore
const fields = {
  groupId: 'group-a', fileName: 'Memo.wav', storagePath: 'recordings/group-a/file-one.wav',
  contentType: 'audio/wav', size: 1024, status: 'ready', uploadedAt: Timestamp.fromDate(new Date('2026-10-17T12:00:00Z')),
}
function results(entries: { id: string; fields: Record<string, unknown> }[]) {
  return { docs: entries.map((entry) => ({ id: entry.id, data: () => entry.fields })) } as unknown as QuerySnapshot
}
beforeEach(() => {
  vi.resetAllMocks()
  for (const name of ['API_KEY', 'PROJECT_ID', 'STORAGE_BUCKET', 'APP_ID']) vi.stubEnv(`VITE_FIREBASE_${name}`, `test-${name}`)
  vi.mocked(getApps).mockReturnValue([])
  vi.mocked(initializeApp).mockReturnValue({ name: 'fast-demo' } as FirebaseApp)
  vi.mocked(getFirestore).mockReturnValue(database)
  vi.mocked(collection).mockReturnValue({} as ReturnType<typeof collection>)
  vi.mocked(query).mockReturnValue({} as ReturnType<typeof query>)
  vi.mocked(where).mockReturnValue({} as ReturnType<typeof where>)
  vi.mocked(orderBy).mockReturnValue({} as ReturnType<typeof orderBy>)
})
afterEach(() => vi.unstubAllEnvs())

describe('Firestore audio listing', () => {
  it('queries the top-level audios collection for ready documents in this group, newest first', async () => {
    vi.mocked(getDocs).mockResolvedValue(results([
      { id: 'older-document', fields: { ...fields, uploadedAt: Timestamp.fromDate(new Date('2026-10-01T00:00:00Z')) } },
      { id: 'newer-document', fields },
    ]))
    const files = await listAudioFiles('group-a')
    expect(collection).toHaveBeenCalledWith(database, 'audios')
    expect(where).toHaveBeenNthCalledWith(1, 'groupId', '==', 'group-a')
    expect(where).toHaveBeenNthCalledWith(2, 'status', '==', 'ready')
    expect(orderBy).toHaveBeenCalledWith('uploadedAt', 'desc')
    expect(query).toHaveBeenCalledWith(vi.mocked(collection).mock.results[0].value,
      vi.mocked(where).mock.results[0].value, vi.mocked(where).mock.results[1].value, vi.mocked(orderBy).mock.results[0].value)
    expect(getDocs).toHaveBeenCalledWith(vi.mocked(query).mock.results[0].value)
    expect(files.map((file) => file.id)).toEqual(['newer-document', 'older-document'])
    expect(files[0]).toEqual({ id: 'newer-document', name: 'Memo.wav', groupId: 'group-a',
      storagePath: fields.storagePath, contentType: 'audio/wav', size: 1024, status: 'ready', uploadedAt: '2026-10-17T12:00:00.000Z' })
    expect(files[0].id).not.toBe(files[0].storagePath)
  })

  it('does not expose other groups or pending documents even if returned by the SDK', async () => {
    vi.mocked(getDocs).mockResolvedValue(results([
      { id: 'ready', fields },
      { id: 'other-group', fields: { ...fields, groupId: 'group-b' } },
      { id: 'pending', fields: { ...fields, status: 'pending' } },
    ]))
    expect((await listAudioFiles('group-a')).map((file) => file.id)).toEqual(['ready'])
  })

  it('returns an empty list', async () => {
    vi.mocked(getDocs).mockResolvedValue(results([]))
    expect(await listAudioFiles('group-a')).toEqual([])
  })

  it.each(['permission-denied', 'unavailable', 'failed-precondition'])('propagates %s errors without falling back to Storage', async (code) => {
    const error = Object.assign(new Error(code), { code })
    vi.mocked(getDocs).mockRejectedValue(error)
    await expect(listAudioFiles('group-a')).rejects.toBe(error)
    expect(getDocs).toHaveBeenCalledTimes(1)
  })

  it.each(['', 'group/a', '../other'])('rejects an invalid group ID %s before querying Firebase', async (id) => {
    await expect(listAudioFiles(id)).rejects.toThrow('Invalid Group ID')
    expect(getFirestore).not.toHaveBeenCalled()
    expect(getDocs).not.toHaveBeenCalled()
  })

  it('handles missing Firebase configuration', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    await expect(listAudioFiles('group-a')).rejects.toBeInstanceOf(FirebaseNotConfiguredError)
    expect(getDocs).not.toHaveBeenCalled()
  })

  it('allows an explicitly registered flat legacy Storage path without migrating files', async () => {
    vi.mocked(getDocs).mockResolvedValue(results([{ id: 'legacy', fields: { ...fields, storagePath: 'recordings/legacy.wav' } }]))
    expect((await listAudioFiles('group-a'))[0].storagePath).toBe('recordings/legacy.wav')
  })

  it.each([
    { fileName: '' }, { fileName: 123 }, { storagePath: 'recordings/group-b/other.wav' },
    { storagePath: 'recordings/../other.wav' }, { storagePath: 'https://example.com/file.wav' },
    { storagePath: 'recordings/' }, { contentType: 'text/plain' }, { size: 0 }, { size: -1 }, { size: 1.5 },
    { uploadedAt: null }, { uploadedAt: '2026-10-17' },
  ])('rejects invalid metadata %j rather than showing a partial list', async (override) => {
    vi.mocked(getDocs).mockResolvedValue(results([{ id: 'valid', fields }, { id: 'invalid', fields: { ...fields, ...override } }]))
    await expect(listAudioFiles('group-a')).rejects.toBeInstanceOf(InvalidAudioMetadataError)
  })
})
