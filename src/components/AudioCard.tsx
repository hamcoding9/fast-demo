import { Icon } from './Icon'
import type { audioPlaceholders } from '../data/audioPlaceholders'

export function AudioCard({ audio }: { audio: (typeof audioPlaceholders)[number] }) {
  return <li className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:gap-4 sm:p-5">
    <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${audio.color}`}><Icon name="wave" /></span>
    <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold sm:text-base">{audio.title}</h3><p className="mt-1 text-xs text-slate-500">{audio.description} <span aria-hidden="true">·</span> 예시 오디오</p></div>
    <span className="text-xs tabular-nums text-slate-500">{audio.duration}</span>
    <button type="button" disabled aria-label={`${audio.title} 재생 (준비 중)`} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Icon name="play" className="size-4" /></button>
  </li>
}
