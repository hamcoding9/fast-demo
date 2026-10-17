import { getApps, initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super('Firebase configuration is required. Use .env.example to configure .env, then restart the development server.')
    this.name = 'FirebaseNotConfiguredError'
  }
}

// Initialize lazily: missing configuration must never crash application startup.
function getFirebaseApp() {
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
  return app
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseApp())
}

export function getFirebaseFirestore() {
  return getFirestore(getFirebaseApp())
}
