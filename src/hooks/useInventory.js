import { useState, useCallback } from 'react'
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { DEFAULT_INVENTORY } from '../data/inventory'
import { logAudit, AUDIT_ACTIONS } from '../utils/auditLogger'

export function useInventory() {
  const [inventory, setInventory] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)

  const loadInventory = useCallback(async (storeId, orgId = 'dumont') => {
    if (!storeId) return
    setLoading(true)
    setError(null)
    try {
      // Load master items from org (Admin -> Items)
      let masterItems = []
      try {
        const orgSnap = await getDocs(collection(db, 'orgs', orgId, 'items'))
        if (!orgSnap.empty) {
          masterItems = orgSnap.docs.map(d => ({ ...d.data(), id: d.id }))
        }
      } catch(e) {}

      // Fall back to hardcoded if Firestore org items empty
      if (!masterItems.length) {
        masterItems = DEFAULT_INVENTORY.map(item => ({
          ...item,
          id: String(item.id),
          cost_price: item.cost || 0,
        }))
      }

      // Load store-specific stock counts
      const snap = await getDoc(doc(db, 'stores', storeId, 'inventory', 'stock'))
      const data  = snap.exists() ? snap.data() : {}

      // Merge master items with store stock counts
      const merged = masterItems.map(item => ({
        ...item,
        id:     item.id,
        stock:  data[item.id]              !== undefined ? data[item.id]              : (item.stock || 0),
        par:    data[`par_${item.id}`]     !== undefined ? data[`par_${item.id}`]     : (item.par   || 1),
        active: data[`active_${item.id}`]  !== undefined ? data[`active_${item.id}`]  : (item.active !== false),
        cost:   item.cost_price || item.cost || 0,
      }))

      setInventory(merged)
    } catch(e) {
      console.error('loadInventory error:', e)
      setError('Failed to load inventory: ' + e.message)
      setInventory(DEFAULT_INVENTORY.map(item => ({ ...item, stock: item.stock || 0 })))
    }
    setLoading(false)
  }, [])

  const saveInventory = useCallback(async (storeId, items) => {
    if (!storeId || !items) return
    try {
      const data = {}
      items.forEach(item => {
        data[item.id]              = item.stock  || 0
        data[`par_${item.id}`]    = item.par     || 0
        data[`active_${item.id}`] = item.active !== false
      })
      await setDoc(doc(db, 'stores', storeId, 'inventory', 'stock'), data, { merge: true })
    } catch(e) {
      console.error('saveInventory error:', e)
      throw new Error('Failed to save inventory: ' + e.message)
    }
  }, [])

  const adjustStock = useCallback((id, delta) => {
    setInventory(prev => prev.map(item =>
      item.id === id || item.id === String(id)
        ? { ...item, stock: Math.max(0, Math.round((item.stock + delta) * 100) / 100) }
        : item
    ))
  }, [])

  const setStock = useCallback((id, value) => {
    const num = parseFloat(value)
    if (isNaN(num)) return
    setInventory(prev => prev.map(item =>
      item.id === id || item.id === String(id) ? { ...item, stock: Math.max(0, num) } : item
    ))
  }, [])

  const toggleActive = useCallback((id) => {
    setInventory(prev => prev.map(item =>
      item.id === id || item.id === String(id)
        ? { ...item, active: item.active === false ? true : false }
        : item
    ))
  }, [])

  const setPar = useCallback((id, value) => {
    const num = parseInt(value)
    if (isNaN(num)) return
    setInventory(prev => prev.map(item =>
      item.id === id || item.id === String(id) ? { ...item, par: Math.max(0, num) } : item
    ))
  }, [])

  const getStatus = useCallback((item) => {
    if (!item || item.active === false) return 'ok'
    if (item.stock <= 0)       return 'critical'
    if (item.stock < item.par) return 'low'
    return 'ok'
  }, [])

  return {
    inventory, loading, error,
    loadInventory, saveInventory,
    adjustStock, setStock, toggleActive, setPar, getStatus,
  }
}
