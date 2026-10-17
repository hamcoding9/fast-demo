import { doc, getDoc } from 'firebase/firestore'
import { getFirebaseFirestore } from '../config/firebase'
import type { Group } from '../types/group'

// URL IDs use a deliberately small, path-safe alphabet (1–128 characters).
export function isValidGroupId(id: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)
}

export async function getGroup(id: string): Promise<Group | null> {
  if (!isValidGroupId(id)) throw new Error('Invalid Group ID.')
  const snapshot = await getDoc(doc(getFirebaseFirestore(), 'groups', id))
  if (!snapshot.exists()) return null
  const data = snapshot.data()
  if (typeof data.name !== 'string' || !data.name.trim() || typeof data.isActive !== 'boolean') {
    throw new Error('Invalid group document.')
  }
  return { id, name: data.name.trim(), isActive: data.isActive }
}
