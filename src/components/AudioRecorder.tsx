import { useAudioRecorder } from '../hooks/useAudioRecorder'
import type { RecordingStatus } from '../types/recording'
import { Icon } from './Icon'

const labels: Record<RecordingStatus, string> = {
  idle: '녹음 준비', requesting: '마이크 연결 중', recording: '녹음 중', stopping: '녹음 정리 중',
  ready: '녹음 완료', error: '녹음 오류', unsupported: '녹음 미지원',
}

export function AudioRecorder() {
  const recorder = useAudioRecorder()
  const time = `${Math.floor(recorder.seconds / 60).toString().padStart(2, '0')}:${(recorder.seconds % 60).toString().padStart(2, '0')}`
  return (
    <section aria-labelledby="recorder-title" className="mx-auto flex max-w-2xl flex-col items-center rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center sm:py-14">
      <p role="status" className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${recorder.status === 'recording' ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700'}`}>
        <span aria-hidden="true" className={`size-2 rounded-full ${recorder.status === 'recording' ? 'bg-red-500' : 'bg-indigo-400'}`} />{labels[recorder.status]}
      </p>
      <h2 id="recorder-title" className="mt-7 text-lg font-semibold">당신의 이야기를 담아보세요</h2>
      <p className="mt-2 text-sm text-slate-500">{recorder.status === 'recording' ? '마이크로 목소리를 기록하고 있습니다.' : '지금의 생각을 목소리로 남겨보세요.'}</p>
      <output role="timer" aria-label="녹음 시간" className="my-9 font-mono text-5xl font-light tabular-nums tracking-tight text-slate-700">{time}</output>
      <div aria-hidden="true" className="mb-9 h-px w-full max-w-xs bg-slate-200" />
      {recorder.error && <p role="alert" className="mb-6 max-w-sm text-sm leading-6 text-red-700">{recorder.error}</p>}
      {recorder.status === 'recording'
        ? <button type="button" onClick={recorder.stopRecording} aria-label="녹음 종료" className="flex size-20 items-center justify-center rounded-full border-8 border-red-50 bg-red-600 text-white hover:bg-red-700"><span aria-hidden="true" className="size-6 rounded bg-white" /></button>
        : recorder.recording
          ? <div className="w-full max-w-sm">
            <p className="mb-5 text-xs text-slate-500">{recorder.recording.mimeType.split(';')[0]} · {Math.ceil(recorder.recording.blob.size / 1024)} KB</p>
            <button type="button" onClick={() => void recorder.togglePreview()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-semibold text-white hover:bg-indigo-700"><Icon name={recorder.isPreviewPlaying ? 'pause' : 'play'} />{recorder.isPreviewPlaying ? '미리 듣기 일시정지' : '미리 듣기'}</button>
            {recorder.previewError && <p role="alert" className="mt-3 text-sm leading-6 text-red-700">{recorder.previewError}</p>}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => void recorder.reRecord()} className="min-h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50">재녹음</button>
              <button type="button" disabled aria-describedby="upload-note" className="min-h-12 rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-400">업로드 (준비 중)</button>
            </div>
            <p id="upload-note" className="mt-3 text-xs leading-5 text-slate-500">업로드 기능은 다음 단계에서 제공됩니다.</p>
          </div>
          : <button type="button" onClick={() => void recorder.startRecording()} disabled={['requesting', 'stopping', 'unsupported'].includes(recorder.status)} aria-label="녹음 시작" className="flex size-20 items-center justify-center rounded-full border-8 border-indigo-50 bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-200 disabled:text-indigo-400"><Icon name="record" className="size-7" /></button>}
      <p className="mt-6 max-w-sm text-xs leading-6 text-slate-500">{recorder.recording
        ? '녹음은 이 페이지의 메모리에만 보관됩니다. 재녹음하거나 페이지를 떠나면 삭제됩니다.'
        : '시작 버튼을 누르면 마이크 사용 권한을 요청합니다. 녹음 파일은 서버에 전송되지 않습니다.'}</p>
    </section>
  )
}
