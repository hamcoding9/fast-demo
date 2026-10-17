import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listAudioFiles } from '../services/audios'
import { audioFixture } from '../test/audioFixtures'
import type { AudioFile } from '../types/audio'
import { useAudioList } from './useAudioList'

vi.mock('../services/audios', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/audios')>(), listAudioFiles: vi.fn() }))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
beforeEach(() => vi.mocked(listAudioFiles).mockReset())

describe('group audio list lifecycle', () => {
  it('hides the old group immediately and ignores its late success', async () => {
    const old = deferred<AudioFile[]>()
    const next = deferred<AudioFile[]>()
    vi.mocked(listAudioFiles).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const { result, rerender } = renderHook(({ id }) => useAudioList(id), { initialProps: { id: 'group-a' } })
    rerender({ id: 'group-b' })
    expect(result.current.state.status).toBe('loading')
    const file = audioFixture({ id: 'b', groupId: 'group-b', storagePath: 'recordings/group-b/b.wav' })
    await act(async () => next.resolve([file]))
    expect(result.current.state).toEqual({ status: 'ready', files: [file] })
    await act(async () => old.resolve([audioFixture()]))
    expect(result.current.state).toEqual({ status: 'ready', files: [file] })
    expect(listAudioFiles).toHaveBeenNthCalledWith(1, 'group-a')
    expect(listAudioFiles).toHaveBeenNthCalledWith(2, 'group-b')
  })

  it('does not retain an already displayed group when a new group is loading', async () => {
    vi.mocked(listAudioFiles).mockResolvedValueOnce([audioFixture()]).mockReturnValueOnce(new Promise(() => {}))
    const { result, rerender } = renderHook(({ id }) => useAudioList(id), { initialProps: { id: 'group-a' } })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    rerender({ id: 'group-b' })
    expect(result.current.state).toEqual({ status: 'loading' })
  })

  it('ignores a previous request error after refresh', async () => {
    const old = deferred<AudioFile[]>()
    vi.mocked(listAudioFiles).mockReturnValueOnce(old.promise).mockResolvedValueOnce([])
    const { result } = renderHook(() => useAudioList('group-a'))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', files: [] }))
    await act(async () => old.reject(new Error('late error')))
    expect(result.current.state).toEqual({ status: 'ready', files: [] })
  })

  it.each(['success', 'error'])('ignores %s after unmount', async (outcome) => {
    const request = deferred<AudioFile[]>()
    vi.mocked(listAudioFiles).mockReturnValueOnce(request.promise)
    const { result, unmount } = renderHook(() => useAudioList('group-a'))
    unmount()
    await act(async () => {
      if (outcome === 'success') request.resolve([audioFixture()])
      else request.reject(new Error('late error'))
    })
    expect(result.current.state.status).toBe('loading')
  })
})
