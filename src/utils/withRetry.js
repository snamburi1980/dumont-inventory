// Retries a Firestore write a few times with backoff before giving up.
//
// Store wifi drops for a second or two constantly — without this, a single blip
// mid-save means the user's typed data is gone and they have to redo it. Only
// wraps WRITES (addDoc/setDoc/updateDoc/deleteDoc), never reads: retrying a read
// is harmless, but retrying a non-idempotent write on a false-negative response
// risks a duplicate. Firestore write failures are almost always transport-level
// (offline, timeout) rather than the server having secretly applied the write,
// so retrying here is the right call.
//
//   await withRetry(() => addDoc(collection(db, 'stores', id, 'cashRegister'), data))
//
// Permission and validation errors are NOT retried — retrying a permission
// error 3 times just triples the wait before showing the same failure.
export async function withRetry(fn, { retries = 2, delayMs = 1200 } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const noRetry = e?.code === 'permission-denied' || e?.code === 'invalid-argument' || e?.code === 'unauthenticated'
      if (noRetry || attempt === retries) throw e
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)))
    }
  }
  throw lastErr
}
