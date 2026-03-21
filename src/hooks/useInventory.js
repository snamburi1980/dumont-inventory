import { useState, useCallback } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { DEFAULT_INVENTORY } from '../data/inventory'
import { logAudit, AUDIT_ACTIONS } from '../utils/auditLogger'

export function useInventory() {
  const [inventory, setInventory] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)

  const loadInventory = useCallback(async (storeId) => {
    if (!storeId) return
    setLoading(true)
    setError(null)
    try {
      const snap = await getDoc(doc(db, 'stores', storeId, 'inventory', 'stock'))
      if (snap.exists()) {
        const data = snap.data()
        // Merge saved stock counts with default inventory structure
        const merged = DEFAULT_INVENTORY.map(item => ({
          ...item,
          stock: data[item.id] !== undefined ? data[item.id] : (item.stock || 0),
          par:   data[`par_${item.id}`]    !== undefined ? data[`par_${item.id}`]    : item.par,
          active:data[`active_${item.id}`] !== undefined ? data[`active_${item.id}`] : (item.active !== false),
        }))
        setInventory(merged)
      } else {
        // First time — use defaults with stock = 0
        setInventory(DEFAULT_INVENTORY.map(item => ({ ...item, stock: item.stock || 0 })))
      }
    } catch(e) {
      console.error('loadInventory error:', e)
      setError('Failed to load inventory: ' + e.message)
      // Fallback to defaults so app still works
      setInventory(DEFAULT_INVENTORY.map(item => ({ ...item, stock: item.stock || 0 })))
    }
    setLoading(false)
  }, [])

  const saveInventory = useCallback(async (storeId, items, userEmail, orgId) => {
    if (!storeId || !items) return
    try {
      // Flatten to a single document for fast reads
      const data = {}
      items.forEach(item => {
        data[item.id]              = item.stock  || 0
        data[`par_${item.id}`]    = item.par     || 0
        data[`active_${item.id}`] = item.active !== false
      })
      await setDoc(doc(db, 'stores', storeId, 'inventory', 'stock'), data, { merge: true })
      
      // Audit log
      if (userEmail) {
        await audit.inventoryUpdate(orgId || 'dumont', userEmail, storeId, items.length)
      }
    } catch(e) {
      console.error('saveInventory error:', e)
      throw new Error('Failed to save inventory: ' + e.message)
    }
  }, [])

  const adjustStock = useCallback((id, delta) => {
    setInventory(prev => prev.map(item =>
      item.id === id
        ? { ...item, stock: Math.max(0, Math.round((item.stock + delta) * 100) / 100) }
        : item
    ))
  }, [])

  const setStock = useCallback((id, value) => {
    const num = parseFloat(value)
    if (isNaN(num)) return
    setInventory(prev => prev.map(item =>
      item.id === id ? { ...item, stock: Math.max(0, num) } : item
    ))
  }, [])

  const toggleActive = useCallback((id) => {
    setInventory(prev => prev.map(item =>
      item.id === id ? { ...item, active: item.active === false ? true : false } : item
    ))
  }, [])

  const setPar = useCallback((id, value) => {
    const num = parseInt(value)
    if (isNaN(num)) return
    setInventory(prev => prev.map(item =>
      item.id === id ? { ...item, par: Math.max(0, num) } : item
    ))
  }, [])

  const getStatus = useCallback((item) => {
    if (!item || item.active === false) return 'ok'
    if (item.stock <= 0)         return 'critical'
    if (item.stock < item.par)   return 'low'
    return 'ok'
  }, [])

  return {
    inventory, loading, error,
    loadInventory, saveInventory,
    adjustStock, setStock, toggleActive, setPar, getStatus,
  }
}
