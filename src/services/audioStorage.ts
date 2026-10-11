import { getMetadata, listAll, ref } from 'firebase/storage'
import { getFirebaseStorage } from '../config/firebase'
import type { AudioFile } from '../types/audio'

const audioExtension = /\.(mp3|wav|m4a|aac|ogg|oga|opus|webm|flac|aif|aiff|mp4)$/i

export async function listAudioFiles(): Promise<AudioFile[]> {
  const storage = getFirebaseStorage()
  const { items } = await listAll(ref(storage, 'recordings/'))
  const metadata = await Promise.all(items.map((item) => getMetadata(item)))

  // MIME type is authoritative when supplied. Fall back to extensions for uploads
  // with absent/generic metadata, including browser recordings saved as WebM.
  return metadata
    .filter((file) => file.contentType?.startsWith('audio/')
      || file.contentType === 'video/webm'
      || ((!file.contentType || file.contentType === 'application/octet-stream')
        && audioExtension.test(file.name)))
    .map((file) => ({ id: file.fullPath, name: file.name, uploadedAt: file.timeCreated }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.name.localeCompare(b.name))
}
