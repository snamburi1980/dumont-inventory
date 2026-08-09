import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: "AIzaSyBofsUP3yf2OkaQVPav8rfxUiax39TkxYY",
  authDomain: "dumont-inventory.firebaseapp.com",
  projectId: "dumont-inventory",
  storageBucket: "dumont-inventory.firebasestorage.app",
  messagingSenderId: "208739741985",
  appId: "1:208739741985:web:85493fbe669b0e43b78e60"
}

const app = initializeApp(firebaseConfig)

// Offline-first: stores read data in IndexedDB and QUEUES WRITES made while the
// device is offline, flushing them when the connection returns. Critical for a
// store floor with patchy wi-fi — without this, a save during a dropout is lost.
// Falls back to the in-memory cache if the browser blocks IndexedDB (private mode).
let firestore
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
} catch (e) {
  console.warn('Firestore offline cache unavailable, using memory cache:', e?.message)
  firestore = getFirestore(app)
}

export const auth      = getAuth(app)
export const db        = firestore
export const functions = getFunctions(app)
export default app
