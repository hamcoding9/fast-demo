import { useEffect, useRef, useState } from 'react'
import { createAudioRecorder } from '../services/recordingFormat'
import type { RecordedAudio, RecordingStatus } from '../types/recording'

interface RecorderState {
  status: RecordingStatus
  seconds: number
  recording: RecordedAudio | null
  error: string | null
  isPreviewPlaying: boolean
  previewError: string | null
}
interface Session {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  startedAt: number | null
  stoppedSeconds: number | null
  timer: ReturnType<typeof setInterval> | null
  tracksReleased: boolean
  detach: () => void
}
interface Preview {
  audio: HTMLAudioElement
  url: string
  playRequest: number
  detach: () => void
}

function supported() {
  return globalThis.isSecureContext !== false && typeof MediaRecorder === 'function'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
}
function initialState(): RecorderState {
  return {
    status: supported() ? 'idle' : 'unsupported', seconds: 0, recording: null,
    error: supported() ? null : '이 환경에서는 마이크 녹음을 지원하지 않습니다. 최신 브라우저에서 HTTPS 또는 localhost로 접속하세요.',
    isPreviewPlaying: false, previewError: null,
  }
}
function elapsed(session: Session) {
  return session.startedAt === null ? 0 : Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000))
}
function stopTimer(session: Session) {
  if (session.timer !== null) clearInterval(session.timer)
  session.timer = null
}
function stopTracks(session: Session) {
  if (!session.tracksReleased) session.stream.getTracks().forEach((track) => track.stop())
  session.tracksReleased = true
}
function releaseSession(session: Session | null) {
  if (!session) return
  session.detach()
  stopTimer(session)
  try { if (session.recorder.state !== 'inactive') session.recorder.stop() } catch {
    // A failed recorder stop must not prevent microphone and timer cleanup.
  } finally {
    stopTracks(session)
    session.chunks.length = 0
  }
}
function releasePreview(preview: Preview | null) {
  if (!preview) return
  ++preview.playRequest
  preview.detach()
  preview.audio.pause()
  preview.audio.removeAttribute('src')
  preview.audio.load()
  URL.revokeObjectURL(preview.url)
}
function microphoneError(error: unknown) {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return '마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 사용을 허용한 뒤 다시 시도하세요.'
  if (name === 'NotFoundError') return '사용 가능한 마이크를 찾을 수 없습니다. 마이크 연결을 확인하세요.'
  if (name === 'NotReadableError') return '마이크를 사용할 수 없습니다. 다른 앱의 마이크 사용 여부를 확인하세요.'
  return '녹음을 시작하지 못했습니다. 마이크 연결과 브라우저 지원 여부를 확인한 뒤 다시 시도하세요.'
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>(initialState)
  const sessionRef = useRef<Session | null>(null)
  const previewRef = useRef<Preview | null>(null)
  const mounted = useRef(true)
  const attempt = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    mounted.current = true
    function releaseResources() {
      ++attempt.current
      busy.current = false
      releaseSession(sessionRef.current)
      sessionRef.current = null
      releasePreview(previewRef.current)
      previewRef.current = null
    }
    function onPageHide() {
      releaseResources()
      setState(initialState())
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      mounted.current = false
      window.removeEventListener('pagehide', onPageHide)
      releaseResources()
    }
  }, [])

  async function startRecording() {
    if (busy.current) return
    if (!supported()) { setState(initialState()); return }
    busy.current = true
    const request = ++attempt.current
    releasePreview(previewRef.current)
    previewRef.current = null
    setState({ ...initialState(), status: 'requesting' })
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current || request !== attempt.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const recorder = createAudioRecorder(stream)
      const session: Session = { recorder, stream, chunks: [], startedAt: null,
        stoppedSeconds: null, timer: null, tracksReleased: false, detach: () => {} }
      sessionRef.current = session
      const active = () => mounted.current && sessionRef.current === session && attempt.current === request

      function onStart() {
        if (!active()) return
        session.startedAt = Date.now()
        setState((previous) => ({ ...previous, status: 'recording' }))
        session.timer = setInterval(() => {
          if (active()) setState((previous) => ({ ...previous, seconds: elapsed(session) }))
        }, 250)
      }
      function onData(event: BlobEvent) {
        if (active() && event.data.size > 0) session.chunks.push(event.data)
      }
      function onError() {
        if (!active()) return
        sessionRef.current = null
        busy.current = false
        releaseSession(session)
        setState((previous) => ({ ...previous, status: 'error', error: '녹음 중 오류가 발생했습니다. 다시 녹음해주세요.' }))
      }
      function onStop() {
        if (!active()) return
        const seconds = session.stoppedSeconds ?? elapsed(session)
        const mimeType = recorder.mimeType || session.chunks.find((chunk) => chunk.type)?.type || 'application/octet-stream'
        const blob = new Blob(session.chunks, { type: mimeType })
        sessionRef.current = null
        busy.current = false
        releaseSession(session)
        if (!blob.size) {
          setState((previous) => ({ ...previous, status: 'error', seconds, error: '녹음된 데이터가 없습니다. 다시 녹음해주세요.' }))
          return
        }
        let url: string | null = null
        try {
          url = URL.createObjectURL(blob)
          const audio = new Audio()
          const preview: Preview = { audio, url, playRequest: 0, detach: () => {} }
          const previewActive = () => mounted.current && previewRef.current === preview
          const onPlay = () => { if (previewActive()) setState((previous) => ({ ...previous, isPreviewPlaying: true })) }
          const onPause = () => { if (previewActive()) setState((previous) => ({ ...previous, isPreviewPlaying: false })) }
          const onMediaError = () => { if (previewActive()) setState((previous) => ({ ...previous, isPreviewPlaying: false, previewError: '녹음 파일을 재생할 수 없습니다. 다시 녹음하거나 다른 브라우저를 사용해보세요.' })) }
          const listeners: [string, () => void][] = [['play', onPlay], ['pause', onPause], ['ended', onPause], ['error', onMediaError]]
          listeners.forEach(([event, listener]) => audio.addEventListener(event, listener))
          preview.detach = () => listeners.forEach(([event, listener]) => audio.removeEventListener(event, listener))
          previewRef.current = preview
          audio.preload = 'metadata'
          audio.src = url
          audio.load()
          setState({ status: 'ready', seconds, recording: { blob, url, mimeType }, error: null, isPreviewPlaying: false, previewError: null })
        } catch {
          if (previewRef.current) releasePreview(previewRef.current)
          else if (url) URL.revokeObjectURL(url)
          previewRef.current = null
          setState((previous) => ({ ...previous, status: 'error', seconds, error: '녹음 미리 듣기를 준비하지 못했습니다. 다시 시도하세요.' }))
        }
      }

      recorder.addEventListener('start', onStart)
      recorder.addEventListener('dataavailable', onData)
      recorder.addEventListener('stop', onStop)
      recorder.addEventListener('error', onError)
      session.detach = () => {
        recorder.removeEventListener('start', onStart)
        recorder.removeEventListener('dataavailable', onData)
        recorder.removeEventListener('stop', onStop)
        recorder.removeEventListener('error', onError)
      }
      recorder.start(250)
    } catch (error) {
      if (!mounted.current || request !== attempt.current) return
      if (sessionRef.current) releaseSession(sessionRef.current)
      else stream?.getTracks().forEach((track) => track.stop())
      sessionRef.current = null
      busy.current = false
      setState((previous) => ({ ...previous, status: 'error', error: microphoneError(error) }))
    }
  }

  function stopRecording() {
    const session = sessionRef.current
    if (!session || session.recorder.state === 'inactive' || session.stoppedSeconds !== null) return
    session.stoppedSeconds = elapsed(session)
    stopTimer(session)
    setState((previous) => ({ ...previous, status: 'stopping', seconds: session.stoppedSeconds! }))
    try {
      session.recorder.stop()
      stopTracks(session)
    } catch {
      sessionRef.current = null
      busy.current = false
      releaseSession(session)
      setState((previous) => ({ ...previous, status: 'error', error: '녹음을 종료하지 못했습니다. 다시 시도하세요.' }))
    }
  }

  async function togglePreview() {
    const preview = previewRef.current
    if (!preview) return
    const request = ++preview.playRequest
    if (!preview.audio.paused) { preview.audio.pause(); return }
    setState((previous) => ({ ...previous, previewError: null }))
    try {
      if (preview.audio.ended) preview.audio.currentTime = 0
      await preview.audio.play()
      if (mounted.current && previewRef.current === preview && request === preview.playRequest) {
        setState((previous) => ({ ...previous, isPreviewPlaying: !preview.audio.paused }))
      }
    } catch {
      if (mounted.current && previewRef.current === preview && request === preview.playRequest) {
        setState((previous) => ({ ...previous, isPreviewPlaying: false, previewError: '미리 듣기를 시작하지 못했습니다. 재생 버튼을 다시 누르거나 브라우저 설정을 확인하세요.' }))
      }
    }
  }

  return { ...state, startRecording, stopRecording, togglePreview, reRecord: startRecording }
}
