export interface RecordedAudio {
  blob: Blob
  url: string
  mimeType: string
}

export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'ready' | 'error' | 'unsupported'
