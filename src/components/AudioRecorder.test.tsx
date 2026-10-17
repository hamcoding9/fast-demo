import { getGroup } from '../services/groups'
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useAudioUpload } from '../hooks/useAudioUpload'
import { uploadAudioRecording } from '../services/audioStorage'
import { listAudioFiles } from '../services/audios'
import { installMediaMocks, type MockAudio } from '../test/mediaMocks'
import { installRecorderMocks } from '../test/recorderMocks'
import { AudioRecorder } from './AudioRecorder'

vi.mock('../services/audios', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/audios')>(), listAudioFiles: vi.fn() }))
vi.mock('../services/audioStorage', () => ({ getAudioDownloadUrl: vi.fn(), uploadAudioRecording: vi.fn() }))
let mocks: ReturnType<typeof installRecorderMocks>
let previews: MockAudio[]
vi.mock('../services/groups', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/groups')>(), getGroup: vi.fn() }))
beforeEach(() => {
  window.history.replaceState(null, '', '/?groupId=group-a')
  vi.mocked(getGroup).mockReset().mockResolvedValue({ id: 'group-a', name: 'Group A', isActive: true })
  mocks = installRecorderMocks()
  previews = installMediaMocks()
  vi.mocked(listAudioFiles).mockReset().mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  mocks.restore()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('recorder UI', () => {
  it('shows recording status, stop, preview, re-record and enabled upload controls', async () => {
    const user = userEvent.setup()
    render(<AudioRecorder />)
    expect(screen.getByRole('status')).toHaveTextContent('Ready to record')
    expect(screen.getByRole('timer', { name: 'Recording time' })).toHaveTextContent('00:00')
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    expect(screen.getByRole('status')).toHaveTextContent('Recording')
    await user.click(screen.getByRole('button', { name: 'Stop recording' }))
    expect(screen.getByRole('status')).toHaveTextContent('Recording complete')
    await user.click(screen.getByRole('button', { name: 'Play preview' }))
    expect(previews[0].play).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Pause preview' }))
    expect(previews[0].pause).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Record again' }))
    expect(screen.getByRole('status')).toHaveTextContent('Recording')
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument()
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:recording-1')
  })

  it('displays a permission error and keeps retry available', async () => {
    const user = userEvent.setup()
    mocks.getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    render(<AudioRecorder />)
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Microphone access was denied')
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled()
  })

  it('displays unsupported guidance and disables start', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    render(<AudioRecorder />)
    expect(screen.getByRole('alert')).toHaveTextContent('HTTPS or localhost')
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeDisabled()
  })

  it('disables start while microphone permission is pending', async () => {
    const user = userEvent.setup()
    mocks.getUserMedia.mockReturnValue(new Promise(() => {}))
    render(<AudioRecorder />)
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    expect(screen.getByRole('status')).toHaveTextContent('Requesting microphone access')
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeDisabled()
  })

  it('stops recording when navigating back to Play without changing Firebase listing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/No recordings yet/)
    await user.click(screen.getByRole('button', { name: 'Record' }))
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(mocks.instances[0].stop).toHaveBeenCalled()
    expect(mocks.streams[0].track.stop).toHaveBeenCalled()
    expect(mocks.createObjectURL).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'My Audio' })).toBeInTheDocument()
    expect(await screen.findByText(/No recordings yet/)).toBeInTheDocument()
    expect(listAudioFiles).toHaveBeenCalledTimes(2)
  })

  it('stops preview and revokes its URL on navigation to Play', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Record' }))
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    await user.click(screen.getByRole('button', { name: 'Stop recording' }))
    await user.click(screen.getByRole('button', { name: 'Play preview' }))
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(previews[0].pause).toHaveBeenCalled()
    expect(previews[0].src).toBe('')
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:recording-1')
  })
})


it('keeps local recording and preview available but blocks upload without a verified group', async () => {
  window.history.replaceState(null, '', '/')
  const user = userEvent.setup()
  vi.mocked(uploadAudioRecording).mockClear()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Record' }))
  await user.click(screen.getByRole('button', { name: 'Start recording' }))
  await user.click(screen.getByRole('button', { name: 'Stop recording' }))
  await user.click(screen.getByRole('button', { name: 'Play preview' }))
  expect(previews[0].play).toHaveBeenCalled()
  const upload = screen.getByRole('button', { name: 'Upload' })
  expect(upload).toBeDisabled()
  await user.click(upload)
  expect(uploadAudioRecording).not.toHaveBeenCalled()
  expect(listAudioFiles).not.toHaveBeenCalled()
})

it('guards upload calls at the hook boundary when disabled', () => {
  vi.mocked(uploadAudioRecording).mockClear()
  const recording = { blob: new Blob(['audio'], { type: 'audio/webm' }), url: 'blob:test', mimeType: 'audio/webm' }
  const { result } = renderHook(() => useAudioUpload(recording, false))
  act(() => result.current.upload())
  expect(uploadAudioRecording).not.toHaveBeenCalled()
  expect(result.current.status).toBe('idle')
})
