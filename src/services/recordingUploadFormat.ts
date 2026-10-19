export const MAX_RECORDING_BYTES = 10 * 1024 * 1024

const extensions: Record<string, string> = {
  'audio/webm': 'webm', 'video/webm': 'webm',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/aac': 'aac', 'audio/flac': 'flac',
}

export class AudioUploadValidationError extends Error {}

export function recordingUploadFormat(blob: Blob) {
  if (blob.size === 0) throw new AudioUploadValidationError('Empty recordings cannot be uploaded.')
  if (blob.size > MAX_RECORDING_BYTES) throw new AudioUploadValidationError('Recordings must be 10 MiB or smaller to upload.')
  const contentType = blob.type
  const extension = extensions[contentType.split(';')[0].trim().toLowerCase()]
  if (!extension) throw new AudioUploadValidationError('This recording format cannot be uploaded. Record again in a supported audio format.')
  return { contentType, extension }
}
