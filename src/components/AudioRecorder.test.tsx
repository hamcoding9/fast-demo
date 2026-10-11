import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { listAudioFiles } from '../services/audioStorage'
import { installMediaMocks, type MockAudio } from '../test/mediaMocks'
import { installRecorderMocks } from '../test/recorderMocks'
import { AudioRecorder } from './AudioRecorder'

vi.mock('../services/audioStorage', () => ({ listAudioFiles: vi.fn(), getAudioDownloadUrl: vi.fn() }))
let mocks: ReturnType<typeof installRecorderMocks>
let previews: MockAudio[]
beforeEach(() => {
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
  it('shows recording status, stop, preview, re-record and disabled upload controls', async () => {
    const user = userEvent.setup()
    render(<AudioRecorder />)
    expect(screen.getByRole('status')).toHaveTextContent('녹음 준비')
    expect(screen.getByRole('timer', { name: '녹음 시간' })).toHaveTextContent('00:00')
    await user.click(screen.getByRole('button', { name: '녹음 시작' }))
    expect(screen.getByRole('status')).toHaveTextContent('녹음 중')
    await user.click(screen.getByRole('button', { name: '녹음 종료' }))
    expect(screen.getByRole('status')).toHaveTextContent('녹음 완료')
    await user.click(screen.getByRole('button', { name: '미리 듣기' }))
    expect(previews[0].play).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '미리 듣기 일시정지' }))
    expect(previews[0].pause).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '업로드 (준비 중)' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '재녹음' }))
    expect(screen.getByRole('status')).toHaveTextContent('녹음 중')
    expect(screen.queryByRole('button', { name: '업로드 (준비 중)' })).not.toBeInTheDocument()
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:recording-1')
  })

  it('displays a permission error and keeps retry available', async () => {
    const user = userEvent.setup()
    mocks.getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    render(<AudioRecorder />)
    await user.click(screen.getByRole('button', { name: '녹음 시작' }))
    expect(screen.getByRole('alert')).toHaveTextContent('마이크 권한이 거부')
    expect(screen.getByRole('button', { name: '녹음 시작' })).toBeEnabled()
  })

  it('displays unsupported guidance and disables start', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    render(<AudioRecorder />)
    expect(screen.getByRole('alert')).toHaveTextContent('HTTPS 또는 localhost')
    expect(screen.getByRole('button', { name: '녹음 시작' })).toBeDisabled()
  })

  it('disables start while microphone permission is pending', async () => {
    const user = userEvent.setup()
    mocks.getUserMedia.mockReturnValue(new Promise(() => {}))
    render(<AudioRecorder />)
    await user.click(screen.getByRole('button', { name: '녹음 시작' }))
    expect(screen.getByRole('status')).toHaveTextContent('마이크 연결 중')
    expect(screen.getByRole('button', { name: '녹음 시작' })).toBeDisabled()
  })

  it('stops recording when navigating back to Play without changing Firebase listing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/저장된 오디오가 없습니다/)
    await user.click(screen.getByRole('button', { name: 'Record' }))
    await user.click(screen.getByRole('button', { name: '녹음 시작' }))
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(mocks.instances[0].stop).toHaveBeenCalled()
    expect(mocks.streams[0].track.stop).toHaveBeenCalled()
    expect(mocks.createObjectURL).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '나의 오디오' })).toBeInTheDocument()
    expect(await screen.findByText(/저장된 오디오가 없습니다/)).toBeInTheDocument()
    expect(listAudioFiles).toHaveBeenCalledTimes(2)
  })

  it('stops preview and revokes its URL on navigation to Play', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Record' }))
    await user.click(screen.getByRole('button', { name: '녹음 시작' }))
    await user.click(screen.getByRole('button', { name: '녹음 종료' }))
    await user.click(screen.getByRole('button', { name: '미리 듣기' }))
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(previews[0].pause).toHaveBeenCalled()
    expect(previews[0].src).toBe('')
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:recording-1')
  })
})
