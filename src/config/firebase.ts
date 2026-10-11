import { getApps, initializeApp } from 'firebase/app'
import { getStorage } from 'firebase/storage'

export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super('Firebase 설정이 필요합니다. .env.example을 참고해 .env를 설정하고 개발 서버를 다시 시작하세요.')
    this.name = 'FirebaseNotConfiguredError'
  }
}

// Initialize lazily: missing configuration must never crash application startup.
export function getFirebaseStorage() {
  const options = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
    appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
  }

  if (!options.apiKey || !options.projectId || !options.storageBucket || !options.appId) {
    throw new FirebaseNotConfiguredError()
  }

  const app = getApps().find((existing) => existing.name === 'fast-demo')
    ?? initializeApp(options, 'fast-demo')
  return getStorage(app)
}
