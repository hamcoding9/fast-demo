import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FirebaseNotConfiguredError } from '../config/firebase'
import { getGroup } from '../services/groups'
import type { Group } from '../types/group'
import { useGroup } from './useGroup'

vi.mock('../services/groups', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/groups')>(), getGroup: vi.fn() }))
const group: Group = { id: 'group-a', name: 'Group A', isActive: true }
beforeEach(() => {
  vi.mocked(getGroup).mockReset().mockResolvedValue(group)
  window.history.replaceState(null, '', '/?groupId=group-a')
})
function navigate(url: string) {
  act(() => {
    window.history.pushState(null, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

describe('URL group state', () => {
  it.each([['/', 'missing'], ['/?groupId=', 'missing'], ['/?groupId=a%2Fb', 'invalid'], ['/?groupId=a&groupId=b', 'invalid']])('handles %s without a lookup', (url, status) => {
    window.history.replaceState(null, '', url)
    const { result } = renderHook(useGroup)
    expect(result.current.state.status).toBe(status)
    expect(getGroup).not.toHaveBeenCalled()
  })
  it('shows loading followed by the group name', async () => {
    const { result } = renderHook(useGroup)
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', group }))
  })
  it.each([[null, 'not-found'], [{ ...group, isActive: false }, 'inactive']] as const)('handles unavailable groups', async (value, status) => {
    vi.mocked(getGroup).mockResolvedValue(value)
    const { result } = renderHook(useGroup)
    await waitFor(() => expect(result.current.state.status).toBe(status))
  })
  it('shows configuration guidance and retries lookup', async () => {
    vi.mocked(getGroup).mockRejectedValueOnce(new FirebaseNotConfiguredError())
    const { result } = renderHook(useGroup)
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'error', message: expect.stringContaining('Firebase configuration') }))
    act(() => result.current.retry())
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
  })
  it('shows generic guidance on API failure', async () => {
    vi.mocked(getGroup).mockRejectedValue(new Error('permission-denied'))
    const { result } = renderHook(useGroup)
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'error', message: expect.stringContaining('Firestore permissions') }))
  })
  it('ignores the previous group response after URL navigation', async () => {
    let resolve!: (group: Group) => void
    vi.mocked(getGroup).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const { result } = renderHook(useGroup)
    navigate('/?groupId=group-b')
    await waitFor(() => expect(getGroup).toHaveBeenLastCalledWith('group-b'))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    await act(async () => resolve({ ...group, name: 'Stale group' }))
    expect(result.current.state).toEqual({ status: 'ready', group })
    navigate('/')
    expect(result.current.state.status).toBe('missing')
  })
  it('cleans up on unmount while lookup is pending', async () => {
    let resolve!: (group: Group) => void
    vi.mocked(getGroup).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const { unmount } = renderHook(useGroup)
    unmount()
    await act(async () => resolve(group))
    navigate('/?groupId=group-b')
    expect(getGroup).toHaveBeenCalledTimes(1)
  })
})

it.each(['pushState', 'replaceState'] as const)('reacts to %s without a synthetic popstate event', async (method) => {
  const { result } = renderHook(useGroup)
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  vi.mocked(getGroup).mockResolvedValueOnce({ ...group, id: 'group-b', name: 'Group B' })
  act(() => window.history[method](null, '', '/?groupId=group-b'))
  expect(result.current.state.status).toBe('loading')
  await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', group: { ...group, id: 'group-b', name: 'Group B' } }))
})

it('revalidates A on A → B → A rather than reusing its earlier ready state', async () => {
  const { result } = renderHook(useGroup)
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  let finishB!: (value: Group | null) => void
  let finishA!: (value: Group | null) => void
  vi.mocked(getGroup).mockReturnValueOnce(new Promise((done) => { finishB = done }))
    .mockReturnValueOnce(new Promise((done) => { finishA = done }))
  act(() => window.history.pushState(null, '', '/?groupId=group-b'))
  act(() => window.history.replaceState(null, '', '/?groupId=group-a'))
  expect(result.current.state.status).toBe('loading')
  await act(async () => finishB({ ...group, id: 'group-b' }))
  expect(result.current.state.status).toBe('loading')
  await act(async () => finishA({ ...group, isActive: false }))
  expect(result.current.state.status).toBe('inactive')
  expect(getGroup).toHaveBeenCalledTimes(3)
})

it('suspends lookup on pagehide and revalidates after a cached page is restored', async () => {
  let finish!: (value: Group) => void
  vi.mocked(getGroup).mockReturnValueOnce(new Promise((done) => { finish = done }))
  const { result } = renderHook(useGroup)
  const oldKey = result.current.scopeKey
  act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
  expect(result.current.scopeKey).not.toBe(oldKey)
  await act(async () => finish(group))
  expect(result.current.state.status).toBe('loading')
  expect(getGroup).toHaveBeenCalledTimes(1)
  act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(getGroup).toHaveBeenCalledTimes(2)
})

it('restores history methods after the final subscriber unmounts', async () => {
  const push = window.history.pushState
  const replace = window.history.replaceState
  const first = renderHook(useGroup)
  const second = renderHook(useGroup)
  await waitFor(() => expect(second.result.current.state.status).toBe('ready'))
  expect(window.history.pushState).not.toBe(push)
  first.unmount()
  expect(window.history.pushState).not.toBe(push)
  second.unmount()
  expect(window.history.pushState).toBe(push)
  expect(window.history.replaceState).toBe(replace)
})
