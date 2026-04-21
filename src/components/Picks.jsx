import { useState } from 'react'
import { collection, addDoc, getDocs, query, orderBy, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import TipBanner from './TipBanner'

export default function Picks({ invHook, viewingStore, auth, showToast }) {
  const { inventory, saveInventory, loadInventory } = invHook

  const [pendingPicks, setPendingPicks] = useState({})
  const [saving,       setSaving]       = useState(false)
  const [showReport,   setShowReport]   = useState(false)
  const [usageData,    setUsageData]    = useState([])
  const [usageMonth,   setUsageMonth]   = useState('')
  const [loadingUsage, setLoadingUsage] = useState(false)

  const userName      = auth?.userConfig?.name || 'Staff'
  const iceCreamItems = inventory.filter(i => i.cat === 'Ice Cream' && i.active !== false)
  const totalPicks    = Object.values(pendingPicks).reduce((s, q) => s + q, 0)

  function pick(id) {
    const item = inventory.find(i => i.id === id)
    if (!item) return
    const alreadyPicked = pendingPicks[id] || 0
    if (item.stock - alreadyPicked <= 0) { showToast('No more stock available'); return }
    setPendingPicks(prev => ({ ...prev, [id]: alreadyPicked + 1 }))
  }

  async function savePicks() {
    if (totalPicks === 0) { showToast('No picks to save'); return }
    setSaving(true)
    try {
      const now      = new Date()
      const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      const month    = now.toLocaleDateString('en-US', { month:'long', year:'numeric' })

      const updatedInventory = inventory.map(item => {
        const qty = pendingPicks[item.id] || 0
        if (qty === 0) return item
        return { ...item, stock: Math.max(0, Math.round((item.stock - qty) * 100) / 100) }
      })

      await saveInventory(viewingStore, updatedInventory)
      loadInventory(viewingStore)

      for (const [itemId, qty] of Object.entries(pendingPicks)) {
        if (qty === 0) continue
        const item = inventory.find(i => i.id === itemId)
        if (!item) continue
        await addDoc(collection(db, 'stores', viewingStore, 'stockLog'), {
          itemId,
          itemName:   item.name,
          category:   'Ice Cream',
          delta:      -qty,
          stockAfter: Math.max(0, (item.stock || 0) - qty),
          userName,
          timestamp:  Date.now(),
          date:       now.toLocaleDateString(),
          month,
          monthKey,
        })
      }

      showToast(`✅ ${totalPicks} bucket${totalPicks > 1 ? 's' : ''} logged`)
      setPendingPicks({})
    } catch(e) {
      console.error(e)
      showToast('Save failed — try again')
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
      <TipBanner message="Tap − to log a bucket pick. Stock reduces automatically. Save when done. Monthly report shows total buckets used per flavor." />

      {/* Table */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>

        {/* Header */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 60px', background:'var(--dark)', padding:'10px 14px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase' }}>Flavor</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>In Stock</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>Picked</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>Pick</div>
        </div>

        {iceCreamItems.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:13 }}>
            No ice cream items found — add stock in Inventory tab first
          </div>
        ) : iceCreamItems.map((item, idx) => {
          const picked    = pendingPicks[item.id] || 0
          const remaining = item.stock - picked
          return (
            <div key={item.id} style={{
              display:'grid', gridTemplateColumns:'1fr 80px 80px 60px',
              padding:'10px 14px', alignItems:'center',
              borderBottom: idx < iceCreamItems.length-1 ? '1px solid var(--border)' : 'none',
              background: picked > 0 ? '#FFF8F0' : '#fff'
            }}>
              {/* Flavor name */}
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{item.name}</div>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{item.uom || 'tub'}</div>
              </div>

              {/* Remaining stock */}
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:15, fontWeight:700, color: remaining <= 0 ? '#E74C3C' : remaining <= 1 ? '#E67E22' : 'var(--dark)' }}>
                  {remaining}
                </div>
              </div>

              {/* Picked count */}
              <div style={{ textAlign:'center' }}>
                {picked > 0
                  ? <span style={{ fontSize:15, fontWeight:700, color:'#E65100' }}>{picked}</span>
                  : <span style={{ fontSize:13, color:'#ccc' }}>—</span>
                }
              </div>

              {/* Pick button */}
              <div style={{ textAlign:'center' }}>
                <button onClick={() => pick(item.id)} disabled={remaining <= 0}
                  style={{ width:32, height:32, borderRadius:8, border:'none',
                    background: remaining <= 0 ? '#EDE0CC' : 'var(--dark)',
                    color:'#fff', cursor: remaining <= 0 ? 'not-allowed' : 'pointer',
                    fontSize:18, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                  −
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Save section */}
      {totalPicks > 0 && (
        <div style={{ background:'#FFF3E0', border:'1px solid #FFB74D', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#E65100', marginBottom:10 }}>
            Review before saving
          </div>
          {Object.entries(pendingPicks).map(([id, qty]) => {
            const item = inventory.find(i => i.id === id)
            if (!item || qty === 0) return null
            return (
              <div key={id} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #FFE0B2', fontSize:13 }}>
                <span style={{ color:'var(--dark)', fontWeight:500 }}>{item.name}</span>
                <span style={{ fontWeight:700, color:'#E65100' }}>{qty} bucket{qty > 1 ? 's' : ''}</span>
              </div>
            )
          })}
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:10, paddingTop:8, borderTop:'2px solid #FFB74D' }}>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--dark)' }}>Total</span>
            <span style={{ fontSize:15, fontWeight:700, color:'#E65100' }}>{totalPicks} bucket{totalPicks > 1 ? 's' : ''}</span>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={savePicks} disabled={saving}
              style={{ flex:1, background: saving ? '#aaa' : '#E65100', color:'#fff', border:'none', borderRadius:10, padding:'12px', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'inherit' }}>
              {saving ? 'Saving...' : '✅ Save Picks'}
            </button>
            <button onClick={() => setPendingPicks({})}
              style={{ padding:'12px 16px', background:'#888', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Monthly Usage Report */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--dark)' }}>📊 Monthly Usage Report</div>
          <div style={{ display:'flex', gap:6 }}>
            {showReport && (
              <button onClick={async () => {
                if (!window.confirm('Clear all usage logs for this month? This cannot be undone.')) return
                const { collection, getDocs, deleteDoc, query, where } = await import('firebase/firestore')
                const { db } = await import('../firebase/config')
                const now = new Date()
                const selKey = usageMonth || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
                const q = query(collection(db, 'stores', viewingStore, 'stockLog'), where('monthKey', '==', selKey))
                const snap = await (await import('firebase/firestore')).getDocs(q)
                for (const d of snap.docs) await deleteDoc(d.ref)
                setUsageData([])
                showToast('Usage log cleared')
              }} style={{ background:'#E74C3C', color:'#fff', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>
                Clear
              </button>
            )}
            <button onClick={() => { setShowReport(!showReport); if (!showReport) loadUsage() }}
              style={{ background:'var(--dark)', color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>
              {showReport ? 'Hide' : 'View Report'}
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
              <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)', fontSize:13 }}>
                No picks logged for this month yet
              </div>
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
