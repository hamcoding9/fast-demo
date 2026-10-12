import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FirebaseNotConfiguredError } from './config/firebase'
import { listAudioFiles } from './services/audioStorage'
import App from './App'

vi.mock('./services/audioStorage', () => ({ listAudioFiles: vi.fn(), getAudioDownloadUrl: vi.fn(), uploadAudioRecording: vi.fn() }))
beforeEach(() => {
  vi.mocked(listAudioFiles).mockReset().mockResolvedValue([
    { id: 'recordings/one.wav', name: 'one.wav', uploadedAt: '2026-10-11T12:00:00Z' },
    { id: 'recordings/two.wav', name: 'two.wav', uploadedAt: '2026-10-10T12:00:00Z' },
    { id: 'recordings/three.wav', name: 'three.wav', uploadedAt: '2026-10-09T12:00:00Z' },
  ])
})

describe('bottom navigation', () => {
  it('opens Play by default and displays audio files with enabled play buttons', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'My Audio' })).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('button', { name: 'Play' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findAllByRole('listitem')).toHaveLength(3)
    screen.getAllByRole('button', { name: /^Play .*\.wav$/ }).forEach((button) => expect(button).toBeEnabled())
  })

  it('switches Play → Record → Play and updates the current page', async () => {
    const user = userEvent.setup()
    render(<App />)
    const play = screen.getByRole('button', { name: 'Play' })
    const record = screen.getByRole('button', { name: 'Record' })
    await user.click(record)
    expect(screen.getByRole('heading', { name: 'New Recording' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My Audio' })).not.toBeInTheDocument()
    expect(record).toHaveAttribute('aria-current', 'page')
    expect(play).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeDisabled() // jsdom has no MediaRecorder.
    await user.click(play)
    expect(screen.getByRole('heading', { name: 'My Audio' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'New Recording' })).not.toBeInTheDocument()
    expect(play).toHaveAttribute('aria-current', 'page')
    expect(record).not.toHaveAttribute('aria-current')
  })

  it('supports keyboard activation of both navigation buttons', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findAllByRole('listitem')
    screen.getByRole('button', { name: 'Play' }).focus()
    expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Record' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: 'New Recording' })).toBeInTheDocument()
    await user.tab({ shift: true })
    await user.keyboard(' ')
    expect(screen.getByRole('heading', { name: 'My Audio' })).toBeInTheDocument()
  })

  it('keeps navigation usable without Firebase configuration', async () => {
    const user = userEvent.setup()
    vi.mocked(listAudioFiles).mockRejectedValue(new FirebaseNotConfiguredError())
    render(<App />)
    expect(await screen.findByText(/Firebase configuration is required/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record' }))
    expect(screen.getByRole('heading', { name: 'New Recording' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(await screen.findByText(/Firebase configuration is required/)).toBeInTheDocument()
  })
})
