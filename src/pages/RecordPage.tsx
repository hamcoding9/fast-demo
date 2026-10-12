import { AudioRecorder } from '../components/AudioRecorder'
import { PageHeading } from '../components/PageHeading'

export function RecordPage() {
  return <>
    <PageHeading eyebrow="CAPTURE A MOMENT" title="New Recording" description="Capture your ideas and the voices that matter to you." />
    <AudioRecorder />
  </>
}
