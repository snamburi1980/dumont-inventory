// Audit logging utility
// Logs all important actions to Firestore for traceability

import { collection, addDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

export const AUDIT_ACTIONS = {
  // Inventory
  INVENTORY_UPDATED:    'inventory.updated',
  STOCK_ADJUSTED:       'stock.adjusted',
  PAR_CHANGED:          'par.changed',
  ITEM_ACTIVATED:       'item.activated',
  ITEM_DEACTIVATED:     'item.deactivated',
  // Sales
  SALES_UPLOADED:       'sales.uploaded',
  SALES_APPLIED:        'sales.applied',
  // Delivery
  DELIVERY_LOGGED:      'delivery.logged',
  // Items
  ITEM_CREATED:         'item.created',
  ITEM_EDITED:          'item.edited',
  ITEM_DELETED:         'item.deleted',
  // Org/Admin
  ORG_CREATED:          'org.created',
  REGION_CREATED:       'region.created',
  STORE_CREATED:        'store.created',
  USER_ASSIGNED:        'user.assigned',
  USER_APPROVED:        'user.approved',
  USER_REJECTED:        'user.rejected',
  // Announcements
  ANNOUNCEMENT_POSTED:  'announcement.posted',
  ANNOUNCEMENT_DELETED: 'announcement.deleted',
  // Issues
  ISSUE_LOGGED:         'issue.logged',
  ISSUE_RESOLVED:       'issue.resolved',
  // SOP
  SOP_UPLOADED:         'sop.uploaded',
  SOP_DELETED:          'sop.deleted',
  // Pricing
  PRICE_UPDATED:        'price.updated',
  // Auth
  USER_LOGIN:           'user.login',
  USER_LOGOUT:          'user.logout',
}

export async function logAudit({ action, storeId, orgId, userId, userEmail, details = {} }) {
  try {
    const entry = {
      action,
      storeId:   storeId   || null,
      orgId:     orgId     || null,
      userId:    userId    || null,
      userEmail: userEmail || null,
      details,
      timestamp: Date.now(),
      date:      new Date().toISOString(),
    }
    // Write to global audit log
    await addDoc(collection(db, 'auditLog'), entry)
    // Also write to store-specific log if storeId provided
    if (storeId) {
      await addDoc(collection(db, 'stores', storeId, 'auditLog'), entry)
    }
  } catch(e) {
    // Never let audit logging break the main flow
    console.warn('Audit log failed (non-critical):', e.message)
  }
}
