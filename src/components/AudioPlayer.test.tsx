import { audioFixture } from '../test/audioFixtures'
import { getGroup } from '../services/groups'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAudioDownloadUrl } from '../services/audioStorage'
import { listAudioFiles } from '../services/audios'
import { installMediaMocks, type MockAudio } from '../test/mediaMocks'
import type { AudioFile } from '../types/audio'
import App from '../App'
import { AudioLibrary } from './AudioLibrary'
import { AudioPlayer } from './AudioPlayer'

vi.mock('../services/audios', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/audios')>(), listAudioFiles: vi.fn() }))
vi.mock('../services/audioStorage', () => ({ getAudioDownloadUrl: vi.fn(), uploadAudioRecording: vi.fn() }))
const files: AudioFile[] = [
  audioFixture({ id: 'doc-one.wav', name: 'one.wav', storagePath: 'recordings/group-a/one.wav', uploadedAt: '2026-10-11T12:00:00Z' }),
  audioFixture({ id: 'doc-two.mp3', name: 'two.mp3', storagePath: 'recordings/group-a/two.mp3', uploadedAt: '2026-10-10T12:00:00Z' }),
]
let instances: MockAudio[]
vi.mock('../services/groups', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/groups')>(), getGroup: vi.fn() }))
beforeEach(() => {
  window.history.replaceState(null, '', '/?groupId=group-a')
  vi.mocked(getGroup).mockReset().mockResolvedValue({ id: 'group-a', name: 'Group A', isActive: true })
  instances = installMediaMocks()
  vi.mocked(getAudioDownloadUrl).mockReset().mockImplementation(async (id) => `https://audio.test/${id}`)
  vi.mocked(listAudioFiles).mockReset().mockResolvedValue(files)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderPlayer() {
  return render(<AudioPlayer audio={files[0]} files={files} onSelect={vi.fn()} onClose={vi.fn()} />)
}
async function waitForPlayback(index = 0) {
  await waitFor(() => expect(instances[index].play).toHaveBeenCalledTimes(1))
  await screen.findByRole('button', { name: 'Pause' })
  return instances[index]
}

describe('audio player', () => {
  it('opens from a file name and closes, restoring focus and stopping playback', async () => {
    const user = userEvent.setup()
    render(<AudioLibrary groupId="group-a" />)
    const opener = await screen.findByRole('button', { name: 'one.wav' })
    await user.click(opener)
    expect(screen.getByRole('dialog', { name: 'one.wav' })).toBeInTheDocument()
    const audio = await waitForPlayback()
    expect(getAudioDownloadUrl).toHaveBeenCalledWith(files[0].storagePath)
    expect(audio.src).toBe(`https://audio.test/${files[0].storagePath}`)
    await user.click(screen.getByRole('button', { name: 'Close player' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(audio.pause).toHaveBeenCalled()
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('pauses and resumes with the HTML5 Audio API', async () => {
    const user = userEvent.setup()
    renderPlayer()
    const audio = await waitForPlayback()
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(audio.pause).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('updates duration and current time and seeks using the range input', async () => {
    renderPlayer()
    const audio = await waitForPlayback()
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeDisabled()
    act(() => { audio.duration = 125; audio.dispatchEvent(new Event('loadedmetadata')) })
    expect(screen.getByLabelText('Total duration')).toHaveTextContent('02:05')
    fireEvent.change(screen.getByRole('slider', { name: 'Playback position' }), { target: { value: '40' } })
    expect(audio.currentTime).toBe(40)
    expect(screen.getByLabelText('Current time')).toHaveTextContent('00:40')
    act(() => { audio.currentTime = 75; audio.dispatchEvent(new Event('timeupdate')) })
    expect(screen.getByRole('slider')).toHaveValue('75')
    expect(screen.getByLabelText('Current time')).toHaveTextContent('01:15')
  })

  it('updates the ended state and restarts playback from zero', async () => {
    const user = userEvent.setup()
    renderPlayer()
    const audio = await waitForPlayback()
    act(() => {
      audio.duration = 90
      audio.dispatchEvent(new Event('durationchange'))
      audio.currentTime = 90
      audio.paused = true
      audio.ended = true
      audio.dispatchEvent(new Event('ended'))
    })
    expect(screen.getByLabelText('Current time')).toHaveTextContent('01:30')
    await user.click(screen.getByRole('button', { name: 'Replay' }))
    expect(audio.currentTime).toBe(0)
    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('stops the previous file and plays the selected file in the modal', async () => {
    const user = userEvent.setup()
    render(<AudioLibrary groupId="group-a" />)
    await user.click(await screen.findByRole('button', { name: 'Play one.wav' }))
    const first = await waitForPlayback()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Choose another recording' }), files[1].id)
    const second = await waitForPlayback(1)
    expect(first.pause).toHaveBeenCalled()
    expect(first.src).toBe('')
    expect(first.removeEventListener).toHaveBeenCalledTimes(7)
    expect(second.src).toBe(`https://audio.test/${files[1].storagePath}`)
    expect(screen.getByRole('dialog', { name: 'two.mp3' })).toBeInTheDocument()
  })

  it('removes every media listener and releases the source on unmount', async () => {
    const { unmount } = renderPlayer()
    const audio = await waitForPlayback()
    const listeners = [...audio.addEventListener.mock.calls]
    unmount()
    expect(audio.pause).toHaveBeenCalled()
    expect(audio.removeAttribute).toHaveBeenCalledWith('src')
    expect(audio.src).toBe('')
    expect(audio.load).toHaveBeenCalledTimes(2)
    listeners.forEach(([event, listener]) => expect(audio.removeEventListener).toHaveBeenCalledWith(event, listener))
  })

  it('closes with Escape via the native dialog cancel event', async () => {
    const user = userEvent.setup()
    render(<AudioLibrary groupId="group-a" />)
    await user.click(await screen.findByRole('button', { name: 'Play one.wav' }))
    const audio = await waitForPlayback()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(audio.pause).toHaveBeenCalled()
  })

  it('offers manual play when autoplay is blocked and allows retry', async () => {
    const user = userEvent.setup()
    renderPlayer()
    const audio = instances[0]
    audio.play.mockRejectedValueOnce(new DOMException('User gesture required', 'NotAllowedError'))
    expect(await screen.findByText(/blocked autoplay/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a download URL error without starting playback', async () => {
    vi.mocked(getAudioDownloadUrl).mockRejectedValue(new Error('storage/unauthorized'))
    renderPlayer()
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage permissions')
    expect(instances[0].play).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('handles decoding or network media errors', async () => {
    renderPlayer()
    const audio = await waitForPlayback()
    act(() => audio.dispatchEvent(new Event('error')))
    expect(screen.getByRole('alert')).toHaveTextContent('file format and your network')
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('ignores a URL that resolves after the modal closes', async () => {
    let resolve!: (url: string) => void
    vi.mocked(getAudioDownloadUrl).mockReturnValue(new Promise((done) => { resolve = done }))
    const { unmount } = renderPlayer()
    const audio = instances[0]
    unmount()
    await act(async () => { resolve('https://audio.test/late.wav') })
    expect(audio.src).toBe('')
    expect(audio.play).not.toHaveBeenCalled()
  })

  it('does not start a stale file when a second file is selected while loading', async () => {
    const user = userEvent.setup()
    let resolveFirst!: (url: string) => void
    vi.mocked(getAudioDownloadUrl).mockReturnValueOnce(new Promise((done) => { resolveFirst = done }))
    render(<AudioLibrary groupId="group-a" />)
    await user.click(await screen.findByRole('button', { name: 'Play one.wav' }))
    await user.selectOptions(screen.getByRole('combobox'), files[1].id)
    await waitForPlayback(1)
    await act(async () => { resolveFirst('https://audio.test/stale.wav') })
    expect(instances[0].play).not.toHaveBeenCalled()
    expect(instances[0].src).toBe('')
    expect(instances[1].src).toBe(`https://audio.test/${files[1].storagePath}`)
  })

  it('cleans up the StrictMode trial instance and plays only the live instance', async () => {
    render(<StrictMode><AudioPlayer audio={files[0]} files={files} onSelect={vi.fn()} onClose={vi.fn()} /></StrictMode>)
    await waitForPlayback(1)
    expect(instances[0].pause).toHaveBeenCalled()
    expect(instances[0].play).not.toHaveBeenCalled()
    expect(instances[0].src).toBe('')
  })

  it('stops playback when the Play page unmounts on a navigation change', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Play one.wav' }))
    const audio = await waitForPlayback()
    // jsdom does not enforce native modal inertness; this triggers the page teardown path.
    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Record' }))
    expect(screen.getByRole('heading', { name: 'New Recording' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(audio.pause).toHaveBeenCalled()
    expect(audio.removeEventListener).toHaveBeenCalledTimes(7)
  })
})

it('removes the previous group list and player when the group changes', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<AudioLibrary groupId="group-a" />)
  await user.click(await screen.findByRole('button', { name: 'Play one.wav' }))
  const first = await waitForPlayback()
  vi.mocked(listAudioFiles).mockResolvedValueOnce([])
  rerender(<AudioLibrary groupId="group-b" />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Play one.wav' })).not.toBeInTheDocument()
  expect(first.pause).toHaveBeenCalled()
  expect(first.src).toBe('')
  expect(await screen.findByText(/No recordings yet/)).toBeInTheDocument()
  expect(listAudioFiles).toHaveBeenLastCalledWith('group-b')
})
