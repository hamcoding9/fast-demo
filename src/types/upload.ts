import type { AudioFile } from './audio'

export interface RecordingUpload {
  promise: Promise<AudioFile>
  cancel: () => void
}
