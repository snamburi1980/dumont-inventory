import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore'
import { db } from '../firebase/config'

export default function Picks({ invHook, viewingStore, viewingOrg, auth, showToast }) {
  const { inventory, saveInventory, loadInventory } = invHook

  const [session,      setSession]      = useState({})   // { itemId: count } — current unsaved picks
  const [saving,       setSaving]       = useState(false)
  const [logDate,      setLogDate]      = useState(() => new Date().toISOString().slice(0,10))
  const [activeMonth,  setActiveMonth]  = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [usageData,    setUsageData]    = useState([])
  const [usageDetails, setUsageDetails] = useState([])  // individual log entries for the month
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [showDetails,  setShowDetails]  = useState(false)

  const userName      = auth?.userConfig?.name || 'Staff'
  const iceCreamItems = inventory.filter(i => i.cat === 'Ice Cream' && i.active !== false)

  useEffect(() => {
    if (viewingStore) {
      invHook.loadInventory(viewingStore, viewingOrg || 'dumont')
    }
  }, [viewingStore, viewingOrg])

  useEffect(() => {
    if (viewingStore) loadUsage(activeMonth)
  }, [viewingStore, activeMonth])

  // ── Session helpers ─────────────────────────────────────────
  function tap(item) {
    setSession(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }))
  }

  function adjust(itemId, delta) {
    setSession(prev => {
      const next = (prev[itemId] || 0) + delta
      if (next <= 0) {
        const copy = { ...prev }
        delete copy[itemId]
        return copy
      }
      return { ...prev, [itemId]: next }
    })
  }

  const sessionEntries = iceCreamItems.filter(i => session[i.id] > 0)
  const totalBuckets   = sessionEntries.reduce((s, i) => s + session[i.id], 0)

  // ── Save ────────────────────────────────────────────────────
  async function savePicks() {
    if (!sessionEntries.length) { showToast('Tap a flavor first'); return }
    setSaving(true)
    try {
      const now      = new Date(logDate + 'T12:00:00')
      const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      const month    = now.toLocaleDateString('en-US', { month:'long', year:'numeric' })

      // Log each flavor
      for (const item of sessionEntries) {
        const qty = session[item.id]
        await addDoc(collection(db, 'stores', viewingStore, 'stockLog'), {
          itemId:    item.id,
          itemName:  item.name,
          category:  'Ice Cream',
          delta:     -qty,
          stockAfter: Math.max(0, (item.stock || 0) - qty),
          userName,
          timestamp: Date.now(),
          date:      now.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
          month,
          monthKey,
        })
      }

      // Update inventory stock
      const updated = inventory.map(item => {
        if (!session[item.id]) return item
        return { ...item, stock: Math.max(0, (item.stock || 0) - session[item.id]) }
      })
      await saveInventory(viewingStore, updated)
      await loadInventory(viewingStore)

      showToast(`${totalBuckets} bucket${totalBuckets > 1 ? 's' : ''} logged`)
      setSession({})
      loadUsage(activeMonth)
    } catch(e) {
      console.error(e)
      showToast('Save failed — try again')
    }
    setSaving(false)
  }

  // ── Usage report ────────────────────────────────────────────
  async function loadUsage(monthKey) {
    if (!viewingStore) return
    setLoadingUsage(true)
    try {
      const q    = query(
        collection(db, 'stores', viewingStore, 'stockLog'),
        where('monthKey', '==', monthKey),
        orderBy('timestamp', 'desc')
      )
      const snap = await getDocs(q)
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Aggregate by flavor
      const byItem = {}
      logs.forEach(log => {
        const name = log.itemName
        if (!byItem[name]) byItem[name] = { name, buckets: 0, sessions: 0, lastDate: '' }
        byItem[name].buckets  += Math.abs(log.delta)
        byItem[name].sessions += 1
        if (!byItem[name].lastDate) byItem[name].lastDate = log.date || ''
      })
      setUsageData(Object.values(byItem).sort((a,b) => b.buckets - a.buckets))
      setUsageDetails(logs)
    } catch(e) {}
    setLoadingUsage(false)
  }

  async function clearMonth() {
    if (!window.confirm(`Clear all logs for this month? This will also restore inventory counts.`)) return
    // Tally how many buckets to restore per item
    const restore = {}
    usageDetails.forEach(log => {
      if (!restore[log.itemId]) restore[log.itemId] = 0
      restore[log.itemId] += Math.abs(log.delta)
    })
    // Restore inventory
    if (Object.keys(restore).length) {
      const updated = inventory.map(item => {
        if (!restore[item.id]) return item
        return { ...item, stock: (item.stock || 0) + restore[item.id] }
      })
      try {
        await saveInventory(viewingStore, updated)
        await loadInventory(viewingStore)
      } catch(e) { console.error('Restore inventory failed', e) }
    }
    // Delete log entries
    for (const d of usageDetails) {
      try { await deleteDoc(doc(db, 'stores', viewingStore, 'stockLog', d.id)) } catch(e) {}
    }
    setUsageData([])
    setUsageDetails([])
    showToast('Cleared — inventory restored')
  }

  // ── Month list ──────────────────────────────────────────────
  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    return {
      key:   `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label: d.toLocaleDateString('en-US', { month:'short', year:'numeric' }),
    }
  })

  const totalMonthBuckets = usageData.reduce((s, r) => s + r.buckets, 0)
  const maxBuckets        = usageData[0]?.buckets || 1

  // ── Render ──────────────────────────────────────────────────
  return (
    <div>

      {/* ── LOG PANEL ─────────────────────────────────────── */}
      <div style={{ background:'#fff', border:'1px solid var(--border,#EDE0CC)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>

        {/* Header */}
        <div style={{ background:'var(--dark,#2C1810)', padding:'12px 16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Log Bucket Pickup</div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>Date</span>
              <input type="date" value={logDate}
                max={new Date().toISOString().slice(0,10)}
                onChange={e => setLogDate(e.target.value)}
                style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'3px 6px', fontSize:11, fontFamily:'inherit', colorScheme:'dark' }} />
            </div>
          </div>
          {totalBuckets > 0 && (
            <div style={{ marginTop:8, fontSize:11, color:'rgba(255,255,255,0.65)' }}>
              Pending: {totalBuckets} bucket{totalBuckets>1?'s':''} — {sessionEntries.length} flavor{sessionEntries.length>1?'s':''}
            </div>
          )}
        </div>

        {/* Flavor grid */}
        {iceCreamItems.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', color:'#8B7355', fontSize:13 }}>
            No ice cream items — add stock in Inventory first
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'#EDE0CC' }}>
            {iceCreamItems.map(item => {
              const qty     = session[item.id] || 0
              const picked  = qty > 0
              return (
                <div key={item.id}
                  style={{ background: picked ? '#FFF3E0' : '#fff', padding:'10px 12px', cursor:'pointer', transition:'background 0.1s' }}
                  onClick={() => tap(item)}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                    <div style={{ flex:1, overflow:'hidden' }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#2C1810', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize:10, color:'#8B7355', marginTop:1 }}>
                        {item.stock ?? 0} in freezer
                      </div>
                    </div>
                    {picked ? (
                      <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                        <button onClick={e => { e.stopPropagation(); adjust(item.id, -1) }}
                          style={{ width:24, height:24, borderRadius:6, border:'1px solid #C8843A', background:'#fff', color:'#C8843A', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                          −
                        </button>
                        <span style={{ fontSize:15, fontWeight:800, color:'#E65100', minWidth:18, textAlign:'center' }}>{qty}</span>
                        <button onClick={e => { e.stopPropagation(); adjust(item.id, 1) }}
                          style={{ width:24, height:24, borderRadius:6, border:'1px solid #27AE60', background:'#E8F5E9', color:'#27AE60', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                          +
                        </button>
                      </div>
                    ) : (
                      <div style={{ width:28, height:28, borderRadius:8, background:'#F5EFE8', border:'1px solid #EDE0CC', display:'flex', alignItems:'center', justifyContent:'center', color:'#C8843A', fontSize:18, fontWeight:700, flexShrink:0 }}>
                        +
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Save bar */}
        {totalBuckets > 0 && (
          <div style={{ padding:'12px 16px', background:'#FFF3E0', borderTop:'1px solid #FFB74D', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1 }}>
              {sessionEntries.map(item => (
                <span key={item.id} style={{ display:'inline-block', background:'#2C1810', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:600, marginRight:6, marginBottom:4 }}>
                  {item.name} ×{session[item.id]}
                </span>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              <button onClick={() => setSession({})}
                style={{ background:'#888', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
                Reset
              </button>
              <button onClick={savePicks} disabled={saving}
                style={{ background: saving ? '#aaa' : '#E65100', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit' }}>
                {saving ? 'Saving...' : `Save ${totalBuckets} Bucket${totalBuckets>1?'s':''}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MONTHLY HISTORY ───────────────────────────────── */}
      <div style={{ background:'#fff', border:'1px solid var(--border,#EDE0CC)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ background:'var(--dark,#2C1810)', padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Monthly Usage</div>
          {usageData.length > 0 && (
            <button onClick={clearMonth}
              style={{ background:'rgba(231,76,60,0.8)', color:'#fff', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>
              Clear Month
            </button>
          )}
        </div>

        {/* Month selector */}
        <div style={{ display:'flex', gap:6, padding:'10px 14px', overflowX:'auto', borderBottom:'1px solid #EDE0CC', scrollbarWidth:'none' }}>
          {monthOptions.map(m => (
            <button key={m.key} onClick={() => setActiveMonth(m.key)}
              style={{ padding:'5px 12px', borderRadius:20, border:'1px solid #EDE0CC', cursor:'pointer', fontSize:11, fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0,
                background: activeMonth===m.key ? '#2C1810' : '#fff',
                color:      activeMonth===m.key ? '#fff' : '#8B7355',
                fontWeight: activeMonth===m.key ? 700 : 400 }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Summary bar */}
        {usageData.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'#EDE0CC', borderBottom:'1px solid #EDE0CC' }}>
            <div style={{ background:'#FFFBF5', padding:'10px 16px', textAlign:'center' }}>
              <div style={{ fontSize:24, fontWeight:800, color:'#E65100' }}>{totalMonthBuckets}</div>
              <div style={{ fontSize:10, color:'#8B7355', textTransform:'uppercase' }}>Total Buckets</div>
            </div>
            <div style={{ background:'#FFFBF5', padding:'10px 16px', textAlign:'center' }}>
              <div style={{ fontSize:24, fontWeight:800, color:'#2C1810' }}>{usageData.length}</div>
              <div style={{ fontSize:10, color:'#8B7355', textTransform:'uppercase' }}>Flavors Used</div>
            </div>
          </div>
        )}

        {/* Flavor breakdown */}
        <div style={{ padding:'0 0 8px' }}>
          {loadingUsage ? (
            <div style={{ padding:24, textAlign:'center', color:'#8B7355', fontSize:13 }}>Loading...</div>
          ) : usageData.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'#8B7355', fontSize:13 }}>No pickups logged for this month</div>
          ) : (
            <>
              {usageData.map((row, i) => (
                <div key={row.name} style={{ padding:'10px 16px', borderBottom:'1px solid #F5EFE8', background: i%2===0?'#fff':'#FDFAF6' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#2C1810' }}>{row.name}</div>
                    <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                      <span style={{ fontSize:11, color:'#8B7355' }}>{row.sessions} session{row.sessions>1?'s':''}</span>
                      <span style={{ fontSize:15, fontWeight:800, color:'#E65100' }}>{row.buckets} bucket{row.buckets>1?'s':''}</span>
                    </div>
                  </div>
                  {/* Bar */}
                  <div style={{ background:'#F5EFE8', borderRadius:4, height:6 }}>
                    <div style={{ background:'#C8843A', height:6, borderRadius:4, width:`${(row.buckets/maxBuckets*100).toFixed(0)}%`, transition:'width 0.3s' }} />
                  </div>
                  {row.lastDate && <div style={{ fontSize:10, color:'#aaa', marginTop:3 }}>Last: {row.lastDate}</div>}
                </div>
              ))}

              {/* Log detail toggle */}
              <div style={{ padding:'10px 16px' }}>
                <button onClick={() => setShowDetails(v => !v)}
                  style={{ background:'none', border:'1px solid #EDE0CC', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontSize:11, color:'#8B7355', fontFamily:'inherit' }}>
                  {showDetails ? 'Hide' : 'Show'} individual log entries ({usageDetails.length})
                </button>
                {showDetails && (
                  <div style={{ marginTop:10 }}>
                    {usageDetails.map((log, i) => (
                      <div key={log.id||i} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'5px 0', borderBottom:'1px solid #F5EFE8', color:'#2C1810' }}>
                        <span>{log.date}</span>
                        <span style={{ flex:1, marginLeft:12, fontWeight:500 }}>{log.itemName}</span>
                        <span style={{ color:'#E65100', fontWeight:700 }}>{Math.abs(log.delta)} bucket{Math.abs(log.delta)>1?'s':''}</span>
                        <span style={{ color:'#8B7355', marginLeft:10 }}>{log.userName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
