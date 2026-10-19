import { audioFixture } from './test/audioFixtures'
import { getGroup } from './services/groups'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FirebaseNotConfiguredError } from './config/firebase'
import { listAudioFiles } from './services/audios'
import App from './App'

vi.mock('./services/audios', async (importOriginal) => ({ ...await importOriginal<typeof import('./services/audios')>(), listAudioFiles: vi.fn() }))
vi.mock('./services/audioStorage', async (importOriginal) => ({ ...await importOriginal<typeof import('./services/audioStorage')>(), getAudioDownloadUrl: vi.fn(), uploadAudioRecording: vi.fn() }))
vi.mock('./services/groups', async (importOriginal) => ({ ...await importOriginal<typeof import('./services/groups')>(), getGroup: vi.fn() }))
beforeEach(() => {
  window.history.replaceState(null, '', '/?groupId=group-a')
  vi.mocked(getGroup).mockReset().mockResolvedValue({ id: 'group-a', name: 'Group A', isActive: true })
  vi.mocked(listAudioFiles).mockReset().mockResolvedValue([
    audioFixture({ id: 'doc-one.wav', name: 'one.wav', storagePath: 'recordings/group-a/one.wav', uploadedAt: '2026-10-11T12:00:00Z' }),
    audioFixture({ id: 'doc-two.wav', name: 'two.wav', storagePath: 'recordings/group-a/two.wav', uploadedAt: '2026-10-10T12:00:00Z' }),
    audioFixture({ id: 'doc-three.wav', name: 'three.wav', storagePath: 'recordings/group-a/three.wav', uploadedAt: '2026-10-09T12:00:00Z' }),
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


describe('group cloud access gate', () => {
  it('does not query audio until an active group is verified', async () => {
    let resolve!: (value: { id: string; name: string; isActive: boolean }) => void
    vi.mocked(getGroup).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    render(<App />)
    expect(screen.getByText('Loading group…')).toBeInTheDocument()
    expect(listAudioFiles).not.toHaveBeenCalled()
    await act(async () => resolve({ id: 'group-a', name: 'Group A', isActive: true }))
    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(await screen.findAllByRole('listitem')).toHaveLength(3)
    expect(listAudioFiles).toHaveBeenCalledTimes(1)
  })

  it.each([['/', 'Open a group link'], ['/?groupId=a%2Fb', 'Invalid Group ID']])('keeps navigation usable and blocks cloud access for %s', async (url, message) => {
    window.history.replaceState(null, '', url)
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText(new RegExp(message))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record' }))
    expect(screen.getByRole('heading', { name: 'New Recording' })).toBeInTheDocument()
    expect(getGroup).not.toHaveBeenCalled()
    expect(listAudioFiles).not.toHaveBeenCalled()
  })

  it.each(['missing', 'inactive', 'error'])('does not expose the library for a %s group', async (kind) => {
    if (kind === 'error') vi.mocked(getGroup).mockRejectedValue(new Error('permission-denied'))
    else vi.mocked(getGroup).mockResolvedValue(kind === 'missing' ? null : { id: 'group-a', name: 'Group A', isActive: false })
    render(<App />)
    const message = kind === 'missing' ? /This group does not exist/ : kind === 'inactive' ? /This group is inactive/ : /Unable to load this group/
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(listAudioFiles).not.toHaveBeenCalled()
  })
})
