import { collection, getDocs, query, where, orderBy, Timestamp, serverTimestamp, setDoc, doc, getDoc, getFirestore, type Firestore, type DocumentSnapshot, type QuerySnapshot } from 'firebase/firestore'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getDownloadURL, getMetadata, getStorage, ref, uploadBytesResumable, type FirebaseStorage, type FullMetadata, type StorageReference } from 'firebase/storage'
import App from './App'
import { useAudioUpload } from './hooks/useAudioUpload'
import { installMediaMocks, type MockAudio } from './test/mediaMocks'
import { installRecorderMocks, makeMockStream } from './test/recorderMocks'
import { MockUploadTask } from './test/uploadMocks'

// Only platform/SDK boundaries are mocked; production services and hooks run.
vi.mock('firebase/firestore', async (importOriginal) => ({ ...await importOriginal<typeof import('firebase/firestore')>(), setDoc: vi.fn(), serverTimestamp: vi.fn(), collection: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), getFirestore: vi.fn(), doc: vi.fn(), getDoc: vi.fn() }))
vi.mock('firebase/app', () => ({ getApps: vi.fn(), initializeApp: vi.fn() }))
vi.mock('firebase/storage', () => ({ getMetadata: vi.fn(), getStorage: vi.fn(), ref: vi.fn(), getDownloadURL: vi.fn(), uploadBytesResumable: vi.fn() }))
let recorder: ReturnType<typeof installRecorderMocks>
let audio: MockAudio[]
let tasks: MockUploadTask[]
let stored: Map<string, FullMetadata>
let documents: { id: string; data: () => Record<string, unknown> }[]

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '/?groupId=group-a')
  vi.mocked(getFirestore).mockReturnValue({} as Firestore)
  let nextAudioId = 0
  vi.mocked(doc).mockImplementation((...args: unknown[]) => ({ id: typeof args[2] === 'string' ? args[2] : `audio-${++nextAudioId}` }) as ReturnType<typeof doc>)
  vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ name: 'Group A', isActive: true }) } as unknown as DocumentSnapshot)
  recorder = installRecorderMocks()
  audio = installMediaMocks()
  tasks = []
  stored = new Map()
  documents = []
  vi.mocked(serverTimestamp).mockReturnValue({} as ReturnType<typeof serverTimestamp>)
  vi.mocked(setDoc).mockImplementation(async (reference, value, options) => {
    const previous = documents.find((entry) => entry.id === reference.id)
    const data = { ...(options && previous ? previous.data() : {}), ...value as Record<string, unknown>,
      uploadedAt: Timestamp.fromDate(new Date('2026-10-19T12:00:00Z')) }
    if (previous) documents.splice(documents.indexOf(previous), 1)
    documents.push({ id: reference.id, data: () => data })
  })
  vi.mocked(getMetadata).mockImplementation(async (reference) => {
    const metadata = stored.get(reference.fullPath)
    if (!metadata) throw Object.assign(new Error('not found'), { code: 'storage/object-not-found' })
    return metadata
  })
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
  await waitFor(() => expect(tasks.length).toBeGreaterThan(index))
  await act(async () => {
    const task = tasks[index]
    stored.set(task.snapshot.ref.fullPath, task.snapshot.metadata)
    task.complete()
  })
}

