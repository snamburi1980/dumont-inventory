const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule }         = require('firebase-functions/v2/scheduler')
const { initializeApp }      = require('firebase-admin/app')
const { getAuth }            = require('firebase-admin/auth')
const { getFirestore }       = require('firebase-admin/firestore')

initializeApp()

// ── Sync Custom Claims whenever a users/{emailKey} doc is written ────────────
// This stamps role + storeId + orgId into the Firebase Auth token so Firestore
// security rules can enforce per-store data isolation without extra DB reads.
// ── Ensure custom claims are set for the calling user ────────────────────────
// Called on every login from useAuth.js. Reads the user's Firestore doc and stamps
// role/storeId/orgId claims into the token so Firestore security rules work correctly.
// This fixes the case where users existed before syncUserClaims was deployed.
exports.ensureClaims = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in')
  const email    = request.auth.token.email
  const emailKey = email.replace(/\./g, '_').replace(/@/g, '_at_')
  try {
    const db   = getFirestore()
    const snap = await db.collection('users').doc(emailKey).get()
    if (!snap.exists()) return { skipped: true, reason: 'no user doc' }
    const data   = snap.data()
    const claims = {
      role:    data.role    || 'staff',
      storeId: data.storeId || data.store || '',
      orgId:   data.orgId   || 'dumont',
    }
    await getAuth().setCustomUserClaims(request.auth.uid, claims)
    return { success: true, claims }
  } catch(e) {
    console.error('ensureClaims failed:', e)
    return { error: e.message }
  }
})

exports.syncUserClaims = onDocumentWritten('users/{emailKey}', async (event) => {
  const after = event.data?.after?.data()
  if (!after?.email) return

  const claims = {
    role:    after.role    || 'staff',
    storeId: after.storeId || after.store || '',
    orgId:   after.orgId   || 'dumont',
  }

  try {
    const auth       = getAuth()
    const userRecord = await auth.getUserByEmail(after.email)
    await auth.setCustomUserClaims(userRecord.uid, claims)
    console.log(`Claims set for ${after.email}:`, claims)
  } catch (e) {
    // User may not have a Firebase Auth account yet (invited but not registered)
    console.warn(`syncUserClaims skipped for ${after.email}:`, e.message)
  }
})

// ── Delete a Firebase Auth user account ──────────────────────────────────────
exports.deleteAuthUser = onCall({ cors: true }, async (request) => {
  const caller = request.auth
  if (!caller) throw new HttpsError('unauthenticated', 'Must be signed in')
  if (caller.token.role !== 'super_owner' && caller.token.email !== 'dumonttexas@gmail.com') {
    throw new HttpsError('permission-denied', 'Only super_owner can delete Auth accounts')
  }
  const { email } = request.data
  if (!email) throw new HttpsError('invalid-argument', 'email required')
  try {
    const userRecord = await getAuth().getUserByEmail(email)
    await getAuth().deleteUser(userRecord.uid)
    console.log(`Auth account deleted for ${email}`)
    return { success: true }
  } catch (e) {
    if (e.code === 'auth/user-not-found') return { success: true }
    throw new HttpsError('internal', e.message)
  }
})

// ── Create a Firebase Auth user account (called from Admin invite flow) ──────
// Needed because createUserWithEmailAndPassword can only be called by the
// user themselves. This function is called by super_owner / store_owner to
// pre-create an account with a temp password before sending an invite.
exports.createAuthUser = onCall({ cors: true }, async (request) => {
  const caller = request.auth
  if (!caller) throw new HttpsError('unauthenticated', 'Must be signed in')

  // User management is super_owner only — store owners/managers request HQ
  const callerClaims = caller.token
  if (callerClaims.role !== 'super_owner' && callerClaims.email !== 'dumonttexas@gmail.com') {
    throw new HttpsError('permission-denied', 'Only super_owner can create accounts')
  }

  const { email, tempPassword, name, role, storeId, orgId } = request.data
  if (!email || !tempPassword) throw new HttpsError('invalid-argument', 'email and tempPassword required')
  if (role === 'super_owner') throw new HttpsError('permission-denied', 'Cannot create super_owner accounts')

  const auth = getAuth()
  const db   = getFirestore()

  try {
    // Create or get existing Auth account
    let uid
    try {
      const existing = await auth.getUserByEmail(email)
      uid = existing.uid
    } catch (_) {
      const newUser = await auth.createUser({
        email,
        password:    tempPassword,
        displayName: name || email,
      })
      uid = newUser.uid
    }

    // Write Firestore user doc
    const emailKey = email.toLowerCase().replace(/\./g, '_').replace(/@/g, '_at_')
    await db.collection('users').doc(emailKey).set({
      uid,
      email:               email.toLowerCase(),
      name:                name || email,
      role:                role || 'staff',
      storeId:             storeId || '',
      store:               storeId || '',
      orgId:               orgId   || 'dumont',
      status:              'active',
      forcePasswordChange: true,
      createdAt:           Date.now(),
    })

    // Set Custom Claims immediately
    await auth.setCustomUserClaims(uid, {
      role:    role    || 'staff',
      storeId: storeId || '',
      orgId:   orgId   || 'dumont',
    })

    return { success: true, uid }
  } catch (e) {
    console.error('createAuthUser failed:', e)
    if (e.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'An account with this email already exists')
    }
    throw new HttpsError('internal', e.message)
  }
})

