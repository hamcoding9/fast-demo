import { AudioLibrary } from '../components/AudioLibrary'
import { Icon } from '../components/Icon'
import { PageHeading } from '../components/PageHeading'
import { Waveform } from '../components/Waveform'

export function PlayPage({ cloudEnabled }: { cloudEnabled: boolean }) {
  return <>
    <PageHeading eyebrow="YOUR AUDIO SPACE" title="My Audio" description="Your recordings, together in one place. Listen whenever you like." />
    <div className="grid items-start gap-8 md:grid-cols-[1fr_300px]">
      {cloudEnabled ? <AudioLibrary /> : <section aria-label="Audio library" className="library-message">Verify your group to access the audio library.</section>}
      <aside aria-labelledby="player-title" className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-6 text-center">
        <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-white text-indigo-600"><Icon name="headphones" /></span>
        <h2 id="player-title" className="font-semibold">Listen to your moments</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">Select a recording from your library to start listening.</p>
        <div className="my-5"><Waveform /></div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-indigo-700">Your personal audio player</span>
      </aside>
    </div>
  </>
}
