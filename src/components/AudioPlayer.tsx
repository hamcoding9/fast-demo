import { useEffect, useId, useRef } from 'react'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import type { AudioFile } from '../types/audio'
import { Icon } from './Icon'
import { Waveform } from './Waveform'

interface Props {
  audio: AudioFile
  files: AudioFile[]
  onSelect: (audio: AudioFile) => void
  onClose: () => void
}

function formatTime(seconds: number) {
  const time = Math.floor(seconds)
  return `${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toString().padStart(2, '0')}`
}

export function AudioPlayer({ audio, files, onSelect, onClose }: Props) {
  const player = useAudioPlayer(audio.id)
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const ended = player.duration > 0 && player.currentTime >= player.duration && !player.isPlaying

  useEffect(() => {
    const element = dialog.current!
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  return (
    <dialog ref={dialog} aria-labelledby={headingId} onCancel={(event) => { event.preventDefault(); onClose() }} className="audio-player-modal w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-indigo-100 bg-white p-0 text-slate-800 shadow-2xl">
      <div className="overflow-y-auto p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-bold tracking-[0.2em] text-indigo-600">NOW LISTENING</p>
            <h2 id={headingId} className="break-all text-lg font-semibold">{audio.name}</h2>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="Close player" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"><Icon name="close" /></button>
        </div>
        <div className="my-8 rounded-2xl bg-indigo-50 py-5"><Waveform /></div>
        {player.status === 'loading' && <p role="status" className="mb-5 text-sm text-slate-500">Loading audio…</p>}
        {player.message && <p role={player.status === 'error' ? 'alert' : 'status'} className="mb-5 text-sm leading-6 text-slate-600">{player.message}</p>}
        <label className="sr-only" htmlFor={`${headingId}-seek`}>Playback position</label>
        <input id={`${headingId}-seek`} type="range" min="0" max={player.duration || 1} step="0.1" value={Math.min(player.currentTime, player.duration || 0)} disabled={player.status !== 'ready' || player.duration <= 0} onChange={(event) => player.seek(Number(event.target.value))} className="min-h-11 w-full accent-indigo-600 disabled:opacity-40" />
        <div className="flex justify-between font-mono text-xs tabular-nums text-slate-500">
          <span aria-label="Current time">{formatTime(player.currentTime)}</span>
          <span aria-label="Total duration">{formatTime(player.duration)}</span>
        </div>
        <div className="my-7 flex justify-center">
          <button type="button" disabled={player.status !== 'ready' || player.isStarting} onClick={player.togglePlayback} aria-label={player.isPlaying ? 'Pause' : ended ? 'Replay' : 'Play'} className="flex size-16 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-40"><Icon name={player.isPlaying ? 'pause' : 'play'} /></button>
        </div>
        {files.length > 1 && <label className="block text-xs font-medium text-slate-500">Choose another recording
          <select aria-label="Choose another recording" value={audio.id} onChange={(event) => { const next = files.find((file) => file.id === event.target.value); if (next) onSelect(next) }} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
            {files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
          </select>
        </label>}
      </div>
    </dialog>
  )
}
