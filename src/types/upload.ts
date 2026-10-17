// Legacy Storage-only upload result. Group metadata is added in Step 4.
export interface UploadedRecording {
  id: string
  name: string
  uploadedAt: string
}

export interface RecordingUpload {
  promise: Promise<UploadedRecording>
  cancel: () => void
}
