import { AudioRecorder } from '../components/AudioRecorder'
import { PageHeading } from '../components/PageHeading'

export function RecordPage({ groupId }: { groupId: string | null }) {
  return <>
    <PageHeading eyebrow="CAPTURE A MOMENT" title="New Recording" />
    <AudioRecorder groupId={groupId} />
  </>
}
