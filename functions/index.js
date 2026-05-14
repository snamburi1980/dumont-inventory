const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')

initializeApp()

// ── Sync Custom Claims whenever a users/{emailKey} doc is written ────────────
// This stamps role + storeId + orgId into the Firebase Auth token so Firestore
// security rules can enforce per-store data isolation without extra DB reads.
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

  // Verify caller is super_owner or store_owner via Custom Claims
  const callerClaims = caller.token
  const allowedRoles = ['super_owner', 'store_owner', 'manager']
  if (!allowedRoles.includes(callerClaims.role)) {
    throw new HttpsError('permission-denied', 'Insufficient role')
  }

  const { email, tempPassword, name, role, storeId, orgId } = request.data
  if (!email || !tempPassword) throw new HttpsError('invalid-argument', 'email and tempPassword required')

  // store_owner and manager can only create staff/manager for their own store
  if (callerClaims.role !== 'super_owner') {
    if (!['staff', 'manager'].includes(role)) {
      throw new HttpsError('permission-denied', 'Can only create staff or manager accounts')
    }
    if (storeId && storeId !== callerClaims.storeId) {
      throw new HttpsError('permission-denied', 'Can only create users for your own store')
    }
  }

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
