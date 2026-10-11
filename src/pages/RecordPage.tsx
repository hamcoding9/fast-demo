import { AudioRecorder } from '../components/AudioRecorder'
import { PageHeading } from '../components/PageHeading'

export function RecordPage() {
  return <>
    <PageHeading eyebrow="CAPTURE A MOMENT" title="새로운 녹음" description="떠오르는 생각과 소중한 목소리를 담을 공간입니다." />
    <AudioRecorder />
  </>
}
