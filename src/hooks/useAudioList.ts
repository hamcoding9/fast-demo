import { useEffect, useState } from 'react'
import { FirebaseNotConfiguredError } from '../config/firebase'
import { InvalidAudioMetadataError, listAudioFiles } from '../services/audios'
import type { AudioFile } from '../types/audio'

type AudioListState =
  | { status: 'loading' }
  | { status: 'ready'; files: AudioFile[] }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }

export function useAudioList(groupId: string) {
  const [result, setResult] = useState<{ key: string; state: AudioListState } | null>(null)
  const [revision, setRevision] = useState(0)

  const requestKey = JSON.stringify([groupId, revision])
  const state: AudioListState = result?.key === requestKey ? result.state : { status: 'loading' }

  useEffect(() => {
    let active = true
    listAudioFiles(groupId).then(
      (files) => { if (active) setResult({ key: requestKey, state: { status: 'ready', files } }) },
      (error: unknown) => {
        if (!active) return
        const state: AudioListState = error instanceof FirebaseNotConfiguredError
          ? { status: 'unconfigured', message: error.message }
          : { status: 'error', message: error instanceof InvalidAudioMetadataError ? error.message
            : typeof error === 'object' && error !== null && 'code' in error && error.code === 'failed-precondition'
              ? 'Unable to load the audio library. Check the Firestore composite index deployment and wait for indexes to finish building, then refresh.'
              : 'Unable to load the audio library. Check your connection and Firestore permissions, then try again.' }
        setResult({ key: requestKey, state })
      },
    )
    return () => { active = false }
  }, [groupId, requestKey])

  function refresh() {
    setRevision((value) => value + 1)
  }

  return { state, refresh }
}
