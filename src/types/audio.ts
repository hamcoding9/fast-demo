export interface AudioFile {
  /** Firestore document ID, independent of the Storage object path. */
  id: string
  name: string
  groupId: string
  storagePath: string
  contentType: string
  size: number
  status: 'ready'
  uploadedAt: string
}
