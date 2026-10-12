import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { useAudioUpload } from '../hooks/useAudioUpload'
import type { RecordingStatus } from '../types/recording'
import { Icon } from './Icon'

const labels: Record<RecordingStatus, string> = {
  idle: 'Ready to record', requesting: 'Requesting microphone access', recording: 'Recording', stopping: 'Finishing recording',
  ready: 'Recording complete', error: 'Recording error', unsupported: 'Recording unavailable',
}

export function AudioRecorder() {
  const recorder = useAudioRecorder()
  const upload = useAudioUpload(recorder.recording)
  const time = `${Math.floor(recorder.seconds / 60).toString().padStart(2, '0')}:${(recorder.seconds % 60).toString().padStart(2, '0')}`
  return (
    <section aria-labelledby="recorder-title" className="mx-auto flex max-w-2xl flex-col items-center rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center sm:py-14">
      <p role="status" className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${recorder.status === 'recording' ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700'}`}>
        <span aria-hidden="true" className={`size-2 rounded-full ${recorder.status === 'recording' ? 'bg-red-500' : 'bg-indigo-400'}`} />{labels[recorder.status]}
      </p>
      <h2 id="recorder-title" className="mt-7 text-lg font-semibold">Capture your story</h2>
      <p className="mt-2 text-sm text-slate-500">{recorder.status === 'recording' ? 'Your microphone is capturing audio.' : 'Give your thoughts a voice.'}</p>
      <output role="timer" aria-label="Recording time" className="my-9 font-mono text-5xl font-light tabular-nums tracking-tight text-slate-700">{time}</output>
      <div aria-hidden="true" className="mb-9 h-px w-full max-w-xs bg-slate-200" />
      {recorder.error && <p role="alert" className="mb-6 max-w-sm text-sm leading-6 text-red-700">{recorder.error}</p>}
      {recorder.status === 'recording'
        ? <button type="button" onClick={recorder.stopRecording} aria-label="Stop recording" className="flex size-20 items-center justify-center rounded-full border-8 border-red-50 bg-red-600 text-white hover:bg-red-700"><span aria-hidden="true" className="size-6 rounded bg-white" /></button>
        : recorder.recording
          ? <div className="w-full max-w-sm">
            <p className="mb-5 text-xs text-slate-500">{recorder.recording.mimeType.split(';')[0]} · {Math.ceil(recorder.recording.blob.size / 1024)} KB</p>
            <button type="button" onClick={() => void recorder.togglePreview()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-semibold text-white hover:bg-indigo-700"><Icon name={recorder.isPreviewPlaying ? 'pause' : 'play'} />{recorder.isPreviewPlaying ? 'Pause preview' : 'Play preview'}</button>
            {recorder.previewError && <p role="alert" className="mt-3 text-sm leading-6 text-red-700">{recorder.previewError}</p>}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button type="button" disabled={upload.status === 'uploading'} onClick={() => void recorder.reRecord()} className="min-h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">Record again</button>
              <button type="button" onClick={upload.upload} disabled={upload.status === 'uploading' || upload.status === 'success'} className="min-h-12 rounded-xl bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">{upload.status === 'uploading' ? 'Uploading' : upload.status === 'success' ? 'Uploaded' : 'Upload'}</button>
            </div>
            {upload.status === 'uploading' && <div className="mt-4"><progress aria-label="Upload progress" value={upload.progress} max="100" className="h-2 w-full accent-indigo-600" /><p className="mt-1 text-xs tabular-nums text-slate-500">{upload.progress}%</p></div>}
            {upload.message && <p role={upload.status === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm leading-6 ${upload.status === 'error' ? 'text-red-700' : 'text-teal-700'}`}>{upload.message}</p>}
          </div>
          : <button type="button" onClick={() => void recorder.startRecording()} disabled={['requesting', 'stopping', 'unsupported'].includes(recorder.status)} aria-label="Start recording" className="flex size-20 items-center justify-center rounded-full border-8 border-indigo-50 bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-200 disabled:text-indigo-400"><Icon name="record" className="size-7" /></button>}
      <p className="mt-6 max-w-sm text-xs leading-6 text-slate-500">{recorder.recording
        ? 'Before upload, recordings stay in memory. Leaving this page discards the local recording and cancels any pending upload.'
        : 'Start recording to request microphone access. Audio is sent to the server only when you select Upload.'}</p>
    </section>
  )
}
