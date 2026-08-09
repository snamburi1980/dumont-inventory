import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore'
import { db } from '../firebase/config'

const WASTE_REASONS = ['Melted', 'Dropped', 'Expired', 'Freezer issue', 'Other']

export default function Picks({ invHook, viewingStore, viewingOrg, auth, showToast }) {
  const { inventory, saveInventory, loadInventory } = invHook

  const [session,      setSession]      = useState({})
  const [saving,       setSaving]       = useState(false)
  const [mode,         setMode]         = useState('use')     // 'use' | 'waste'
  const [wasteReason,  setWasteReason]  = useState('Melted')
  const [logDate,      setLogDate]      = useState(() => new Date().toISOString().slice(0,10))
  const [activeMonth,  setActiveMonth]  = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [usageData,    setUsageData]    = useState([])
  const [usageDetails, setUsageDetails] = useState([])
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [showDetails,  setShowDetails]  = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const userName      = auth?.userConfig?.name || 'Staff'
  const iceCreamItems = inventory.filter(i => i.cat === 'Ice Cream' && i.active !== false)

  useEffect(() => {
    if (viewingStore) invHook.loadInventory(viewingStore, viewingOrg || 'dumont')
  }, [viewingStore, viewingOrg])

  useEffect(() => {
    if (viewingStore) loadUsage(activeMonth)
  }, [viewingStore, activeMonth])

  function tap(item) {
    setSession(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }))
  }

  function adjust(itemId, delta) {
    setSession(prev => {
      const next = (prev[itemId] || 0) + delta
      if (next <= 0) {
        const copy = { ...prev }; delete copy[itemId]; return copy
      }
      return { ...prev, [itemId]: next }
    })
  }

  const sessionEntries = iceCreamItems.filter(i => session[i.id] > 0)
  const totalBuckets   = sessionEntries.reduce((s, i) => s + session[i.id], 0)

  async function savePicks() {
    if (!sessionEntries.length) { showToast('Tap a flavor first'); return }
    setSaving(true)
    try {
      const now      = new Date(logDate + 'T12:00:00')
      const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      const month    = now.toLocaleDateString('en-US', { month:'long', year:'numeric' })
      for (const item of sessionEntries) {
        const qty = session[item.id]
        await addDoc(collection(db, 'stores', viewingStore, 'stockLog'), {
          itemId: item.id, itemName: item.name, category: 'Ice Cream',
          delta: -qty, stockAfter: Math.max(0, (item.stock || 0) - qty),
          userName, timestamp: Date.now(),
          date: now.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
          month, monthKey,
          entryType: mode,                                      // 'use' | 'waste'
          reason: mode === 'waste' ? wasteReason : null,
        })
      }
      const updated = inventory.map(item => {
        if (!session[item.id]) return item
        return { ...item, stock: Math.max(0, (item.stock || 0) - session[item.id]) }
      })
      await saveInventory(viewingStore, updated)
      await loadInventory(viewingStore, viewingOrg || 'dumont')
      showToast(mode === 'waste'
        ? `${totalBuckets} bucket${totalBuckets > 1 ? 's' : ''} logged as waste (${wasteReason})`
        : `${totalBuckets} bucket${totalBuckets > 1 ? 's' : ''} logged`)
      setSession({})
      await loadUsage(activeMonth)
    } catch(e) {
      console.error(e)
      showToast('Save failed — try again')
    }
    setSaving(false)
  }

  async function loadUsage(monthKey) {
    if (!viewingStore) return
    setLoadingUsage(true)
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'stockLog'),
        where('monthKey', '==', monthKey),
        orderBy('timestamp', 'desc')
      )
      const snap = await getDocs(q)
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const byItem = {}
      logs.forEach(log => {
        const name = log.itemName
        if (!byItem[name]) byItem[name] = { name, buckets: 0, used: 0, wasted: 0, sessions: 0, lastDate: '' }
        const qty = Math.abs(log.delta)
        byItem[name].buckets  += qty
        // Entries without entryType predate the waste log — count them as used
        if (log.entryType === 'waste') byItem[name].wasted += qty
        else                           byItem[name].used   += qty
        byItem[name].sessions += 1
        if (!byItem[name].lastDate) byItem[name].lastDate = log.date || ''
      })
      setUsageData(Object.values(byItem).sort((a,b) => b.buckets - a.buckets))
      setUsageDetails(logs)
    } catch(e) { console.error('Picks.loadUsage:', e) }
    setLoadingUsage(false)
  }

  async function executeClearMonth() {
    setConfirmClear(false)
    const restoreByName = {}
    usageDetails.forEach(log => {
      const name = log.itemName
      const buckets = Math.abs(log.delta || 0)
      if (name) restoreByName[name] = (restoreByName[name] || 0) + buckets
    })
    if (Object.keys(restoreByName).length) {
      const updated = inventory.map(item => {
        const add = restoreByName[item.name] || 0
        return add ? { ...item, stock: (item.stock || 0) + add } : item
      })
      try {
        await saveInventory(viewingStore, updated)
        await loadInventory(viewingStore, viewingOrg || 'dumont')
      } catch(e) {
        showToast('Could not restore inventory'); return
      }
    }
    for (const d of usageDetails) {
      try { await deleteDoc(doc(db, 'stores', viewingStore, 'stockLog', d.id)) } catch(e) {}
    }
    setSession({})
    await loadUsage(activeMonth)
    showToast('Cleared — inventory restored')
  }

  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    return {
      key:   `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label: d.toLocaleDateString('en-US', { month:'short', year:'numeric' }),
    }
  })

  const totalMonthBuckets = usageData.reduce((s, r) => s + r.buckets, 0)
  const totalMonthUsed    = usageData.reduce((s, r) => s + (r.used ?? r.buckets), 0)
  const totalMonthWasted  = usageData.reduce((s, r) => s + (r.wasted || 0), 0)
  const maxBuckets        = usageData[0]?.buckets || 1

  return (
    <div>

      {/* ── LOG PANEL ─────────────────────────────────────── */}
      <div style={{ background:'#fff', border:'1px solid var(--border,#E3DDD0)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>

        {/* Header with Used / Waste toggle */}
        <div style={{ background: mode==='waste' ? '#8E2F14' : 'var(--dark,#1A4C48)', padding:'12px 16px', transition:'background 0.2s' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>
              {mode==='waste' ? '🗑 Log Waste' : '🍦 Log Scoops Used'}
            </div>
            <div style={{ display:'flex', gap:0, background:'rgba(255,255,255,0.15)', borderRadius:8, padding:2 }}>
              {[['use','🍦 Used'],['waste','🗑 Waste']].map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)}
                  style={{ border:'none', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit',
                    background: mode===m ? '#fff' : 'transparent',
                    color: mode===m ? (m==='waste' ? '#C53D18' : '#1A4C48') : 'rgba(255,255,255,0.75)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {totalBuckets > 0 && (
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginTop:4 }}>
              {totalBuckets} bucket{totalBuckets>1?'s':''} pending {mode==='waste' ? 'as waste' : ''}
            </div>
          )}
        </div>

        {/* Date selector — prominent row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#FFF8F0', borderBottom:'1px solid #E3DDD0' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#6B7F78' }}>📅 LOG DATE</div>
          <input type="date" value={logDate}
            max={new Date().toISOString().slice(0,10)}
            onChange={e => setLogDate(e.target.value)}
            style={{ padding:'7px 12px', border:'1px solid #E3DDD0', borderRadius:8, fontSize:13, fontFamily:'inherit', color:'#1A4C48', fontWeight:600, background:'#fff', cursor:'pointer' }} />
        </div>

        {/* Flavor grid */}
        {iceCreamItems.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', color:'#6B7F78', fontSize:13 }}>
            No ice cream items — add stock in Inventory first
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'#E3DDD0' }}>
            {iceCreamItems.map(item => {
              const qty    = session[item.id] || 0
              const picked = qty > 0
              return (
                <div key={item.id}
                  style={{ background: picked ? '#FFF3E0' : '#fff', padding:'12px 14px', cursor:'pointer', transition:'background 0.1s' }}
                  onClick={() => tap(item)}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                    <div style={{ flex:1, overflow:'hidden' }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#1A4C48', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize:10, color:'#6B7F78', marginTop:1 }}>
                        {item.stock ?? 0} in freezer
                      </div>
                    </div>
                    {picked ? (
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                        <button onClick={e => { e.stopPropagation(); adjust(item.id, -1) }}
                          style={{ width:32, height:32, borderRadius:8, border:'1px solid #C1683C', background:'#fff', color:'#C1683C', fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                          −
                        </button>
                        <span style={{ fontSize:16, fontWeight:800, color:'#E65100', minWidth:20, textAlign:'center' }}>{qty}</span>
                        <button onClick={e => { e.stopPropagation(); adjust(item.id, 1) }}
                          style={{ width:32, height:32, borderRadius:8, border:'1px solid #27AE60', background:'#E8F5E9', color:'#27AE60', fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                          +
                        </button>
                      </div>
                    ) : (
                      <div style={{ width:34, height:34, borderRadius:9, background:'#EFEBE0', border:'1px solid #E3DDD0', display:'flex', alignItems:'center', justifyContent:'center', color:'#C1683C', fontSize:20, fontWeight:700, flexShrink:0 }}>
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
          <div style={{ padding:'12px 16px', background: mode==='waste' ? '#FFEBEE' : '#FFF3E0', borderTop:`1px solid ${mode==='waste' ? '#EF9A9A' : '#FFB74D'}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <div style={{ flex:1, flexWrap:'wrap', display:'flex', gap:4, minWidth:120 }}>
                {sessionEntries.map(item => (
                  <span key={item.id} style={{ display:'inline-block', background: mode==='waste' ? '#C53D18' : '#1A4C48', color:'#fff', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:600 }}>
                    {item.name} ×{session[item.id]}
                  </span>
                ))}
              </div>
              {mode==='waste' && (
                <select value={wasteReason} onChange={e => setWasteReason(e.target.value)}
                  style={{ padding:'8px 10px', border:'1px solid #EF9A9A', borderRadius:8, fontSize:12, fontFamily:'inherit', background:'#fff', color:'#C53D18', fontWeight:600, cursor:'pointer' }}>
                  {WASTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                <button onClick={() => setSession({})}
                  style={{ background:'#888', color:'#fff', border:'none', borderRadius:8, padding:'9px 14px', cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
                  Reset
                </button>
                <button onClick={savePicks} disabled={saving}
                  style={{ background: saving ? '#aaa' : mode==='waste' ? '#C53D18' : '#E65100', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit' }}>
                  {saving ? 'Saving…' : mode==='waste' ? `Log ${totalBuckets} as Waste` : `Save ${totalBuckets} Bucket${totalBuckets>1?'s':''}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MONTHLY HISTORY ───────────────────────────────── */}
      <div style={{ background:'#fff', border:'1px solid var(--border,#E3DDD0)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ background:'var(--dark,#1A4C48)', padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Monthly Usage</div>
          {usageData.length > 0 && !confirmClear && (
            <button onClick={() => setConfirmClear(true)}
              style={{ background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.6)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>
              Clear Month
            </button>
          )}
        </div>

        {/* Confirm clear */}
        {confirmClear && (
          <div style={{ background:'#FFF3E0', borderBottom:'1px solid #FFB74D', padding:'12px 16px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#E65100', marginBottom:4 }}>⚠ Clear all logs for this month?</div>
            <div style={{ fontSize:12, color:'#6B7F78', marginBottom:10 }}>This will delete all {usageDetails.length} log entries and restore inventory counts.</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={executeClearMonth}
                style={{ background:'#E74C3C', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit' }}>
                Yes, Clear
              </button>
              <button onClick={() => setConfirmClear(false)}
                style={{ background:'#fff', color:'#6B7F78', border:'1px solid #E3DDD0', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Month selector */}
        <div style={{ display:'flex', gap:6, padding:'10px 14px', overflowX:'auto', borderBottom:'1px solid #E3DDD0', scrollbarWidth:'none' }}>
          {monthOptions.map(m => (
            <button key={m.key} onClick={() => setActiveMonth(m.key)}
              style={{ padding:'6px 14px', borderRadius:20, border:'1px solid #E3DDD0', cursor:'pointer', fontSize:12, fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0,
                background: activeMonth===m.key ? '#1A4C48' : '#fff',
                color:      activeMonth===m.key ? '#fff' : '#6B7F78',
                fontWeight: activeMonth===m.key ? 700 : 400 }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Summary bar */}
        {usageData.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:'#E3DDD0', borderBottom:'1px solid #E3DDD0' }}>
            <div style={{ background:'#FFFBF5', padding:'12px 16px', textAlign:'center' }}>
              <div style={{ fontSize:26, fontWeight:800, color:'#E65100' }}>{totalMonthUsed}</div>
              <div style={{ fontSize:10, color:'#6B7F78', textTransform:'uppercase' }}>Buckets Used</div>
            </div>
            <div style={{ background:'#FFFBF5', padding:'12px 16px', textAlign:'center' }}>
              <div style={{ fontSize:26, fontWeight:800, color: totalMonthWasted > 0 ? '#C53D18' : '#27AE60' }}>{totalMonthWasted}</div>
              <div style={{ fontSize:10, color:'#6B7F78', textTransform:'uppercase' }}>Wasted</div>
            </div>
            <div style={{ background:'#FFFBF5', padding:'12px 16px', textAlign:'center' }}>
              <div style={{ fontSize:26, fontWeight:800, color:'#1A4C48' }}>{usageData.length}</div>
              <div style={{ fontSize:10, color:'#6B7F78', textTransform:'uppercase' }}>Flavors</div>
            </div>
          </div>
        )}

        {/* Flavor breakdown */}
        <div style={{ padding:'0 0 8px' }}>
          {loadingUsage ? (
            <div style={{ padding:24, textAlign:'center', color:'#6B7F78', fontSize:13 }}>Loading…</div>
          ) : usageData.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'#6B7F78', fontSize:13 }}>No pickups logged for this month</div>
          ) : (
            <>
              {usageData.map((row, i) => (
                <div key={row.name} style={{ padding:'10px 16px', borderBottom:'1px solid #EFEBE0', background: i%2===0 ? '#fff' : '#FAF8F3' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#1A4C48' }}>{row.name}</div>
                    <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                      <span style={{ fontSize:11, color:'#6B7F78' }}>{row.sessions} session{row.sessions>1?'s':''}</span>
                      {(row.wasted || 0) > 0 && (
                        <span style={{ fontSize:11, fontWeight:700, color:'#C53D18' }}>🗑 {row.wasted}</span>
                      )}
                      <span style={{ fontSize:15, fontWeight:800, color:'#E65100' }}>{row.used ?? row.buckets} bucket{(row.used ?? row.buckets)>1?'s':''}</span>
                    </div>
                  </div>
                  <div style={{ background:'#EFEBE0', borderRadius:4, height:6 }}>
                    <div style={{ background:'#C1683C', height:6, borderRadius:4, width:`${(row.buckets/maxBuckets*100).toFixed(0)}%`, transition:'width 0.3s' }} />
                  </div>
                  {row.lastDate && <div style={{ fontSize:10, color:'#aaa', marginTop:3 }}>Last: {row.lastDate}</div>}
                </div>
              ))}

              <div style={{ padding:'10px 16px' }}>
                <button onClick={() => setShowDetails(v => !v)}
                  style={{ background:'none', border:'1px solid #E3DDD0', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:11, color:'#6B7F78', fontFamily:'inherit' }}>
                  {showDetails ? 'Hide' : 'Show'} log entries ({usageDetails.length})
                </button>
                {showDetails && (
                  <div style={{ marginTop:10 }}>
                    {usageDetails.map((log, i) => (
                      <div key={log.id||i} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'5px 0', borderBottom:'1px solid #EFEBE0', color:'#1A4C48' }}>
                        <span>{log.date}</span>
                        <span style={{ flex:1, marginLeft:12, fontWeight:500 }}>
                          {log.itemName}
                          {log.entryType === 'waste' && (
                            <span style={{ marginLeft:6, fontSize:9, fontWeight:700, color:'#fff', background:'#C53D18', borderRadius:4, padding:'1px 6px' }}>
                              🗑 {log.reason || 'Waste'}
                            </span>
                          )}
                        </span>
                        <span style={{ color: log.entryType==='waste' ? '#C53D18' : '#E65100', fontWeight:700 }}>{Math.abs(log.delta)} bucket{Math.abs(log.delta)>1?'s':''}</span>
                        <span style={{ color:'#6B7F78', marginLeft:10 }}>{log.userName}</span>
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
