import { Icon } from './Icon'
import type { AudioFile } from '../types/audio'

export function AudioCard({ audio, onSelect }: { audio: AudioFile; onSelect: (audio: AudioFile) => void }) {
  const date = new Date(audio.uploadedAt)
  const formattedDate = Number.isNaN(date.getTime()) ? '날짜 정보 없음' : new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date)
  return <li className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:gap-4 sm:p-5">
    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon name="wave" /></span>
    <div className="min-w-0 flex-1">
      <h3 className="text-sm font-semibold sm:text-base"><button type="button" title={audio.name} onClick={() => onSelect(audio)} className="min-h-11 max-w-full truncate text-left hover:text-indigo-700">{audio.name}</button></h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">업로드 · {Number.isNaN(date.getTime())
        ? formattedDate : <time dateTime={audio.uploadedAt}>{formattedDate}</time>}</p>
    </div>
    <button type="button" onClick={() => onSelect(audio)} aria-label={`${audio.name} 재생`} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100"><Icon name="play" className="size-4" /></button>
  </li>
}
