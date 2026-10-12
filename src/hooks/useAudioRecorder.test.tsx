import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installMediaMocks, type MockAudio } from '../test/mediaMocks'
import { installRecorderMocks, makeMockStream, MockMediaRecorder } from '../test/recorderMocks'
import { useAudioRecorder } from './useAudioRecorder'

let mocks: ReturnType<typeof installRecorderMocks>
let previews: MockAudio[]
beforeEach(() => {
  mocks = installRecorderMocks()
  previews = installMediaMocks()
})
afterEach(() => {
  cleanup()
  mocks.restore()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function recordAndStop() {
  const hook = renderHook(useAudioRecorder)
  await act(async () => hook.result.current.startRecording())
  act(() => hook.result.current.stopRecording())
  return hook
}

describe('useAudioRecorder', () => {
  it('requests only audio, starts recording and collects the final chunk before creating a preview', async () => {
    const { result } = renderHook(useAudioRecorder)
    expect(mocks.getUserMedia).not.toHaveBeenCalled()
    await act(async () => result.current.startRecording())
    expect(mocks.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(result.current.status).toBe('recording')
    expect(mocks.instances[0].start).toHaveBeenCalledWith(250)
    act(() => mocks.instances[0].emitData(new Blob(['first chunk'], { type: 'audio/webm;codecs=opus' })))
    act(() => result.current.stopRecording())
    expect(result.current.status).toBe('ready')
    expect(result.current.recording?.blob.size).toBe('first chunk'.length + 'recorded sound'.length)
    expect(result.current.recording?.mimeType).toBe('audio/webm;codecs=opus')
    expect(result.current.recording?.url).toBe('blob:recording-1')
    expect(mocks.streams[0].track.stop).toHaveBeenCalledTimes(1)
    expect(previews[0].play).not.toHaveBeenCalled()
  })

  it('updates the timer from elapsed wall time and freezes it at stop', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(useAudioRecorder)
    await act(async () => result.current.startRecording())
    act(() => vi.advanceTimersByTime(6500))
    expect(result.current.seconds).toBe(6)
    act(() => result.current.stopRecording())
    act(() => vi.advanceTimersByTime(4000))
    expect(result.current.seconds).toBe(6)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('plays, pauses and replays a local preview after it ends', async () => {
    const { result } = await recordAndStop()
    await act(async () => result.current.togglePreview())
    expect(previews[0].src).toBe(result.current.recording?.url)
    expect(result.current.isPreviewPlaying).toBe(true)
    await act(async () => result.current.togglePreview())
    expect(result.current.isPreviewPlaying).toBe(false)
    expect(previews[0].pause).toHaveBeenCalledTimes(1)
    act(() => {
      previews[0].ended = true
      previews[0].currentTime = 5
      previews[0].dispatchEvent(new Event('ended'))
    })
    await act(async () => result.current.togglePreview())
    expect(previews[0].currentTime).toBe(0)
    expect(result.current.isPreviewPlaying).toBe(true)
  })

  it('stops preview and revokes its URL before re-recording', async () => {
    const { result } = await recordAndStop()
    await act(async () => result.current.togglePreview())
    await act(async () => result.current.reRecord())
    expect(previews[0].pause).toHaveBeenCalled()
    expect(previews[0].src).toBe('')
    expect(previews[0].removeEventListener).toHaveBeenCalledTimes(4)
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:recording-1')
    expect(result.current.recording).toBeNull()
    expect(result.current.status).toBe('recording')
    act(() => result.current.stopRecording())
    expect(result.current.recording?.url).toBe('blob:recording-2')
  })

  it('handles denied microphone permission and supports retry', async () => {
    mocks.getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    const { result } = renderHook(useAudioRecorder)
    await act(async () => result.current.startRecording())
    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('Microphone access was denied')
    expect(mocks.instances).toHaveLength(0)
    await act(async () => result.current.startRecording())
    expect(result.current.status).toBe('recording')
  })

  it.each([
    ['NotFoundError', 'No microphone was found'],
    ['NotReadableError', 'another app is using it'],
  ])('handles %s', async (name, message) => {
    mocks.getUserMedia.mockRejectedValue(new DOMException('Microphone error', name))
    const { result } = renderHook(useAudioRecorder)
    await act(async () => result.current.startRecording())
    expect(result.current.error).toContain(message)
  })

  it('handles an unsupported MediaRecorder without requesting microphone access', async () => {
    vi.stubGlobal('MediaRecorder', undefined)
    const { result } = renderHook(useAudioRecorder)
    expect(result.current.status).toBe('unsupported')
    await act(async () => result.current.startRecording())
    expect(mocks.getUserMedia).not.toHaveBeenCalled()
  })

  it('handles missing MediaDevices and insecure HTTP contexts', () => {
    vi.stubGlobal('isSecureContext', false)
    const first = renderHook(useAudioRecorder)
    expect(first.result.current.status).toBe('unsupported')
    first.unmount()
    vi.stubGlobal('isSecureContext', true)
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    expect(renderHook(useAudioRecorder).result.current.status).toBe('unsupported')
  })

  it('selects MP4 when only Safari-style MP4 support is advertised', async () => {
    MockMediaRecorder.isTypeSupported.mockImplementation((type) => type === 'audio/mp4')
    const { result } = await recordAndStop()
    expect(mocks.instances[0].options).toEqual({ mimeType: 'audio/mp4' })
    expect(result.current.recording?.mimeType).toBe('audio/mp4')
  })

  it('uses the browser default when no preferred format is advertised', async () => {
    MockMediaRecorder.isTypeSupported.mockReturnValue(false)
    const { result } = await recordAndStop()
    expect(mocks.instances[0].options).toBeUndefined()
    expect(result.current.recording?.mimeType).toBe(mocks.instances[0].mimeType)
  })

  it('falls back to the browser default if an advertised format cannot be constructed', async () => {
    mocks.settings.failPreferredFormat = true
    const { result } = await recordAndStop()
    expect(result.current.status).toBe('ready')
    expect(mocks.instances[0].options).toBeUndefined()
    expect(result.current.recording?.mimeType).toBe('audio/mp4')
  })

  it('stops recorder and every microphone track and removes listeners on unmount', async () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(useAudioRecorder)
    await act(async () => result.current.startRecording())
    const recorder = mocks.instances[0]
    const listeners = [...recorder.addEventListener.mock.calls]
    unmount()
    expect(recorder.stop).toHaveBeenCalled()
    expect(mocks.streams[0].track.stop).toHaveBeenCalledTimes(1)
    listeners.forEach(([event, listener]) => expect(recorder.removeEventListener).toHaveBeenCalledWith(event, listener))
    expect(mocks.createObjectURL).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases preview audio and its Object URL on unmount', async () => {
    const { result, unmount } = await recordAndStop()
    await act(async () => result.current.togglePreview())
    unmount()
    expect(previews[0].pause).toHaveBeenCalled()
    expect(previews[0].removeAttribute).toHaveBeenCalledWith('src')
    expect(previews[0].removeEventListener).toHaveBeenCalledTimes(4)
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:recording-1')
  })

  it('stops a stream received after the permission prompt outlives the component', async () => {
    let resolve!: (stream: MediaStream) => void
    mocks.getUserMedia.mockReturnValue(new Promise((done) => { resolve = done }))
    const { result, unmount } = renderHook(useAudioRecorder)
    let request!: Promise<void>
    act(() => { request = result.current.startRecording() })
    expect(result.current.status).toBe('requesting')
    unmount()
    const late = makeMockStream()
    await act(async () => { resolve(late.stream as unknown as MediaStream); await request })
    expect(late.track.stop).toHaveBeenCalledTimes(1)
    expect(mocks.instances).toHaveLength(0)
  })

  it('prevents duplicate starts while permission is pending', async () => {
    const { result } = renderHook(useAudioRecorder)
    await act(async () => { await Promise.all([result.current.startRecording(), result.current.startRecording()]) })
    expect(mocks.getUserMedia).toHaveBeenCalledTimes(1)
    expect(mocks.instances).toHaveLength(1)
  })

  it('releases resources on pagehide, including the local preview', async () => {
    const { result } = await recordAndStop()
    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(result.current.status).toBe('idle')
    expect(result.current.recording).toBeNull()
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:recording-1')
  })

  it('handles a recorder error and still stops the microphone', async () => {
    const { result } = renderHook(useAudioRecorder)
    await act(async () => result.current.startRecording())
    act(() => mocks.instances[0].dispatchEvent(new Event('error')))
    expect(result.current.status).toBe('error')
    expect(mocks.streams[0].track.stop).toHaveBeenCalled()
    expect(mocks.createObjectURL).not.toHaveBeenCalled()
  })

  it('does not create a preview for an empty recording', async () => {
    const { result } = renderHook(useAudioRecorder)
    await act(async () => result.current.startRecording())
    mocks.instances[0].stop.mockImplementation(() => {
      mocks.instances[0].state = 'inactive'
      mocks.instances[0].emitData(new Blob([]))
      mocks.instances[0].dispatchEvent(new Event('stop'))
    })
    act(() => result.current.stopRecording())
    expect(result.current.error).toContain('No audio was captured')
    expect(mocks.createObjectURL).not.toHaveBeenCalled()
  })

  it('offers a retry if preview play is rejected', async () => {
    const { result } = await recordAndStop()
    previews[0].play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    await act(async () => result.current.togglePreview())
    expect(result.current.isPreviewPlaying).toBe(false)
    expect(result.current.previewError).toContain('Unable to start the preview')
    await act(async () => result.current.togglePreview())
    expect(result.current.isPreviewPlaying).toBe(true)
    expect(result.current.previewError).toBeNull()
  })

  it('still stops tracks when MediaRecorder.stop throws during cleanup', async () => {
    const { result, unmount } = renderHook(useAudioRecorder)
    await act(async () => result.current.startRecording())
    mocks.instances[0].stop.mockImplementation(() => { throw new DOMException('Cannot stop', 'InvalidStateError') })
    expect(() => unmount()).not.toThrow()
    expect(mocks.streams[0].track.stop).toHaveBeenCalledTimes(1)
  })

  it('works after the StrictMode effect cleanup and setup cycle', async () => {
    const { result } = renderHook(useAudioRecorder, { wrapper: StrictMode })
    await act(async () => result.current.startRecording())
    expect(result.current.status).toBe('recording')
    expect(mocks.instances).toHaveLength(1)
    act(() => result.current.stopRecording())
    expect(result.current.status).toBe('ready')
  })
})
