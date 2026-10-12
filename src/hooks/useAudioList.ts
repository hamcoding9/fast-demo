import { useEffect, useState } from 'react'
import { FirebaseNotConfiguredError } from '../config/firebase'
import { listAudioFiles } from '../services/audioStorage'
import type { AudioFile } from '../types/audio'

type AudioListState =
  | { status: 'loading' }
  | { status: 'ready'; files: AudioFile[] }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }

export function useAudioList() {
  const [state, setState] = useState<AudioListState>({ status: 'loading' })
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    listAudioFiles().then(
      (files) => { if (active) setState({ status: 'ready', files }) },
      (error: unknown) => {
        if (!active) return
        setState(error instanceof FirebaseNotConfiguredError
          ? { status: 'unconfigured', message: error.message }
          : { status: 'error', message: 'Unable to load the audio library. Check your connection and Storage permissions, then try again.' })
      },
    )
    return () => { active = false }
  }, [revision])

  function refresh() {
    setState({ status: 'loading' })
    setRevision((value) => value + 1)
  }

  return { state, refresh }
}
