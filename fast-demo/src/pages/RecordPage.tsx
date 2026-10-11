import { Icon } from '../components/Icon'
import { PageHeading } from '../components/PageHeading'

export function RecordPage() {
  return <>
    <PageHeading eyebrow="CAPTURE A MOMENT" title="새로운 녹음" description="떠오르는 생각과 소중한 목소리를 담을 공간입니다." />
    <section aria-labelledby="recorder-title" className="mx-auto flex max-w-2xl flex-col items-center rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center sm:py-14">
      <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">녹음 기능 준비 중</span>
      <h2 id="recorder-title" className="mt-7 text-lg font-semibold">당신의 이야기를 담아보세요</h2>
      <p className="mt-2 text-sm text-slate-500">녹음 컨트롤이 이곳에 표시됩니다.</p>
      <p aria-label="녹음 시간 0분 0초" className="my-9 font-mono text-5xl font-light tracking-tight text-slate-700">00:00</p>
      <div aria-hidden="true" className="mb-9 h-px w-full max-w-xs bg-slate-200" />
      <button type="button" disabled aria-label="녹음 시작 (준비 중)" className="flex size-20 items-center justify-center rounded-full border-8 border-indigo-50 bg-indigo-200 text-indigo-500"><Icon name="record" className="size-7" /></button>
      <p className="mt-6 max-w-sm text-xs leading-6 text-slate-500">현재는 UI 미리보기 단계입니다.<br />마이크 접근, 녹음 및 저장은 아직 지원하지 않습니다.</p>
    </section>
  </>
}
