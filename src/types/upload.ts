export interface UploadedRecording {
  id: string
  name: string
  groupId: string
  storagePath: string
}

export interface RecordingUpload {
  promise: Promise<UploadedRecording>
  cancel: () => void
}
