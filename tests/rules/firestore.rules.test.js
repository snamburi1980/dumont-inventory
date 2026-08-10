import { readFileSync } from 'fs'
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore'

// ─────────────────────────────────────────────────────────────────────────────
// Tests the REAL firestore.rules file against a local emulator (no network, no
// cost, no shared state with production). This is the core of the Phase 2
// question "can Store/Org A ever see Store/Org B's data" — asserted, not assumed.
//
// Run with: npm run test:rules  (spins the emulator up and down automatically)
// ─────────────────────────────────────────────────────────────────────────────

let testEnv

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'dumont-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

// Helper: get a Firestore handle authenticated with the given custom claims,
// matching what syncUserClaims/ensureClaims stamp onto a real user's token.
function asUser(claims) {
  return testEnv.authenticatedContext(claims.uid || 'test-uid', claims).firestore()
}
function asAnon() {
  return testEnv.unauthenticatedContext().firestore()
}

// Seed data helper — writes bypass rules entirely (admin context)
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await fn(ctx.firestore())
  })
}

const STORE_A = 'storeA'
const STORE_B = 'storeB'
const ORG_1 = 'org1'
const ORG_2 = 'org2'

describe('Store-level isolation — the baseline multi-store guarantee', () => {
  beforeEach(async () => {
    await seed(async db => {
      await setDoc(doc(db, 'stores', STORE_A), { name: 'Store A', orgId: ORG_1 })
      await setDoc(doc(db, 'stores', STORE_B), { name: 'Store B', orgId: ORG_1 })
      await setDoc(doc(db, 'stores', STORE_A, 'inventory', 'stock'), { item1: 10 })
      await setDoc(doc(db, 'stores', STORE_B, 'inventory', 'stock'), { item1: 99 })
    })
  })

  it('a manager assigned to Store A can read Store A inventory', async () => {
    const db = asUser({ role: 'manager', storeId: STORE_A, email: 'a@dumont.test' })
    await assertSucceeds(getDoc(doc(db, 'stores', STORE_A, 'inventory', 'stock')))
  })

  it('a manager assigned to Store A CANNOT read Store B inventory', async () => {
    const db = asUser({ role: 'manager', storeId: STORE_A, email: 'a@dumont.test' })
    await assertFails(getDoc(doc(db, 'stores', STORE_B, 'inventory', 'stock')))
  })

  it('a manager assigned to Store A CANNOT write to Store B inventory', async () => {
    const db = asUser({ role: 'manager', storeId: STORE_A, email: 'a@dumont.test' })
    await assertFails(setDoc(doc(db, 'stores', STORE_B, 'inventory', 'stock'), { item1: 0 }))
  })

  it('a store_owner assigned to Store A CANNOT read Store B cash register', async () => {
    await seed(db => setDoc(doc(db, 'stores', STORE_B, 'cashRegister', 'e1'), { amount: 500 }))
    const db = asUser({ role: 'store_owner', storeId: STORE_A, email: 'owner@dumont.test' })
    await assertFails(getDoc(doc(db, 'stores', STORE_B, 'cashRegister', 'e1')))
  })

  it('an unauthenticated request is rejected outright', async () => {
    const db = asAnon()
    await assertFails(getDoc(doc(db, 'stores', STORE_A, 'inventory', 'stock')))
  })

  it('super_owner (by email, even with no role claim yet) can read any store', async () => {
    const db = asUser({ email: 'dumonttexas@gmail.com' })
    await assertSucceeds(getDoc(doc(db, 'stores', STORE_B, 'inventory', 'stock')))
  })
})

describe('Store document updates are scoped to the owning store_owner', () => {
  beforeEach(async () => {
    await seed(async db => {
      await setDoc(doc(db, 'stores', STORE_A), { name: 'Store A', orgId: ORG_1 })
      await setDoc(doc(db, 'stores', STORE_B), { name: 'Store B', orgId: ORG_1 })
    })
  })

  it('store_owner can rename their own store', async () => {
    const db = asUser({ role: 'store_owner', storeId: STORE_A, email: 'owner@dumont.test' })
    await assertSucceeds(updateDoc(doc(db, 'stores', STORE_A), { name: 'Renamed A' }))
  })

  it('store_owner CANNOT rename a different store in the same org', async () => {
    const db = asUser({ role: 'store_owner', storeId: STORE_A, email: 'owner@dumont.test' })
    await assertFails(updateDoc(doc(db, 'stores', STORE_B), { name: 'Hijacked' }))
  })

  it('a manager (below store_owner) cannot rename even their own store', async () => {
    const db = asUser({ role: 'manager', storeId: STORE_A, email: 'mgr@dumont.test' })
    await assertFails(updateDoc(doc(db, 'stores', STORE_A), { name: 'Manager tried' }))
  })
})

