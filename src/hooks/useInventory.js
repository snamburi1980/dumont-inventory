import { useState, useCallback } from 'react'
import { doc, getDoc, setDoc, collection, getDocs, addDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { DEFAULT_INVENTORY } from '../data/inventory'

export function useInventory() {
  const [inventory, setInventory] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)

  const loadInventory = useCallback(async (storeId, orgId = 'dumont') => {
    if (!storeId) return
    setLoading(true)
    setError(null)
    try {
      let masterItems = []
      try {
        const orgSnap = await getDocs(collection(db, 'orgs', orgId, 'items'))
        if (!orgSnap.empty) masterItems = orgSnap.docs.map(d => ({ ...d.data(), id: d.id }))
      } catch(e) {}

      if (!masterItems.length) {
        masterItems = DEFAULT_INVENTORY.map(item => ({ ...item, id: String(item.id), cost_price: item.cost || 0 }))
      }

      const snap = await getDoc(doc(db, 'stores', storeId, 'inventory', 'stock'))
      const data  = snap.exists() ? snap.data() : {}

      const merged = masterItems.map(item => ({
        ...item,
        id:     item.id,
        stock:  data[item.id] !== undefined ? data[item.id] : (item.stock || 0),
        par:    data[`par_override_${item.id}`] !== undefined ? data[`par_override_${item.id}`] : (item.par || data[`par_${item.id}`] || 1),
        active: data[`active_${item.id}`] !== undefined ? data[`active_${item.id}`] : (item.active !== false),
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
        data[item.id]                    = item.stock || 0
        data[`par_${item.id}`]          = item.par || 0
        data[`par_override_${item.id}`] = item.par || 0
        data[`active_${item.id}`]       = item.active !== false
      })
      await setDoc(doc(db, 'stores', storeId, 'inventory', 'stock'), data, { merge: true })
    } catch(e) {
      console.error('saveInventory error:', e)
      throw new Error('Failed to save inventory: ' + e.message)
    }
  }, [])

  // Log stock decrease to Firestore for usage tracking
  const logStockChange = useCallback(async (storeId, item, delta, userName) => {
    if (!storeId || delta >= 0) return
    try {
      const now = new Date()
      await addDoc(collection(db, 'stores', storeId, 'stockLog'), {
        itemId:    item.id,
        itemName:  item.name,
        category:  item.cat || 'Other',
        delta,
        stockAfter: Math.max(0, (item.stock || 0) + delta),
        userName:  userName || 'Staff',
        timestamp: Date.now(),
        date:      now.toLocaleDateString(),
        month:     now.toLocaleDateString('en-US', { month:'long', year:'numeric' }),
        monthKey:  `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`,
      })
    } catch(e) { console.error('logStockChange:', e) }
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
      item.id === id || item.id === String(id) ? { ...item, active: item.active === false ? true : false } : item
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
    loadInventory, saveInventory, logStockChange,
    adjustStock, setStock, toggleActive, setPar, getStatus,
  }
}