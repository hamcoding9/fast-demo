import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { doc, getDoc, getFirestore, type DocumentSnapshot, type Firestore } from 'firebase/firestore'
import { FirebaseNotConfiguredError } from '../config/firebase'
import { getGroup, isValidGroupId } from './groups'

vi.mock('firebase/app', () => ({ getApps: vi.fn(), initializeApp: vi.fn() }))
vi.mock('firebase/firestore', () => ({ getFirestore: vi.fn(), doc: vi.fn(), getDoc: vi.fn() }))

function snapshot(data?: Record<string, unknown>) {
  return { exists: () => data !== undefined, data: () => data } as unknown as DocumentSnapshot
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  for (const name of ['API_KEY', 'PROJECT_ID', 'STORAGE_BUCKET', 'APP_ID']) vi.stubEnv(`VITE_FIREBASE_${name}`, `test-${name}`)
  vi.mocked(getApps).mockReturnValue([])
  vi.mocked(initializeApp).mockReturnValue({ name: 'fast-demo' } as FirebaseApp)
  vi.mocked(getFirestore).mockReturnValue({} as Firestore)
  vi.mocked(doc).mockReturnValue({} as ReturnType<typeof doc>)
})

describe('group lookup through Firestore SDK', () => {
  it('reads a top-level group and reuses the named Firebase app', async () => {
    const app = { name: 'fast-demo' } as FirebaseApp
    vi.mocked(getApps).mockReturnValue([app])
    vi.mocked(getDoc).mockResolvedValue(snapshot({ name: ' Group A ', isActive: true }))
    expect(await getGroup('group-a')).toEqual({ id: 'group-a', name: 'Group A', isActive: true })
    expect(doc).toHaveBeenCalledWith(expect.anything(), 'groups', 'group-a')
    expect(getDoc).toHaveBeenCalledTimes(1)
    expect(getFirestore).toHaveBeenCalledWith(app)
    expect(initializeApp).not.toHaveBeenCalled()
  })
  it('returns null for a missing group', async () => {
    vi.mocked(getDoc).mockResolvedValue(snapshot())
    expect(await getGroup('missing')).toBeNull()
  })
  it('returns the inactive state without creating or updating a group', async () => {
    vi.mocked(getDoc).mockResolvedValue(snapshot({ name: 'Inactive', isActive: false }))
    expect(await getGroup('inactive')).toEqual({ id: 'inactive', name: 'Inactive', isActive: false })
  })
  it.each([{}, { name: 'A' }, { name: ' ', isActive: true }, { name: 'A', isActive: 'true' }])('rejects malformed group data %j', async (data) => {
    vi.mocked(getDoc).mockResolvedValue(snapshot(data))
    await expect(getGroup('group-a')).rejects.toThrow('Invalid group document')
  })
  it('propagates permission and network errors', async () => {
    const error = new Error('permission-denied')
    vi.mocked(getDoc).mockRejectedValue(error)
    await expect(getGroup('group-a')).rejects.toBe(error)
  })
  it('provides configuration guidance before calling Firestore', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    await expect(getGroup('group-a')).rejects.toBeInstanceOf(FirebaseNotConfiguredError)
    expect(getDoc).not.toHaveBeenCalled()
  })
  it.each(['', '../other', 'a/b', 'group a', '-group', 'a'.repeat(129)])('rejects invalid IDs before calling Firebase: %s', async (id) => {
    expect(isValidGroupId(id)).toBe(false)
    await expect(getGroup(id)).rejects.toThrow('Invalid Group ID')
    expect(getFirestore).not.toHaveBeenCalled()
  })
})