describe('Role permission boundaries within a store', () => {
  it('staff CANNOT approve an invoice', async () => {
    await seed(db => setDoc(doc(db, 'invoices', 'inv1'), { total: 100, approved: false, orgId: ORG_1 }))
    const db = asUser({ role: 'staff', storeId: STORE_A, email: 'staff@dumont.test' })
    await assertFails(updateDoc(doc(db, 'invoices', 'inv1'), { approved: true }))
  })

  it('a manager CAN log (create) an invoice', async () => {
    const db = asUser({ role: 'manager', storeId: STORE_A, email: 'mgr@dumont.test' })
    await assertSucceeds(addDoc(collection(db, 'invoices'), {
      vendor: 'Test Vendor', total: 50, approved: false, orgId: ORG_1, storeId: STORE_A,
    }))
  })

  it('a manager CANNOT approve an invoice (store_owner+ only)', async () => {
    await seed(db => setDoc(doc(db, 'invoices', 'inv1'), { total: 100, approved: false, orgId: ORG_1 }))
    const db = asUser({ role: 'manager', storeId: STORE_A, email: 'mgr@dumont.test' })
    await assertFails(updateDoc(doc(db, 'invoices', 'inv1'), { approved: true }))
  })

  it('a store_owner CAN approve an invoice', async () => {
    await seed(db => setDoc(doc(db, 'invoices', 'inv1'), { total: 100, approved: false, orgId: ORG_1 }))
    const db = asUser({ role: 'store_owner', storeId: STORE_A, email: 'owner@dumont.test' })
    await assertSucceeds(updateDoc(doc(db, 'invoices', 'inv1'), { approved: true }))
  })

  it('only super_owner can delete an invoice', async () => {
    await seed(db => setDoc(doc(db, 'invoices', 'inv1'), { total: 100, approved: true, orgId: ORG_1 }))
    const storeOwnerDb = asUser({ role: 'store_owner', storeId: STORE_A, email: 'owner@dumont.test' })
    await assertFails(deleteDoc(doc(storeOwnerDb, 'invoices', 'inv1')))
    const superDb = asUser({ role: 'super_owner', email: 'super@dumont.test' })
    await assertSucceeds(deleteDoc(doc(superDb, 'invoices', 'inv1')))
  })

  it('only super_owner can create a region', async () => {
    const managerDb = asUser({ role: 'manager', storeId: STORE_A, email: 'mgr@dumont.test' })
    await assertFails(setDoc(doc(managerDb, 'regions', 'r1'), { name: 'Texas', orgId: ORG_1 }))
    const superDb = asUser({ role: 'super_owner', email: 'super@dumont.test' })
    await assertSucceeds(setDoc(doc(superDb, 'regions', 'r1'), { name: 'Texas', orgId: ORG_1 }))
  })
})

