import { useEffect, useRef, useState } from 'react'
import { getAudioDownloadUrl } from '../services/audioStorage'

interface PlayerState {
  status: 'loading' | 'ready' | 'error'
  isPlaying: boolean
  isStarting: boolean
  currentTime: number
  duration: number
  message: string | null
}

const initialState: PlayerState = {
  status: 'loading', isPlaying: false, isStarting: false,
  currentTime: 0, duration: 0, message: null,
}
const finiteTime = (value: number) => Number.isFinite(value) && value >= 0 ? value : 0

// Mount a fresh player for each selected file (the modal is keyed by file id).
export function useAudioPlayer(fileId: string) {
  const [state, setState] = useState(initialState)
  const controls = useRef<{ toggle: () => void; seek: (time: number) => void } | null>(null)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'metadata'
    let disposed = false
    let playRequest = 0

    async function startPlayback() {
      const request = ++playRequest
      setState((previous) => ({ ...previous, isStarting: true, message: null }))
      try {
        if (audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration)) audio.currentTime = 0
        await audio.play()
        if (!disposed && request === playRequest) {
          setState((previous) => ({ ...previous, isPlaying: !audio.paused, isStarting: false }))
        }
      } catch (error) {
        if (disposed || request !== playRequest) return
        const name = error instanceof Error || error instanceof DOMException ? error.name : ''
        if (name === 'AbortError') {
          setState((previous) => ({ ...previous, isStarting: false, isPlaying: false }))
        } else if (name === 'NotAllowedError') {
          setState((previous) => ({ ...previous, isStarting: false, isPlaying: false,
            message: '브라우저가 자동재생을 차단했습니다. 재생 버튼을 눌러 시작하세요.' }))
        } else {
          setState((previous) => ({ ...previous, status: 'error', isStarting: false, isPlaying: false,
            message: '오디오를 재생할 수 없습니다. 파일 형식과 네트워크 연결을 확인하세요.' }))
        }
      }
    }

    function updateTime() {
      setState((previous) => ({ ...previous, currentTime: finiteTime(audio.currentTime) }))
    }
    function updateDuration() {
      setState((previous) => ({ ...previous, duration: finiteTime(audio.duration) }))
    }
    function onPlay() {
      setState((previous) => ({ ...previous, isPlaying: true, isStarting: false }))
    }
    function onPause() {
      setState((previous) => ({ ...previous, isPlaying: false }))
    }
    function onEnded() {
      ++playRequest
      setState((previous) => ({ ...previous, isPlaying: false, isStarting: false,
        currentTime: finiteTime(audio.currentTime) }))
    }
    function onError() {
      ++playRequest
      setState((previous) => ({ ...previous, status: 'error', isPlaying: false, isStarting: false,
        message: '오디오를 불러올 수 없습니다. 파일 형식과 네트워크 연결을 확인하세요.' }))
    }

    const listeners: [string, () => void][] = [
      ['loadedmetadata', updateDuration], ['durationchange', updateDuration],
      ['timeupdate', updateTime], ['play', onPlay], ['pause', onPause],
      ['ended', onEnded], ['error', onError],
    ]
    listeners.forEach(([event, listener]) => audio.addEventListener(event, listener))
    controls.current = {
      toggle() {
        if (!audio.paused) {
          ++playRequest
          audio.pause()
        } else {
          void startPlayback()
        }
      },
      seek(time) {
        if (!Number.isFinite(time) || !Number.isFinite(audio.duration) || audio.duration <= 0) return
        audio.currentTime = Math.min(Math.max(time, 0), audio.duration)
        updateTime()
      },
    }

    getAudioDownloadUrl(fileId).then((url) => {
      if (disposed) return
      audio.src = url
      audio.load()
      setState((previous) => ({ ...previous, status: 'ready' }))
      void startPlayback()
    }).catch(() => {
      if (disposed) return
      setState((previous) => ({ ...previous, status: 'error',
        message: '오디오 파일을 불러오지 못했습니다. Storage 접근 권한과 파일 존재 여부를 확인하세요.' }))
    })

    return () => {
      disposed = true
      ++playRequest
      controls.current = null
      listeners.forEach(([event, listener]) => audio.removeEventListener(event, listener))
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }, [fileId])

  return {
    ...state,
    togglePlayback: () => controls.current?.toggle(),
    seek: (time: number) => controls.current?.seek(time),
  }
}
