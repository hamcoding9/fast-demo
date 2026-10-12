export const MAX_RECORDING_BYTES = 10 * 1024 * 1024

const extensions: Record<string, string> = {
  'audio/webm': 'webm', 'video/webm': 'webm',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/aac': 'aac', 'audio/flac': 'flac',
}

export class AudioUploadValidationError extends Error {}

export function recordingUploadFormat(blob: Blob) {
  if (blob.size === 0) throw new AudioUploadValidationError('빈 녹음 파일은 업로드할 수 없습니다.')
  if (blob.size > MAX_RECORDING_BYTES) throw new AudioUploadValidationError('녹음 파일은 10 MiB 이하만 업로드할 수 있습니다.')
  const contentType = blob.type
  const extension = extensions[contentType.split(';')[0].trim().toLowerCase()]
  if (!extension) throw new AudioUploadValidationError('이 녹음 형식은 업로드할 수 없습니다. 지원되는 오디오 형식으로 다시 녹음해주세요.')
  return { contentType, extension }
}

export function uniqueRecordingName(extension: string) {
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
    : `${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(2))).join('-')}`
  return `recording-${id}.${extension}`
}