describe('Users collection — privilege escalation attempts must fail', () => {
  it('a user CANNOT grant themselves the store_owner role by editing their own doc', async () => {
    const emailKey = 'staff_at_dumont_test'
    await seed(db => setDoc(doc(db, 'users', emailKey), {
      email: 'staff@dumont.test', role: 'staff', storeId: STORE_A,
    }))
    const db = asUser({ role: 'staff', storeId: STORE_A, email: 'staff@dumont.test' })
    await assertFails(updateDoc(doc(db, 'users', emailKey), { role: 'store_owner' }))
  })

  it('a user CAN update their own forcePasswordChange flag (allowed field)', async () => {
    const emailKey = 'staff_at_dumont_test'
    await seed(db => setDoc(doc(db, 'users', emailKey), {
      email: 'staff@dumont.test', role: 'staff', storeId: STORE_A, forcePasswordChange: true,
    }))
    const db = asUser({ role: 'staff', storeId: STORE_A, email: 'staff@dumont.test' })
    await assertSucceeds(updateDoc(doc(db, 'users', emailKey), { forcePasswordChange: false }))
  })

  it('a user CANNOT edit a DIFFERENT user\'s doc at all', async () => {
    await seed(db => setDoc(doc(db, 'users', 'other_at_dumont_test'), {
      email: 'other@dumont.test', role: 'staff', storeId: STORE_A,
    }))
    const db = asUser({ role: 'staff', storeId: STORE_A, email: 'staff@dumont.test' })
    await assertFails(updateDoc(doc(db, 'users', 'other_at_dumont_test'), { forcePasswordChange: false }))
  })

  it('cannot self-create a user doc claiming super_owner, even with a "valid" invite', async () => {
    await seed(db => setDoc(doc(db, 'invitations', 'tok1'), {
      email: 'attacker@dumont.test', role: 'super_owner', storeId: STORE_A,
      status: 'pending', expiresAt: Date.now() + 100000,
    }))
    const db = asUser({ role: 'staff', email: 'attacker@dumont.test' })
    await assertFails(setDoc(doc(db, 'users', 'attacker_at_dumont_test'), {
      email: 'attacker@dumont.test', role: 'super_owner', storeId: STORE_A, inviteToken: 'tok1',
    }))
  })

  it('cannot self-create a user doc for an invitation that does not exist', async () => {
    const db = asUser({ role: 'staff', email: 'nobody@dumont.test' })
    await assertFails(setDoc(doc(db, 'users', 'nobody_at_dumont_test'), {
      email: 'nobody@dumont.test', role: 'manager', storeId: STORE_A, inviteToken: 'fake-token',
    }))
  })

  it('CAN self-create a user doc that exactly matches a valid pending invitation', async () => {
    await seed(db => setDoc(doc(db, 'invitations', 'tok2'), {
      email: 'newhire@dumont.test', role: 'manager', storeId: STORE_A,
      status: 'pending', expiresAt: Date.now() + 100000,
    }))
    const db = asUser({ role: 'staff', email: 'newhire@dumont.test' })
    await assertSucceeds(setDoc(doc(db, 'users', 'newhire_at_dumont_test'), {
      email: 'newhire@dumont.test', role: 'manager', storeId: STORE_A, inviteToken: 'tok2',
    }))
  })

  it('cannot reuse an EXPIRED invitation to self-create a user doc', async () => {
    await seed(db => setDoc(doc(db, 'invitations', 'tok3'), {
      email: 'late@dumont.test', role: 'manager', storeId: STORE_A,
      status: 'pending', expiresAt: Date.now() - 1000, // already expired
    }))
    const db = asUser({ role: 'staff', email: 'late@dumont.test' })
    await assertFails(setDoc(doc(db, 'users', 'late_at_dumont_test'), {
      email: 'late@dumont.test', role: 'manager', storeId: STORE_A, inviteToken: 'tok3',
    }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-ORG ISOLATION — the actual question a "sell this to other franchise
// groups" buyer will ask. These tests are written against the behavior a real
// multi-tenant SaaS needs, not the behavior the rules currently implement —
// see the assertion comments for what each one actually reveals today.
// ─────────────────────────────────────────────────────────────────────────────
describe('Cross-org isolation (Phase 2 readiness check)', () => {
  beforeEach(async () => {
    await seed(async db => {
      await setDoc(doc(db, 'stores', STORE_A), { name: 'Org 1 Store', orgId: ORG_1 })
      await setDoc(doc(db, 'stores', STORE_B), { name: 'Org 2 Store', orgId: ORG_2 })
      await setDoc(doc(db, 'stores', STORE_B, 'inventory', 'stock'), { secretItem: 42 })
    })
  })

  it('KNOWN GAP: a super_owner claim is platform-wide, not scoped to one org — ' +
     'today this SUCCEEDS, which is correct for a single-tenant app (one owner, ' +
     'one business) but is exactly what must change before onboarding a second ' +
     'paying organisation, since every tenant admin currently gets this same ' +
     "unscoped role.", async () => {
    const otherOrgOwner = asUser({ role: 'super_owner', email: 'owner@othercompany.test' })
    await assertSucceeds(getDoc(doc(otherOrgOwner, 'stores', STORE_B, 'inventory', 'stock')))
  })

  it('KNOWN GAP: regional_owner is also platform-wide, not scoped to their own ' +
     "org's regions — canAccessStore() grants isRegionalOwner() access to ANY " +
     'store regardless of which org or region it belongs to.', async () => {
    const regionalOwner = asUser({ role: 'regional_owner', email: 'regional@dumont.test' })
    await assertSucceeds(getDoc(doc(regionalOwner, 'stores', STORE_B, 'inventory', 'stock')))
  })

  it('a plain store_owner/manager/staff claim IS correctly scoped — this part of ' +
     'the model already works and needs no change', async () => {
    const wrongOrgStoreOwner = asUser({ role: 'store_owner', storeId: STORE_A, email: 'a@org1.test' })
    await assertFails(getDoc(doc(wrongOrgStoreOwner, 'stores', STORE_B, 'inventory', 'stock')))
  })
})
