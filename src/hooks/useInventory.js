import { useState, useCallback } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { DEFAULT_INVENTORY } from '../data/inventory'

export function useInventory(storeId) {
  const [inventory, setInventory] = useState([])
  const [loading,   setLoading]   = useState(false)

  const loadInventory = useCallback(async (sid) => {
    if (!sid) return
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'stores', sid, 'inventory', 'stock'))
      const stockMap = snap.exists() ? snap.data() : {}
      const merged = DEFAULT_INVENTORY.map(item => ({
        ...item,
        stock:  stockMap[String(item.id)]  !== undefined ? stockMap[String(item.id)]  : 0,
        active: stockMap[`active_${item.id}`] !== undefined ? stockMap[`active_${item.id}`] : true,
      }))
      setInventory(merged)
    } catch(e) {
      console.error('loadInventory error', e)
      setInventory(DEFAULT_INVENTORY.map(i => ({ ...i, stock: 0 })))
    }
    setLoading(false)
  }, [])

  const saveInventory = useCallback(async (sid, inv) => {
    if (!sid) return
    const stockMap = {}
    inv.forEach(item => {
      stockMap[String(item.id)] = item.stock
      if (item.active === false) stockMap[`active_${item.id}`] = false
    })
    await setDoc(doc(db, 'stores', sid, 'inventory', 'stock'), stockMap, { merge: true })
  }, [])

  const adjustStock = useCallback((id, delta) => {
    setInventory(prev => prev.map(item =>
      item.id === id
        ? { ...item, stock: Math.max(0, Math.round((item.stock + delta) * 10) / 10) }
        : item
    ))
  }, [])

  const setStock = useCallback((id, value) => {
    setInventory(prev => prev.map(item =>
      item.id === id ? { ...item, stock: Math.max(0, parseFloat(value) || 0) } : item
    ))
  }, [])

  const toggleActive = useCallback((id) => {
    setInventory(prev => prev.map(item =>
      item.id === id ? { ...item, active: item.active === false ? true : false } : item
    ))
  }, [])

  const setPar = useCallback((id, value) => {
    setInventory(prev => prev.map(item =>
      item.id === id ? { ...item, par: Math.max(0, parseInt(value) || 0) } : item
    ))
  }, [])

  function getStatus(item) {
    if (!item || item.stock === undefined) return 'ok'
    if (item.stock === 0)           return 'critical'
    if (item.stock <= item.par / 2) return 'critical'
    if (item.stock <= item.par)     return 'low'
    return 'ok'
  }

  return { inventory, loading, loadInventory, saveInventory, adjustStock, setStock, toggleActive, setPar, getStatus }
}
