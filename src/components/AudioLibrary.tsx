import { useState } from 'react'
import { useAudioList } from '../hooks/useAudioList'
import type { AudioFile } from '../types/audio'
import { AudioCard } from './AudioCard'
import { AudioPlayer } from './AudioPlayer'

export function AudioLibrary() {
  const { state, refresh } = useAudioList()
  const [selected, setSelected] = useState<AudioFile | null>(null)
  return (
    <section aria-labelledby="library-title" aria-busy={state.status === 'loading'}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="library-title" className="text-sm font-semibold">
          오디오 라이브러리
          {state.status === 'ready' && <span className="ml-2 text-slate-400">{state.files.length.toString().padStart(2, '0')}</span>}
        </h2>
        <button type="button" onClick={refresh} disabled={state.status === 'loading'} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          새로고침
        </button>
      </div>
      {state.status === 'loading' && <p role="status" className="library-message">오디오 목록을 불러오는 중입니다…</p>}
      {state.status === 'unconfigured' && <p role="status" className="library-message">{state.message}</p>}
      {state.status === 'error' && <p role="alert" className="library-message text-red-700">{state.message}</p>}
      {state.status === 'ready' && (state.files.length > 0
        ? <ul className="space-y-3">{state.files.map((audio) => <AudioCard key={audio.id} audio={audio} onSelect={setSelected} />)}</ul>
        : <p role="status" className="library-message">저장된 오디오가 없습니다. recordings/에 오디오 파일을 업로드한 후 새로고침하세요.</p>)}
      <p className="mt-5 text-xs leading-5 text-slate-500">파일 이름이나 재생 버튼을 눌러 오디오를 들어보세요.</p>
      {selected && <AudioPlayer key={selected.id} audio={selected} files={state.status === 'ready' ? state.files : [selected]} onSelect={setSelected} onClose={() => setSelected(null)} />}
    </section>
  )
}
