import { AudioLibrary } from '../components/AudioLibrary'
import { Icon } from '../components/Icon'
import { PageHeading } from '../components/PageHeading'
import { Waveform } from '../components/Waveform'

export function PlayPage() {
  return <>
    <PageHeading eyebrow="YOUR AUDIO SPACE" title="나의 오디오" description="기록한 순간을 한곳에서, 언제든 다시 들어보세요." />
    <div className="grid items-start gap-8 md:grid-cols-[1fr_300px]">
      <AudioLibrary />
      <aside aria-labelledby="player-title" className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-6 text-center">
        <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-white text-indigo-600"><Icon name="headphones" /></span>
        <h2 id="player-title" className="font-semibold">당신의 순간을 다시 듣다</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">오디오 플레이어가 이곳에 표시됩니다.</p>
        <div className="my-5"><Waveform /></div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-indigo-700">재생 기능 준비 중</span>
      </aside>
    </div>
  </>
}
