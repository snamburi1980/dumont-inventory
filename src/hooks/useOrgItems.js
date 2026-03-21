import { useState, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { DEFAULT_INVENTORY } from '../data/inventory'

// Converts hardcoded item to Firestore format
function toFirestoreItem(item) {
  return {
    id:          String(item.id),
    name:        item.name,
    code:        item.code || '',
    cat:         item.cat || 'General',
    vendor:      item.vendor || '',
    uom:         item.uom || 'UNIT',
    cost_price:  item.cost || 0,
    sell_price:  0,
    par:         item.par || 1,
    case_size:   item.case_size || 1,
    order_qty:   item.order_qty || '1',
    active:      true,
    scoops_per_bucket: item.scoops_per_bucket || null,
    clover_name: item.clover_name || null,
    updatedAt:   Date.now(),
  }
}

export function useOrgItems(orgId) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(false)

  const loadItems = useCallback(async (oid) => {
    if (!oid) return
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'orgs', oid, 'items'))
      if (!snap.empty) {
        // Load from Firestore
        const firestoreItems = snap.docs.map(d => ({ ...d.data(), id: d.id }))
        setItems(firestoreItems)
      } else {
        // First time — seed from hardcoded DEFAULT_INVENTORY
        const seeded = DEFAULT_INVENTORY.map(toFirestoreItem)
        // Save to Firestore
        for (const item of seeded) {
          await setDoc(doc(db, 'orgs', oid, 'items', item.id), item)
        }
        setItems(seeded)
        console.log(`Seeded ${seeded.length} items for org: ${oid}`)
      }
    } catch(e) {
      console.warn('useOrgItems error, using defaults', e)
      setItems(DEFAULT_INVENTORY.map(toFirestoreItem))
    }
    setLoading(false)
  }, [])

  const addItem = useCallback(async (oid, item) => {
    const id = String(Date.now())
    const newItem = { ...toFirestoreItem(item), id, updatedAt: Date.now() }
    await setDoc(doc(db, 'orgs', oid, 'items', id), newItem)
    setItems(prev => [...prev, newItem])
    return newItem
  }, [])

  const updateItem = useCallback(async (oid, id, changes) => {
    const updated = { ...changes, updatedAt: Date.now() }
    await setDoc(doc(db, 'orgs', oid, 'items', String(id)), updated, { merge: true })
    setItems(prev => prev.map(i => i.id === String(id) ? { ...i, ...updated } : i))
  }, [])

  const deleteItem = useCallback(async (oid, id) => {
    await deleteDoc(doc(db, 'orgs', oid, 'items', String(id)))
    setItems(prev => prev.filter(i => i.id !== String(id)))
  }, [])

  // Load sell prices for a store
  const loadSellPrices = useCallback(async (storeId) => {
    try {
      const snap = await getDoc(doc(db, 'stores', storeId, 'pricing', 'sell_prices'))
      return snap.exists() ? snap.data() : {}
    } catch(e) { return {} }
  }, [])

  const saveSellPrice = useCallback(async (storeId, itemId, sellPrice) => {
    await setDoc(
      doc(db, 'stores', storeId, 'pricing', 'sell_prices'),
      { [String(itemId)]: sellPrice },
      { merge: true }
    )
  }, [])

  return {
    items, loading,
    loadItems, addItem, updateItem, deleteItem,
    loadSellPrices, saveSellPrice,
  }
}
