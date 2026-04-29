import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, query, orderBy, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import TipBanner from './TipBanner'

export default function Picks({ invHook, viewingStore, viewingOrg, auth, showToast }) {
  const { inventory, saveInventory, loadInventory } = invHook

  const [counts,      setCounts]      = useState({}) // { itemId: currentCount } starts at stock value
  const [saving,      setSaving]      = useState(false)
  const [showReport,  setShowReport]  = useState(false)
  const [usageData,   setUsageData]   = useState([])
  const [usageMonth,  setUsageMonth]  = useState('')
  const [loadingUsage,setLoadingUsage]= useState(false)

  const userName      = auth?.userConfig?.name || 'Staff'
  const iceCreamItems = inventory.filter(i => i.cat === 'Ice Cream' && i.active !== false)

  // Reload inventory when tab opens to get latest stock
  useEffect(() => {
    if (viewingStore) invHook.loadInventory(viewingStore, viewingOrg || 'dumont')
  }, [viewingStore, viewingOrg])

  // Get current display count — defaults to stock value
  function getCount(item) {
    return counts[item.id] !== undefined ? counts[item.id] : item.stock
  }

  function decrease(item) {
    const current = getCount(item)
    if (current <= 0) { showToast('Cannot go below 0'); return }
    setCounts(prev => ({ ...prev, [item.id]: current - 1 }))
  }

  function increase(item) {
    const current = getCount(item)
    if (current >= item.stock) { showToast('Cannot exceed current stock'); return }
    setCounts(prev => ({ ...prev, [item.id]: current + 1 }))
  }

  // Items that have been decreased
  const changed = iceCreamItems.filter(item => {
    const current = getCount(item)
    return current < item.stock
  })

  const totalPicked = changed.reduce((s, item) => s + (item.stock - getCount(item)), 0)

  function clearAll() { setCounts({}) }

  async function savePicks() {
    if (changed.length === 0) { showToast('No changes to save'); return }
    setSaving(true)
    try {
      const now      = new Date()
      const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      const month    = now.toLocaleDateString('en-US', { month:'long', year:'numeric' })

      const updatedInventory = inventory.map(item => {
        const newCount = getCount(item)
        if (newCount === item.stock) return item
        return { ...item, stock: Math.max(0, newCount) }
      })

      await saveInventory(viewingStore, updatedInventory)
      await loadInventory(viewingStore)

      for (const item of changed) {
        const picked = item.stock - getCount(item)
        await addDoc(collection(db, 'stores', viewingStore, 'stockLog'), {
          itemId:    item.id,
          itemName:  item.name,
          category:  'Ice Cream',
          delta:     -picked,
          stockAfter: getCount(item),
          userName,
          timestamp: Date.now(),
          date:      now.toLocaleDateString(),
          month,
          monthKey,
        })
      }

      showToast(`✅ ${totalPicked} bucket${totalPicked > 1 ? 's' : ''} logged`)
      setCounts({})
    } catch(e) {
      console.error('Save picks error:', e)
      if (e.message?.includes('permission')) {
        showToast('Session expired — please refresh')
      } else {
        showToast('Save failed — check connection and try again')
      }
    }
    setSaving(false)
  }

  async function loadUsage(monthKey) {
    setLoadingUsage(true)
    try {
      const now    = new Date()
      const selKey = monthKey || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      setUsageMonth(selKey)
      const q = query(
        collection(db, 'stores', viewingStore, 'stockLog'),
        where('monthKey', '==', selKey),
        orderBy('timestamp', 'desc')
      )
      const snap = await getDocs(q)
      const logs = snap.docs.map(d => d.data())
      const byItem = {}
      logs.forEach(log => {
        if (!byItem[log.itemName]) byItem[log.itemName] = { name: log.itemName, totalPicked: 0, picks: 0 }
        byItem[log.itemName].totalPicked += Math.abs(log.delta)
        byItem[log.itemName].picks++
      })
      setUsageData(Object.values(byItem).sort((a,b) => b.totalPicked - a.totalPicked))
    } catch(e) { showToast('Could not load usage data') }
    setLoadingUsage(false)
  }

  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const label = d.toLocaleDateString('en-US', { month:'long', year:'numeric' })
    return { key, label }
  })

  return (
    <div>
      <TipBanner message="Each flavor shows current stock. Tap − to log a bucket used. The number counts down. Tap Save when done." />

      {/* Two column grid of flavors */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
        <div style={{ background:'var(--dark)', padding:'10px 16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: totalPicked > 0 ? 8 : 0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>🍨 Ice Cream Stock</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>
              {new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })}
            </div>
          </div>
          {(() => {
            const totalStock = iceCreamItems.reduce((s,i) => s + (i.stock||0), 0)
            const totalAfter = iceCreamItems.reduce((s,i) => s + getCount(i), 0)
            const picked     = totalStock - totalAfter
            return (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:4 }}>
                <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:800, color:'#C8843A' }}>{totalStock}</div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.6)', textTransform:'uppercase' }}>Total Stock</div>
                </div>
                <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:800, color: picked > 0 ? '#E65100' : 'rgba(255,255,255,0.4)' }}>{picked}</div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.6)', textTransform:'uppercase' }}>Picked Today</div>
                </div>
                <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{totalAfter}</div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.6)', textTransform:'uppercase' }}>Remaining</div>
                </div>
              </div>
            )
          })()}
        </div>

        {iceCreamItems.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:13 }}>
            No ice cream items — add stock in Inventory tab first
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'var(--border)' }}>
            {iceCreamItems.map(item => {
              const current  = getCount(item)
              const picked   = item.stock - current
              const atMax    = current >= item.stock
              const atMin    = current <= 0
              const changed  = picked > 0

              return (
                <div key={item.id} style={{
                  background: changed ? '#FFF8F0' : '#fff',
                  padding:'12px',
                }}>
                  {/* Row: flavor name + number + buttons all on same line */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                    {/* Flavor name */}
                    <div style={{ flex:1, fontSize:13, fontWeight:600, color:'var(--dark)', fontFamily:'inherit', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {item.name}
                      {changed && <span style={{ fontSize:10, color:'#E65100', marginLeft:4 }}>-{picked}</span>}
                    </div>
                    {/* Number same size as name */}
                    <div style={{ fontSize:13, fontWeight:700, color: changed ? '#E65100' : 'var(--dark)', fontFamily:'inherit', flexShrink:0 }}>
                      {current}
                    </div>
                    {/* +/- buttons */}
                    <div style={{ display:'flex', gap:3, flexShrink:0 }}>
                      <button onClick={() => increase(item)} disabled={atMax}
                        style={{
                          width:26, height:26, borderRadius:6,
                          border: atMax ? '1px solid #EDE0CC' : '1px solid #27AE60',
                          background: atMax ? '#F5F5F5' : '#E8F5E9',
                          color: atMax ? '#ccc' : '#27AE60',
                          cursor: atMax ? 'not-allowed' : 'pointer',
                          fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:0, fontFamily:'inherit'
                        }}>+</button>
                      <button onClick={() => decrease(item)} disabled={atMin}
                        style={{
                          width:26, height:26, borderRadius:6,
                          border: atMin ? '1px solid #EDE0CC' : '1px solid var(--dark)',
                          background: atMin ? '#F5F5F5' : 'var(--dark)',
                          color: atMin ? '#ccc' : '#fff',
                          cursor: atMin ? 'not-allowed' : 'pointer',
                          fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:0, fontFamily:'inherit'
                        }}>−</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Save section — only show if changes made */}
      {changed.length > 0 && (
        <div style={{ background:'#FFF3E0', border:'1px solid #FFB74D', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#E65100', marginBottom:10 }}>Review before saving</div>
          {changed.map(item => {
            const picked = item.stock - getCount(item)
            return (
              <div key={item.id} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #FFE0B2', fontSize:13 }}>
                <span style={{ color:'var(--dark)', fontWeight:500 }}>{item.name}</span>
                <span style={{ fontWeight:700, color:'#E65100' }}>{picked} bucket{picked > 1 ? 's' : ''} used</span>
              </div>
            )
          })}
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:10, paddingTop:8, borderTop:'2px solid #FFB74D' }}>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--dark)' }}>Total</span>
            <span style={{ fontSize:15, fontWeight:700, color:'#E65100' }}>{totalPicked} buckets</span>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={savePicks} disabled={saving}
              style={{ flex:1, background: saving ? '#aaa' : '#E65100', color:'#fff', border:'none', borderRadius:10, padding:'12px', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'inherit' }}>
              {saving ? 'Saving...' : '✅ Save'}
            </button>
            <button onClick={clearAll}
              style={{ padding:'12px 16px', background:'#888', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Monthly Usage Report */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--dark)' }}>📊 Monthly Usage</div>
          <div style={{ display:'flex', gap:6 }}>
            {showReport && (
              <button onClick={async () => {
                if (!window.confirm('Clear all usage logs for this month?')) return
                const { collection: col, getDocs: gd, deleteDoc, query: q2, where: w } = await import('firebase/firestore')
                const { db: db2 } = await import('../firebase/config')
                const now = new Date()
                const selKey = usageMonth || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
                const snap = await gd(q2(col(db2, 'stores', viewingStore, 'stockLog'), w('monthKey', '==', selKey)))
                for (const d of snap.docs) await deleteDoc(d.ref)
                setUsageData([])
                showToast('Usage log cleared')
              }} style={{ background:'#E74C3C', color:'#fff', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>
                Clear
              </button>
            )}
            <button onClick={() => { setShowReport(!showReport); if (!showReport) loadUsage() }}
              style={{ background:'var(--dark)', color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>
              {showReport ? 'Hide' : 'View'}
            </button>
          </div>
        </div>

        {showReport && (
          <div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              {monthOptions.map(m => (
                <button key={m.key} onClick={() => loadUsage(m.key)}
                  style={{ padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', cursor:'pointer', fontSize:11, fontFamily:'inherit',
                    background: usageMonth===m.key ? 'var(--dark)' : '#fff',
                    color: usageMonth===m.key ? '#fff' : 'var(--text-muted)' }}>
                  {m.label}
                </button>
              ))}
            </div>
            {loadingUsage ? (
              <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)' }}>Loading...</div>
            ) : usageData.length === 0 ? (
              <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)', fontSize:13 }}>No picks logged yet</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'var(--dark)', color:'#fff' }}>
                    <th style={{ padding:'8px 12px', textAlign:'left', borderRadius:'6px 0 0 6px' }}>Flavor</th>
                    <th style={{ padding:'8px 12px', textAlign:'center' }}>Sessions</th>
                    <th style={{ padding:'8px 12px', textAlign:'center', borderRadius:'0 6px 6px 0' }}>Total Buckets</th>
                  </tr>
                </thead>
                <tbody>
                  {usageData.map((row, i) => (
                    <tr key={row.name} style={{ background: i%2===0 ? '#fff' : 'var(--cream)', borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'8px 12px', fontWeight:600, color:'var(--dark)' }}>{row.name}</td>
                      <td style={{ padding:'8px 12px', textAlign:'center', color:'var(--text-muted)' }}>{row.picks}x</td>
                      <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:700, color:'var(--caramel)' }}>{row.totalPicked.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:'var(--dark)', color:'#fff' }}>
                    <td style={{ padding:'8px 12px', fontWeight:700, borderRadius:'6px 0 0 6px' }}>Total</td>
                    <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:700 }}>{usageData.reduce((s,r) => s+r.picks, 0)}x</td>
                    <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:700, borderRadius:'0 6px 6px 0' }}>
                      {usageData.reduce((s,r) => s+r.totalPicked, 0).toFixed(1)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
