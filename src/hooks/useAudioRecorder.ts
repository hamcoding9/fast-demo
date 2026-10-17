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
    error: supported() ? null : 'Microphone recording is not supported in this environment. Use a recent browser over HTTPS or localhost.',
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
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Microphone access was denied. Allow microphone access in your browser settings, then try again.'
  if (name === 'NotFoundError') return 'No microphone was found. Check that a microphone is connected.'
  if (name === 'NotReadableError') return 'The microphone is unavailable. Check whether another app is using it.'
  return 'Unable to start recording. Check your microphone connection and browser support, then try again.'
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
        setState((previous) => ({ ...previous, status: 'error', error: 'An error occurred while recording. Please record again.' }))
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
          setState((previous) => ({ ...previous, status: 'error', seconds, error: 'No audio was captured. Please record again.' }))
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
          const onMediaError = () => { if (previewActive()) setState((previous) => ({ ...previous, isPreviewPlaying: false, previewError: 'Unable to play the recording. Record again or try another browser.' })) }
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
          setState((previous) => ({ ...previous, status: 'error', seconds, error: 'Unable to prepare the recording preview. Please try again.' }))
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
      setState((previous) => ({ ...previous, status: 'error', error: 'Unable to stop recording. Please try again.' }))
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
      if (!mounted.current || previewRef.current !== preview) { preview.audio.pause(); return }
      if (mounted.current && previewRef.current === preview && request === preview.playRequest) {
        setState((previous) => ({ ...previous, isPreviewPlaying: !preview.audio.paused }))
      }
    } catch {
      if (mounted.current && previewRef.current === preview && request === preview.playRequest) {
        setState((previous) => ({ ...previous, isPreviewPlaying: false, previewError: 'Unable to start the preview. Press Play preview again or check your browser settings.' }))
      }
    }
  }

  return { ...state, startRecording, stopRecording, togglePreview, reRecord: startRecording }
}
