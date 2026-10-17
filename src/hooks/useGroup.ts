import { useEffect, useState } from 'react'
import { FirebaseNotConfiguredError } from '../config/firebase'
import { getGroup, isValidGroupId } from '../services/groups'
import { getGroupLocationSnapshot, useGroupLocation } from './useGroupLocation'
import type { GroupState } from '../types/group'

export function useGroup() {
  const location = useGroupLocation()
  const { search, suspended, version } = location
  const ids = new URLSearchParams(search).getAll('groupId')
  const id = ids[0] ?? ''
  const valid = ids.length === 1 && isValidGroupId(id)
  const [revision, setRevision] = useState(0)
  const requestKey = JSON.stringify([search, version, revision])
  const [result, setResult] = useState<{ key: string; state: GroupState } | null>(null)

  useEffect(() => {
    if (!valid || suspended) return
    let active = true
    getGroup(id).then((group) => {
      if (!active || getGroupLocationSnapshot() !== location) return
      const state: GroupState = !group ? { status: 'not-found' }
        : !group.isActive ? { status: 'inactive' } : { status: 'ready', group }
      setResult({ key: requestKey, state })
    }, (error: unknown) => {
      if (!active || getGroupLocationSnapshot() !== location) return
      setResult({ key: requestKey, state: { status: 'error', message: error instanceof FirebaseNotConfiguredError
        ? error.message : 'Unable to load this group. Check your connection and Firestore permissions, then try again.' } })
    })
    return () => { active = false }
  }, [id, valid, requestKey, location, suspended])

  const state: GroupState = ids.length === 0 || (ids.length === 1 && !id) ? { status: 'missing' }
    : !valid ? { status: 'invalid' }
      : !suspended && result?.key === requestKey ? result.state : { status: 'loading' }
  return { state, retry: () => setRevision((value) => value + 1), scopeKey: requestKey }
}
