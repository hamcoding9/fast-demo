const preferredTypes = [
  'audio/webm;codecs=opus', 'audio/webm',
  'audio/mp4;codecs=mp4a.40.2', 'audio/mp4',
  'audio/ogg;codecs=opus', 'audio/ogg',
]

export function createAudioRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
    ? preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) : undefined
  if (mimeType) {
    try {
      return new MediaRecorder(stream, { mimeType })
    } catch (error) {
      // Some engines advertise a format that cannot be used at runtime.
      if (!(error instanceof DOMException) || error.name !== 'NotSupportedError') throw error
    }
  }
  return new MediaRecorder(stream)
}
