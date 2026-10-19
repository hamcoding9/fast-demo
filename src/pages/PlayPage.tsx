import { AudioLibrary } from '../components/AudioLibrary'
import { PageHeading } from '../components/PageHeading'

export function PlayPage({ groupId }: { groupId: string | null }) {
  return <>
    <PageHeading eyebrow="YOUR AUDIO SPACE" title="My Audio" />
    {groupId ? <AudioLibrary key={groupId} groupId={groupId} /> : <section aria-label="Audio library" className="library-message">Verify your group to access the audio library.</section>}
  </>
}
