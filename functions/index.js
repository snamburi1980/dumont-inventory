const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule }         = require('firebase-functions/v2/scheduler')
const { defineSecret }       = require('firebase-functions/params')
const { initializeApp }      = require('firebase-admin/app')
const { getAuth }            = require('firebase-admin/auth')
const { getFirestore }       = require('firebase-admin/firestore')
const { google }             = require('googleapis')

const AnthropicLib    = require('@anthropic-ai/sdk')
const Anthropic       = AnthropicLib.default || AnthropicLib

// ── Firebase secrets for invoice pipeline ────────────────────────────────────
const GMAIL_CLIENT_ID     = defineSecret('GMAIL_CLIENT_ID')
const GMAIL_CLIENT_SECRET = defineSecret('GMAIL_CLIENT_SECRET')
const GMAIL_REFRESH_TOKEN = defineSecret('GMAIL_REFRESH_TOKEN')
const ANTHROPIC_API_KEY   = defineSecret('ANTHROPIC_API_KEY')

const KNOWN_SENDERS = [
  'ben-e-keith',
  'bek.com',
  'stripe.com',
  'apparatus',
  'sentryinsights',
  'dumonttexas@gmail.com',  // owner can forward/send test invoices
]

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

// ── Invoice pipeline: scan Gmail every 20 min, parse with Claude ─────────────
exports.parseInvoices = onSchedule({
  schedule: 'every 20 minutes',
  timeZone: 'America/Chicago',
  secrets: [GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, ANTHROPIC_API_KEY],
}, async () => {
  const db = getFirestore()

  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID.value(),
    GMAIL_CLIENT_SECRET.value()
  )
  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN.value() })
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })

  // Last-check timestamp (default: 7 days ago on first run)
  const metaRef      = db.collection('_invoiceMeta').doc('lastCheck')
  const meta         = await metaRef.get()
  const lastCheckSec = meta.exists
    ? Math.floor(meta.data().ts / 1000)
    : Math.floor((Date.now() - 7 * 24 * 3600 * 1000) / 1000)

  const fromQuery = KNOWN_SENDERS.map(s => `from:${s}`).join(' OR ')
  const q         = `(${fromQuery}) after:${lastCheckSec}`

  let messages = []
  try {
    const resp = await gmail.users.messages.list({ userId: 'me', q, maxResults: 25 })
    messages   = resp.data.messages || []
  } catch (e) {
    console.error('Gmail list failed:', e.message)
    return
  }
  console.log(`parseInvoices: ${messages.length} candidate emails`)

  for (const msg of messages) {
    try {
      // Skip duplicates
      const dup = await db.collection('invoices').where('emailId', '==', msg.id).limit(1).get()
      if (!dup.empty) continue

      const full    = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
      const headers = full.data.payload?.headers || []
      const subject = headers.find(h => h.name === 'Subject')?.value || ''
      const from    = headers.find(h => h.name === 'From')?.value    || ''
      const date    = headers.find(h => h.name === 'Date')?.value    || ''
      const body    = extractEmailBody(full.data.payload)

      if (!body || body.length < 30) continue

      let parsed = null
      try {
        const aiResp = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `Extract invoice/billing data from this email and return ONLY valid JSON (no markdown, no explanation):
{
  "vendor": "vendor company name",
  "invoiceNumber": "invoice or order number or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "dueDate": "YYYY-MM-DD or null",
  "storeName": "store or location name if mentioned, else null",
  "items": [{ "description": "item name", "qty": 1, "unit": "each", "unitCost": 0.00, "total": 0.00 }],
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00,
  "notes": "delivery notes, payment terms, or empty string"
}

Subject: ${subject}
From: ${from}
Body:
${body.substring(0, 4000)}`,
          }],
        })
        const text  = (aiResp.content[0]?.text || '').trim()
        const match = text.match(/\{[\s\S]*\}/)
        if (match) parsed = JSON.parse(match[0])
      } catch (e) {
        console.error(`Claude parse error for ${msg.id}:`, e.message)
      }

      await db.collection('invoices').add({
        emailId:       msg.id,
        subject,
        from,
        emailDate:     date,
        body:          body.substring(0, 600),
        vendor:        parsed?.vendor        || vendorFromEmail(from),
        invoiceNumber: parsed?.invoiceNumber || null,
        invoiceDate:   parsed?.invoiceDate   || null,
        dueDate:       parsed?.dueDate       || null,
        storeName:     parsed?.storeName     || null,
        items:         parsed?.items         || [],
        subtotal:      Number(parsed?.subtotal) || 0,
        tax:           Number(parsed?.tax)       || 0,
        total:         Number(parsed?.total)     || 0,
        notes:         parsed?.notes         || '',
        orgId:        'dumont',
        approved:      false,
        approvedBy:    null,
        approvedAt:    null,
        createdAt:     Date.now(),
      })
      console.log(`Saved invoice: "${subject}" from ${from}`)
    } catch (e) {
      console.error(`Error processing ${msg.id}:`, e.message)
    }
  }

  await metaRef.set({ ts: Date.now() })
})

function extractEmailBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
    }
    for (const part of payload.parts) {
      const nested = extractEmailBody(part)
      if (nested) return nested
    }
  }
  return ''
}

function vendorFromEmail(from) {
  if (from.toLowerCase().includes('bek.com'))        return 'Ben E. Keith'
  if (from.toLowerCase().includes('stripe'))         return 'Stripe'
  if (from.toLowerCase().includes('apparatus'))      return 'Apparatus TX'
  if (from.toLowerCase().includes('sentryinsight'))  return 'Sentry Insights'
  const match = from.match(/^([^<@]+)/)
  return match ? match[1].trim() : from
}