// ── Clear a store: all its data, and optionally its users ────────────────────
// super_owner only. Recursively deletes stores/{storeId} (inventory, checklists,
// schedule, stockLog, cashRegister, etc.), the store doc itself, its invitations,
// and — when deleteUsers is true — the Firestore user docs AND Firebase Auth
// accounts of everyone assigned to that store.
exports.clearStoreData = onCall({ cors: true, timeoutSeconds: 300 }, async (request) => {
  const caller = request.auth
  if (!caller) throw new HttpsError('unauthenticated', 'Must be signed in')
  if (caller.token.role !== 'super_owner' && caller.token.email !== 'dumonttexas@gmail.com') {
    throw new HttpsError('permission-denied', 'Only super_owner can clear stores')
  }

  const { storeId, deleteUsers } = request.data
  if (!storeId) throw new HttpsError('invalid-argument', 'storeId required')

  const db   = getFirestore()
  const auth = getAuth()
  const result = { storeDeleted: false, usersDeleted: [], invitationsDeleted: 0 }

  try {
    // Delete users assigned to this store (Firestore doc + Auth account)
    if (deleteUsers) {
      const userSnap = await db.collection('users').where('storeId', '==', storeId).get()
      const legacySnap = await db.collection('users').where('store', '==', storeId).get()
      const seen = new Set()
      for (const d of [...userSnap.docs, ...legacySnap.docs]) {
        if (seen.has(d.id)) continue
        seen.add(d.id)
        const u = d.data()
        if (u.role === 'super_owner' || u.email === 'dumonttexas@gmail.com') continue
        try {
          const rec = await auth.getUserByEmail(u.email)
          await auth.deleteUser(rec.uid)
        } catch (e) {
          if (e.code !== 'auth/user-not-found') console.warn(`Auth delete failed for ${u.email}:`, e.message)
        }
        await d.ref.delete()
        result.usersDeleted.push(u.email)
      }
    }

    // Delete invitations pointing at this store
    const invSnap = await db.collection('invitations').where('storeId', '==', storeId).get()
    for (const d of invSnap.docs) { await d.ref.delete(); result.invitationsDeleted++ }

    // Recursively delete the store doc and every subcollection under it
    await db.recursiveDelete(db.doc(`stores/${storeId}`))
    result.storeDeleted = true

    console.log(`Store ${storeId} cleared by ${caller.token.email}:`, result)
    return { success: true, ...result }
  } catch (e) {
    console.error('clearStoreData failed:', e)
    throw new HttpsError('internal', e.message)
  }
})

// ── Missed opening-checklist alert ───────────────────────────────────────────
// Runs daily at 12:30 PM Central. Emails the owner if any active store has not
// submitted an opening checklist yet today.
// NOTE: sends via the EmailJS REST API — "Allow EmailJS API for non-browser
// applications" must be enabled in the EmailJS dashboard (Account → Security).
exports.checkOpeningChecklists = onSchedule(
  { schedule: '30 12 * * *', timeZone: 'America/Chicago' },
  async () => {
    const db = getFirestore()

    // Start of today in Central time
    const now      = new Date()
    const central  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
    const midnight = new Date(central); midnight.setHours(0, 0, 0, 0)
    const startTs  = now.getTime() - (central.getTime() - midnight.getTime())

    const storesSnap = await db.collection('stores').get()
    const missing = []
    for (const s of storesSnap.docs) {
      const st = s.data()
      if (st.status && st.status !== 'active') continue
      const snap = await db.collection('stores').doc(s.id)
        .collection('checklists').where('submittedAt', '>=', startTs).get()
      const hasOpening = snap.docs.some(d => d.data().type === 'opening')
      if (!hasOpening) missing.push(st.name || s.id)
    }

    if (!missing.length) {
      console.log('All active stores submitted opening checklists today')
      return
    }

    const timeStr = central.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const message =
      `Opening checklist NOT submitted today for:\n\n` +
      missing.map(n => `• ${n}`).join('\n') +
      `\n\nChecked at ${timeStr} Central.\n\nDumont Inventory App`

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  'service_hrmh6gj',
        template_id: 'template_qz6w4dk',
        user_id:     'J6H5AoKpjqurMWiVd',
        template_params: {
          to_email:  'dumonttexas@gmail.com',
          subject:   `⚠ Opening checklist missing — ${missing.join(', ')}`,
          message,
          from_name: 'Dumont Inventory',
        },
      }),
    })
    console.log('Missed-checklist alert:', missing.join(', '), '| email status:', res.status, await res.text())
  }
)

