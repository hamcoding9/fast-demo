import { collection, getDocs, query, where, orderBy, Timestamp, doc, getDoc, getFirestore, type Firestore, type DocumentSnapshot, type QuerySnapshot } from 'firebase/firestore'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getDownloadURL, getStorage, ref, uploadBytesResumable, type FirebaseStorage, type FullMetadata, type StorageReference } from 'firebase/storage'
import App from './App'
import { useAudioUpload } from './hooks/useAudioUpload'
import { installMediaMocks, type MockAudio } from './test/mediaMocks'
import { installRecorderMocks } from './test/recorderMocks'
import { MockUploadTask } from './test/uploadMocks'

// Only platform/SDK boundaries are mocked; production services and hooks run.
vi.mock('firebase/firestore', async (importOriginal) => ({ ...await importOriginal<typeof import('firebase/firestore')>(), collection: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), getFirestore: vi.fn(), doc: vi.fn(), getDoc: vi.fn() }))
vi.mock('firebase/app', () => ({ getApps: vi.fn(), initializeApp: vi.fn() }))
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(), ref: vi.fn(), getDownloadURL: vi.fn(), uploadBytesResumable: vi.fn() }))
let recorder: ReturnType<typeof installRecorderMocks>
let audio: MockAudio[]
let tasks: MockUploadTask[]
let stored: Map<string, FullMetadata>
let documents: { id: string; data: () => Record<string, unknown> }[]

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '/?groupId=group-a')
  vi.mocked(getFirestore).mockReturnValue({} as Firestore)
  vi.mocked(doc).mockReturnValue({} as ReturnType<typeof doc>)
  vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group A', isActive: true }) } as unknown as DocumentSnapshot)
  recorder = installRecorderMocks()
  audio = installMediaMocks()
  tasks = []
  stored = new Map()
  documents = []
  vi.mocked(collection).mockReturnValue({} as ReturnType<typeof collection>)
  vi.mocked(query).mockReturnValue({} as ReturnType<typeof query>)
  vi.mocked(where).mockReturnValue({} as ReturnType<typeof where>)
  vi.mocked(orderBy).mockReturnValue({} as ReturnType<typeof orderBy>)
  vi.mocked(getDocs).mockImplementation(async () => ({ docs: documents }) as unknown as QuerySnapshot)
  for (const name of ['API_KEY', 'PROJECT_ID', 'STORAGE_BUCKET', 'APP_ID']) vi.stubEnv(`VITE_FIREBASE_${name}`, `integration-test-${name}`)
  vi.mocked(getApps).mockReturnValue([])
  vi.mocked(initializeApp).mockReturnValue({ name: 'fast-demo' } as FirebaseApp)
  vi.mocked(getStorage).mockReturnValue({} as FirebaseStorage)
  vi.mocked(ref).mockImplementation((_storage, path) => ({ fullPath: path, name: path?.split('/').pop() }) as StorageReference)
  vi.mocked(getDownloadURL).mockImplementation(async (reference) => `https://audio.test/${reference.fullPath}`)
  vi.mocked(uploadBytesResumable).mockImplementation((reference, blob, metadata) => {
    const task = new MockUploadTask(reference, blob as Blob, metadata)
    tasks.push(task)
    return task.sdkTask()
  })
})
afterEach(() => {
  cleanup()
  recorder.restore()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function recordToReady() {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText(/No recordings yet/)
  await user.click(screen.getByRole('button', { name: 'Record' }))
  await user.click(screen.getByRole('button', { name: 'Start recording' }))
  await user.click(screen.getByRole('button', { name: 'Stop recording' }))
  return user
}
async function finishUpload(index = 0) {
  await act(async () => {
    const task = tasks[index]
    stored.set(task.snapshot.ref.fullPath, task.snapshot.metadata)
    task.complete()
  })
}

describe('Recording, legacy upload and Firestore playback integration', () => {
  it('records, previews and uploads without synthesizing Firestore metadata before Step 4', async () => {
    const user = await recordToReady()
    await user.click(screen.getByRole('button', { name: 'Play preview' }))
    expect(audio[0].play).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    act(() => tasks[0].progress(tasks[0].snapshot.totalBytes / 2))
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute('value', '50')
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record again' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Uploading' })).toBeDisabled()
    await finishUpload()
    expect(screen.getByText(/Upload complete/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uploaded' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(audio[0].pause).toHaveBeenCalled()
    expect(recorder.revokeObjectURL).toHaveBeenCalled()
    expect(await screen.findByText(/No recordings yet/)).toBeInTheDocument()
    expect(documents).toHaveLength(0)
    expect(stored.size).toBe(1)
    expect(getDocs).toHaveBeenCalledTimes(2)
  })

  it('lists a manually registered Firestore document and plays its independent Storage path', async () => {
    const path = 'recordings/group-a/manual-audio.wav'
    documents.push({ id: 'firestore-document-id', data: () => ({ groupId: 'group-a', fileName: 'Demo recording.wav',
      storagePath: path, contentType: 'audio/wav', size: 1024, status: 'ready', uploadedAt: Timestamp.fromDate(new Date('2026-10-17T12:00:00Z')) }) })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Play Demo recording.wav' }))
    expect(screen.getByRole('dialog', { name: 'Demo recording.wav' })).toBeInTheDocument()
    await waitFor(() => expect(audio[0].play).toHaveBeenCalledTimes(1))
    expect(getDownloadURL).toHaveBeenCalledWith(expect.objectContaining({ fullPath: path }))
    expect(audio[0].src).toBe(`https://audio.test/${path}`)
    expect(where).toHaveBeenCalledWith('groupId', '==', 'group-a')
  })

  it('shows upload failure and retries the same recording without duplicating paths', async () => {
    const user = await recordToReady()
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await act(async () => tasks[0].fail({ code: 'storage/unauthorized' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Upload permission denied')
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(tasks[1].snapshot.ref.fullPath).toBe(tasks[0].snapshot.ref.fullPath)
    await finishUpload(1)
    expect(screen.getByRole('button', { name: 'Uploaded' })).toBeDisabled()
    expect(stored.size).toBe(1)
  })

  it('prevents repeated uploads while pending and after success, then allows a new recording', async () => {
    const user = await recordToReady()
    await user.dblClick(screen.getByRole('button', { name: 'Upload' }))
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
    await finishUpload()
    await user.click(screen.getByRole('button', { name: 'Uploaded' }))
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Record again' }))
    await user.click(screen.getByRole('button', { name: 'Stop recording' }))
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(uploadBytesResumable).toHaveBeenCalledTimes(2)
    expect(tasks[1].snapshot.ref.fullPath).not.toBe(tasks[0].snapshot.ref.fullPath)
    await finishUpload(1)
  })

  it('cancels an in-flight upload and removes its listener on navigation', async () => {
    const user = await recordToReady()
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(tasks[0].cancel).toHaveBeenCalledTimes(1)
    expect(tasks[0].unsubscribe).toHaveBeenCalled()
    expect(await screen.findByText(/No recordings yet/)).toBeInTheDocument()
    expect(stored.size).toBe(0)
  })

  it('shows configuration guidance for Upload without crashing Record or Navigation', async () => {
    const user = await recordToReady()
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Firebase configuration is required')
    expect(uploadBytesResumable).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(await screen.findByText(/Firebase configuration is required/)).toBeInTheDocument()
  })

  it('prevents duplicate requests before React rerenders and after completion', async () => {
    const recording = { blob: new Blob(['audio'], { type: 'audio/webm' }), url: 'blob:test', mimeType: 'audio/webm' }
    const { result } = renderHook(() => useAudioUpload(recording))
    act(() => { result.current.upload(); result.current.upload() })
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
    await finishUpload()
    act(() => result.current.upload())
    expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('success')
    expect(result.current.progress).toBe(100)
  })

  it('cancels upload on pagehide and ignores late completion', async () => {
    const user = await recordToReady()
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await act(async () => window.dispatchEvent(new Event('pagehide')))
    expect(tasks[0].cancel).toHaveBeenCalledTimes(1)
    act(() => tasks[0].complete())
    expect(screen.queryByText(/Upload complete/)).not.toBeInTheDocument()
  })
})
