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
