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
          : { status: 'error', message: '오디오 목록을 불러오지 못했습니다. 연결과 Storage 접근 권한을 확인한 뒤 다시 시도하세요.' })
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
