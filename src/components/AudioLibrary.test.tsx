import { audioFixture } from '../test/audioFixtures'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FirebaseNotConfiguredError } from '../config/firebase'
import { listAudioFiles } from '../services/audios'
import type { AudioFile } from '../types/audio'
import { AudioLibrary } from './AudioLibrary'

vi.mock('../services/audios', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/audios')>(), listAudioFiles: vi.fn() }))
vi.mock('../services/audioStorage', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/audioStorage')>(), getAudioDownloadUrl: vi.fn(), uploadAudioRecording: vi.fn() }))
const audio: AudioFile = audioFixture({ id: 'doc-memo.wav', name: 'memo.wav', storagePath: 'recordings/group-a/memo.wav', uploadedAt: '2026-10-11T12:00:00Z' })
beforeEach(() => {
  vi.mocked(listAudioFiles).mockReset()
})

describe('audio library states and refresh', () => {
  it('shows loading until files arrive, then displays name, date and enabled play icon', async () => {
    let resolve!: (files: AudioFile[]) => void
    vi.mocked(listAudioFiles).mockReturnValue(new Promise((done) => { resolve = done }))
    const { container } = render(<AudioLibrary groupId="group-a" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    resolve([audio])
    expect(await screen.findByRole('heading', { name: 'memo.wav' })).toBeInTheDocument()
    expect(container.querySelector('time')).toHaveAttribute('datetime', audio.uploadedAt)
    expect(container.querySelector('time')).toHaveTextContent(/2026/)
    expect(screen.getByRole('button', { name: 'Play memo.wav' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    vi.mocked(listAudioFiles).mockResolvedValue([])
    render(<AudioLibrary groupId="group-a" />)
    expect(await screen.findByText(/No recordings yet/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows an API error and retries successfully with refresh', async () => {
    const user = userEvent.setup()
    vi.mocked(listAudioFiles).mockRejectedValueOnce(new Error('storage/unauthorized')).mockResolvedValueOnce([audio])
    render(<AudioLibrary groupId="group-a" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load')
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByRole('heading', { name: 'memo.wav' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(listAudioFiles).toHaveBeenCalledTimes(2)
  })

  it('shows setup guidance when Firebase is not configured', async () => {
    vi.mocked(listAudioFiles).mockRejectedValue(new FirebaseNotConfiguredError())
    render(<AudioLibrary groupId="group-a" />)
    expect(await screen.findByText(/Firebase configuration is required/)).toHaveTextContent('.env')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  })

  it('refreshes the displayed files with a new Firestore query', async () => {
    const user = userEvent.setup()
    vi.mocked(listAudioFiles).mockResolvedValueOnce([audio]).mockResolvedValueOnce([])
    render(<AudioLibrary groupId="group-a" />)
    await screen.findByRole('heading', { name: 'memo.wav' })
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText(/No recordings yet/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'memo.wav' })).not.toBeInTheDocument()
    expect(listAudioFiles).toHaveBeenCalledTimes(2)
  })
})

it('explains a missing composite index and allows refresh', async () => {
  vi.mocked(listAudioFiles).mockRejectedValue(Object.assign(new Error('missing index'), { code: 'failed-precondition' }))
  render(<AudioLibrary groupId="group-a" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Firestore composite index')
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
})
