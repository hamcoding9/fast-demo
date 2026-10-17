import { useSyncExternalStore } from 'react'

interface GroupLocation {
  search: string
  version: number
  suspended: boolean
}
let snapshot: GroupLocation = { search: window.location.search, version: 0, suspended: false }
const listeners = new Set<() => void>()
let stopListening: (() => void) | undefined

function publish(suspended = snapshot.suspended) {
  snapshot = { search: window.location.search, version: snapshot.version + 1, suspended }
  listeners.forEach((listener) => listener())
}

// Keep a unique visit identity: A → B → A must revalidate A, including when
// the first A response has already arrived or B is still pending.
export function getGroupLocationSnapshot() {
  if (snapshot.search !== window.location.search) {
    snapshot = { ...snapshot, search: window.location.search, version: snapshot.version + 1 }
  }
  return snapshot
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    const pushState = window.history.pushState
    const replaceState = window.history.replaceState
    const onHistoryChange = () => {
      if (snapshot.search !== window.location.search) publish()
    }
    const push: History['pushState'] = function (this: History, ...args) {
      pushState.apply(this, args)
      onHistoryChange()
    }
    const replace: History['replaceState'] = function (this: History, ...args) {
      replaceState.apply(this, args)
      onHistoryChange()
    }
    const onPopState = () => publish()
    const onPageHide = () => publish(true)
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted || snapshot.suspended) publish(false)
    }
    window.history.pushState = push
    window.history.replaceState = replace
    window.addEventListener('popstate', onPopState)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    stopListening = () => {
      if (window.history.pushState === push) window.history.pushState = pushState
      if (window.history.replaceState === replace) window.history.replaceState = replaceState
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopListening?.()
      stopListening = undefined
      if (snapshot.suspended) snapshot = { ...snapshot, suspended: false, version: snapshot.version + 1 }
    }
  }
}

export function useGroupLocation() {
  return useSyncExternalStore(subscribe, getGroupLocationSnapshot)
}
