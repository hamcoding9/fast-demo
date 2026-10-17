import { collection, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { getFirebaseFirestore } from '../config/firebase'
import type { AudioFile } from '../types/audio'
import { isValidGroupId } from './groups'

export class InvalidAudioMetadataError extends Error {
  constructor() {
    super('Some audio metadata is invalid. Ask the project organizer to check the audios documents, then refresh.')
    this.name = 'InvalidAudioMetadataError'
  }
}

function validStoragePath(path: unknown, groupId: string): path is string {
  if (typeof path !== 'string') return false
  const parts = path.split('/')
  // Explicitly registered legacy flat objects remain playable. Nested objects
  // must belong to this group; never accept a URL or a different group's path.
  return parts[0] === 'recordings' && parts.length >= 2
    && parts.every((part) => part.length > 0 && part !== '.' && part !== '..')
    && (parts.length === 2 || parts[1] === groupId)
}

export async function listAudioFiles(groupId: string): Promise<AudioFile[]> {
  if (!isValidGroupId(groupId)) throw new Error('Invalid Group ID.')
  const request = query(collection(getFirebaseFirestore(), 'audios'),
    where('groupId', '==', groupId), where('status', '==', 'ready'), orderBy('uploadedAt', 'desc'))
  const snapshot = await getDocs(request)
  const files: AudioFile[] = []
  for (const document of snapshot.docs) {
    const data = document.data()
    // Defense in depth: never display another group or an unfinished upload.
    if (data.groupId !== groupId || data.status !== 'ready') continue
    if (typeof data.fileName !== 'string' || !data.fileName.trim()
      || !validStoragePath(data.storagePath, groupId)
      || typeof data.contentType !== 'string'
      || !/^(audio\/[^;\s]+|video\/webm)(;.*)?$/.test(data.contentType)
      || !Number.isSafeInteger(data.size) || data.size <= 0
      || !(data.uploadedAt instanceof Timestamp)) throw new InvalidAudioMetadataError()
    files.push({ id: document.id, name: data.fileName, groupId,
      storagePath: data.storagePath, contentType: data.contentType, size: data.size,
      status: 'ready', uploadedAt: data.uploadedAt.toDate().toISOString() })
  }
  return files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.id.localeCompare(b.id))
}