describe('Group recording, upload and Firestore playback integration', () => {
  it('records, previews, uploads metadata and refreshes the current group library for playback', async () => {
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
    const fileName = tasks[0].snapshot.ref.name
    await user.click(await screen.findByRole('button', { name: `Play ${fileName}` }))
    await waitFor(() => expect(audio[1].play).toHaveBeenCalledTimes(1))
    expect(audio[1].src).toBe(`https://audio.test/${tasks[0].snapshot.ref.fullPath}`)
    expect(documents).toHaveLength(1)
    expect(documents[0].data()).toMatchObject({ groupId: 'group-a', status: 'ready' })
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
    await waitFor(() => expect(uploadBytesResumable).toHaveBeenCalledTimes(1))
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
    const { result } = renderHook(() => useAudioUpload(recording, 'group-a'))
    act(() => { result.current.upload(); result.current.upload() })
    await waitFor(() => expect(uploadBytesResumable).toHaveBeenCalledTimes(1))
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


function registerAudio(groupId: string, id = 'shared-id', fileName = `${groupId}.wav`) {
  const path = `recordings/${groupId}/${id}.wav`
  documents.push({ id, data: () => ({ groupId, fileName, storagePath: path,
    contentType: 'audio/wav', size: 1024, status: 'ready', uploadedAt: Timestamp.fromDate(new Date('2026-10-17T12:00:00Z')) }) })
  return path
}
function changeGroup(groupId: string, replace = false) {
  act(() => window.history[replace ? 'replaceState' : 'pushState'](null, '', `/?groupId=${groupId}`))
}

describe('group and page lifecycle integration with mocked Firebase/media APIs', () => {
  it('stops group A playback and selects group B by Storage path, even with the same document ID', async () => {
    const pathA = registerAudio('group-a')
    const pathB = registerAudio('group-b')
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Play group-a.wav' }))
    await waitFor(() => expect(audio[0].play).toHaveBeenCalledTimes(1))
    expect(getDownloadURL).toHaveBeenCalledWith(expect.objectContaining({ fullPath: pathA }))
    changeGroup('group-b')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(audio[0].pause).toHaveBeenCalled()
    expect(audio[0].removeEventListener).toHaveBeenCalledTimes(7)
    expect(audio[0].src).toBe('')
    await user.click(await screen.findByRole('button', { name: 'Play group-b.wav' }))
    await waitFor(() => expect(audio[1].play).toHaveBeenCalledTimes(1))
    expect(audio[1].src).toBe(`https://audio.test/${pathB}`)
    expect(screen.queryByRole('button', { name: 'Play group-a.wav' })).not.toBeInTheDocument()
    act(() => audio[0].dispatchEvent(new Event('error')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores an old Download URL after replacing the URL group', async () => {
    registerAudio('group-a')
    registerAudio('group-b')
    let finish!: (value: string) => void
    vi.mocked(getDownloadURL).mockReturnValueOnce(new Promise((done) => { finish = done }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Play group-a.wav' }))
    changeGroup('group-b', true)
    await user.click(await screen.findByRole('button', { name: 'Play group-b.wav' }))
    await waitFor(() => expect(audio[1].play).toHaveBeenCalledTimes(1))
    await act(async () => finish('https://audio.test/stale-group-a.wav'))
    expect(audio[0].play).not.toHaveBeenCalled()
    expect(audio[0].src).toBe('')
    expect(screen.getByRole('dialog', { name: 'group-b.wav' })).toBeInTheDocument()
  })

  it('ignores a late Firestore list from the old group', async () => {
    registerAudio('group-a')
    registerAudio('group-b')
    let finish!: (value: QuerySnapshot) => void
    vi.mocked(getDocs).mockReturnValueOnce(new Promise((done) => { finish = done }))
    render(<App />)
    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1))
    changeGroup('group-b')
    expect(await screen.findByRole('button', { name: 'Play group-b.wav' })).toBeInTheDocument()
    await act(async () => finish({ docs: documents } as unknown as QuerySnapshot))
    expect(screen.queryByRole('button', { name: 'Play group-a.wav' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play group-b.wav' })).toBeInTheDocument()
  })

  it('handles browser Back and Forward without restoring a previous selection', async () => {
    registerAudio('group-a')
    registerAudio('group-b')
    render(<App />)
    await screen.findByRole('button', { name: 'Play group-a.wav' })
    changeGroup('group-b')
    await screen.findByRole('button', { name: 'Play group-b.wav' })
    act(() => window.history.back())
    await screen.findByRole('button', { name: 'Play group-a.wav' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => window.history.forward())
    await screen.findByRole('button', { name: 'Play group-b.wav' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stops recording, microphone tracks and recorder listeners on a group change', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/No recordings yet/)
    await user.click(screen.getByRole('button', { name: 'Record' }))
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    const previous = recorder.instances[0]
    changeGroup('group-b')
    expect(previous.stop).toHaveBeenCalledTimes(1)
    expect(previous.removeEventListener).toHaveBeenCalledTimes(4)
    expect(recorder.streams[0].track.stop).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('timer')).toHaveTextContent('00:00')
    expect(screen.queryByRole('button', { name: 'Stop recording' })).not.toBeInTheDocument()
    act(() => { previous.emitData(new Blob(['late data'])); previous.dispatchEvent(new Event('stop')) })
    expect(recorder.createObjectURL).not.toHaveBeenCalled()
    await waitFor(() => expect(getDoc).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled()
  })

  it('releases a microphone grant that arrives after a group change', async () => {
    let finish!: (stream: MediaStream) => void
    recorder.getUserMedia.mockReturnValueOnce(new Promise((done) => { finish = done }))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/No recordings yet/)
    await user.click(screen.getByRole('button', { name: 'Record' }))
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    changeGroup('group-b')
    const late = makeMockStream()
    await act(async () => finish(late.stream as unknown as MediaStream))
    expect(late.track.stop).toHaveBeenCalledTimes(1)
    expect(recorder.instances).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled()
  })

  it('releases preview audio and its Object URL even when play settles after changing groups', async () => {
    const user = await recordToReady()
    let finish!: () => void
    audio[0].play.mockImplementationOnce(() => new Promise<void>((done) => { finish = () => { audio[0].paused = false; done() } }))
    await user.click(screen.getByRole('button', { name: 'Play preview' }))
    changeGroup('group-b')
    expect(audio[0].removeEventListener).toHaveBeenCalledTimes(4)
    expect(recorder.revokeObjectURL).toHaveBeenCalledWith('blob:recording-1')
    await act(async () => finish())
    expect(audio[0].paused).toBe(true)
    expect(audio[0].src).toBe('')
    expect(screen.queryByRole('button', { name: 'Play preview' })).not.toBeInTheDocument()
  })

  it('cancels the old upload and discards progress, completion and recording on a group change', async () => {
    const user = await recordToReady()
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    const old = tasks[0]
    changeGroup('group-b')
    expect(old.cancel).toHaveBeenCalledTimes(1)
    expect(old.unsubscribe).toHaveBeenCalled()
    await act(async () => { old.on.mock.calls[0][1](old.snapshot); old.on.mock.calls[0][3]() })
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/Upload complete/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Uploaded' })).not.toBeInTheDocument()
    await waitFor(() => expect(getDoc).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    await user.click(screen.getByRole('button', { name: 'Stop recording' }))
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
  })

  it('clears uploaded status after a group change', async () => {
    const user = await recordToReady()
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await finishUpload()
    expect(screen.getByRole('button', { name: 'Uploaded' })).toBeDisabled()
    changeGroup('group-b')
    expect(screen.queryByRole('button', { name: 'Uploaded' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeInTheDocument()
  })

  it('releases a player on pagehide and revalidates the group on cached-page restore', async () => {
    registerAudio('group-a')
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Play group-a.wav' }))
    await waitFor(() => expect(audio[0].play).toHaveBeenCalledTimes(1))
    act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    expect(audio[0].src).toBe('')
    expect(audio[0].removeEventListener).toHaveBeenCalledTimes(7)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play group-a.wav' })).not.toBeInTheDocument()
    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await screen.findByRole('button', { name: 'Play group-a.wav' })
    expect(getDoc).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(audio).toHaveLength(1)
  })
})


it('clears a canceled upload state on pagehide and supports a fresh request after returning', async () => {
  const recording = { blob: new Blob(['audio'], { type: 'audio/webm' }), url: 'blob:test', mimeType: 'audio/webm' }
  const { result } = renderHook(() => useAudioUpload(recording, 'group-a'))
  act(() => result.current.upload())
  expect(result.current.status).toBe('uploading')
  await waitFor(() => expect(tasks).toHaveLength(1))
  await act(async () => window.dispatchEvent(new Event('pagehide')))
  expect(tasks[0].cancel).toHaveBeenCalledTimes(1)
  expect(result.current.status).toBe('idle')
  expect(result.current.progress).toBe(0)
  act(() => result.current.upload())
  await waitFor(() => expect(tasks).toHaveLength(2))
  await finishUpload(1)
  expect(result.current.status).toBe('success')
})

it('shows finalization failure without success and retries metadata without resending the audio', async () => {
  const user = await recordToReady()
  const write = vi.mocked(setDoc).getMockImplementation()!
  vi.mocked(setDoc).mockImplementationOnce(write).mockRejectedValueOnce(new Error('permission-denied'))
  await user.click(screen.getByRole('button', { name: 'Upload' }))
  await finishUpload()
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be finalized')
  expect(screen.queryByText(/Upload complete/)).not.toBeInTheDocument()
  expect(documents[0].data().status).toBe('pending')
  expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Upload' }))
  expect(await screen.findByRole('button', { name: 'Uploaded' })).toBeDisabled()
  expect(uploadBytesResumable).toHaveBeenCalledTimes(1)
  expect(documents).toHaveLength(1)
  expect(documents[0].data().status).toBe('ready')
  await user.click(screen.getByRole('button', { name: 'Play' }))
  expect(await screen.findByRole('button', { name: `Play ${tasks[0].snapshot.ref.name}` })).toBeInTheDocument()
})

it('keeps Upload in progress at 100% until Firestore acknowledges ready', async () => {
  const user = await recordToReady()
  const write = vi.mocked(setDoc).getMockImplementation()!
  let finish!: () => void
  vi.mocked(setDoc).mockImplementationOnce(write).mockImplementationOnce((...args) => new Promise<void>((done) => {
    finish = () => { void write(...args).then(done) }
  }))
  await user.click(screen.getByRole('button', { name: 'Upload' }))
  await finishUpload()
  expect(screen.getByRole('button', { name: 'Uploading' })).toBeDisabled()
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '100')
  expect(documents[0].data().status).toBe('pending')
  expect(screen.queryByText(/Upload complete/)).not.toBeInTheDocument()
  await act(async () => finish())
  expect(await screen.findByRole('button', { name: 'Uploaded' })).toBeDisabled()
})

it('shows preparation failure without sending the file and permits retry', async () => {
  const user = await recordToReady()
  vi.mocked(setDoc).mockRejectedValueOnce(new Error('permission-denied'))
  await user.click(screen.getByRole('button', { name: 'Upload' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to prepare the audio library entry')
  expect(uploadBytesResumable).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Upload' }))
  await finishUpload()
  expect(await screen.findByRole('button', { name: 'Uploaded' })).toBeDisabled()
})
