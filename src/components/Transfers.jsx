import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import TipBanner from './TipBanner'

const CATEGORIES = ['Ice Cream', 'Boba', 'Coffee', 'Dry Stock', 'Packaging', 'Condiments', 'Other']
const EMPTY = { fromStore:'', toStore:'', date: new Date().toISOString().split('T')[0], category:'', item:'', desc:'', quantity:'', cost:'' }

export default function Transfers({ auth, showToast }) {
  const [transfers,   setTransfers]   = useState([])
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [form,        setForm]        = useState(EMPTY)
  const [editId,      setEditId]      = useState(null)
  const [allStores,   setAllStores]   = useState([])
  const [filterMonth, setFilterMonth] = useState('')

  useEffect(() => {
    loadTransfers()
    loadStores()
  }, [])

  async function loadStores() {
    try {
      const snap = await getDocs(collection(db, 'stores'))
      setAllStores(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {}
  }

  async function loadTransfers() {
    setLoading(true)
    try {
      const q = query(collection(db, 'transfers'), orderBy('timestamp', 'desc'), limit(100))
      const snap = await getDocs(q)
      setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function saveTransfer() {
    if (!form.fromStore.trim()) { showToast('Select From Store'); return }
    if (!form.toStore.trim())   { showToast('Select To Store'); return }
    if (!form.category)         { showToast('Select Category'); return }
    if (!form.item.trim())      { showToast('Enter Item'); return }
    if (!form.quantity)         { showToast('Enter Quantity'); return }
    setSaving(true)
    try {
      const entryDate = form.date ? new Date(form.date + 'T12:00:00') : new Date()
      const data = {
        fromStore: form.fromStore.trim(),
        toStore:   form.toStore.trim(),
        category:  form.category,
        item:      form.item.trim(),
        desc:      form.desc.trim(),
        quantity:  parseFloat(form.quantity) || 0,
        cost:      parseFloat(form.cost) || 0,
        totalCost: (parseFloat(form.cost)||0) * (parseFloat(form.quantity)||0),
        loggedBy:  auth?.userConfig?.name || 'Admin',
        timestamp: entryDate.getTime(),
        date:      entryDate.toLocaleDateString(),
        month:     entryDate.toLocaleDateString('en-US', { month:'long', year:'numeric' }),
        monthKey:  `${entryDate.getFullYear()}-${String(entryDate.getMonth()+1).padStart(2,'0')}`,
      }

      if (editId) {
        await updateDoc(doc(db, 'transfers', editId), data)
        showToast('Transfer updated ✅')
        setEditId(null)
      } else {
        await addDoc(collection(db, 'transfers'), data)
        showToast('Transfer saved ✅')
      }
      await loadTransfers()
      setForm({ ...EMPTY, date: new Date().toISOString().split('T')[0] })
    } catch(e) {
      console.error(e)
      showToast('Save failed — try again')
    }
    setSaving(false)
  }

  async function deleteTransfer(id) {
    if (!window.confirm('Delete this transfer?')) return
    await deleteDoc(doc(db, 'transfers', id))
    setTransfers(prev => prev.filter(t => t.id !== id))
    showToast('Deleted')
  }

  function startEdit(t) {
    setForm({
      fromStore: t.fromStore, toStore: t.toStore,
      date:      t.dateRaw || new Date().toISOString().split('T')[0],
      category: t.category, item: t.item,
      desc: t.desc || '', quantity: String(t.quantity), cost: String(t.cost || '')
    })
    setEditId(t.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setForm({ ...EMPTY, date: new Date().toISOString().split('T')[0] })
    setEditId(null)
  }

  function exportToCSV() {
    const headers = ['Date','From','To','Category','Item','Description','Quantity','Unit Cost','Total Cost','Logged By']
    const rows = transfers.map(t => [
      t.date, t.fromStore, t.toStore, t.category, t.item,
      t.desc || '', t.quantity, t.cost || 0, t.totalCost || 0, t.loggedBy
    ])
    const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `transfers_${new Date().toLocaleDateString().replace(/\//g,'-')}.csv`; a.click()
    URL.revokeObjectURL(url)
    showToast('Exported to CSV ✅')
  }

  const inp = { padding:'10px 12px', border:'1px solid var(--border)', borderRadius:8, fontFamily:'inherit', fontSize:13, background:'#FDF6EC', width:'100%', boxSizing:'border-box' }

  // Month filter
  const allMonthKeys  = [...new Set(transfers.map(t => t.monthKey).filter(Boolean))].sort().reverse()
  const now           = new Date()
  const thisMonthKey  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const activeFilter  = filterMonth || thisMonthKey
  const visibleLog    = filterMonth ? transfers.filter(t => t.monthKey === filterMonth) : transfers
  const monthTotal    = visibleLog.filter(t => t.monthKey === activeFilter).reduce((s,t) => s+(t.totalCost||0), 0)

  const storeOptions = allStores.length > 0 ? allStores : []

  return (
    <div>
      <TipBanner message="Log stock transfers between stores. Select stores from the dropdown — this prevents spelling mismatches." />

      {/* Entry form — responsive card layout */}
      <div style={{ background:'#fff', border:`1px solid ${editId ? '#E65100' : 'var(--border)'}`, borderRadius:12, overflow:'hidden', marginBottom:14 }}>
        <div style={{ background: editId ? '#E65100' : 'var(--dark)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
            {editId ? '✏️ Edit Transfer' : '↔️ New Transfer'}
          </div>
          {editId && (
            <button onClick={cancelEdit}
              style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontSize:12, color:'#fff', fontFamily:'inherit' }}>
              Cancel
            </button>
          )}
        </div>

        <div style={{ padding:'16px' }}>
          {/* Row 1: From → To + Date */}
          <div className="transfer-form-row3" style={{ display:'grid', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>From Store</div>
              {storeOptions.length > 0 ? (
                <select value={form.fromStore} onChange={e => setForm(f=>({...f,fromStore:e.target.value}))} style={inp}>
                  <option value="">Select store…</option>
                  {storeOptions.map(s => <option key={s.id} value={s.name || s.id}>{s.name || s.id}</option>)}
                </select>
              ) : (
                <input placeholder="From store" value={form.fromStore} onChange={e => setForm(f=>({...f,fromStore:e.target.value}))} style={inp}/>
              )}
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>To Store</div>
              {storeOptions.length > 0 ? (
                <select value={form.toStore} onChange={e => setForm(f=>({...f,toStore:e.target.value}))} style={inp}>
                  <option value="">Select store…</option>
                  {storeOptions.map(s => <option key={s.id} value={s.name || s.id}>{s.name || s.id}</option>)}
                </select>
              ) : (
                <input placeholder="To store" value={form.toStore} onChange={e => setForm(f=>({...f,toStore:e.target.value}))} style={inp}/>
              )}
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Date</div>
              <input type="date" value={form.date}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setForm(f=>({...f,date:e.target.value}))} style={inp}/>
            </div>
          </div>

          {/* Row 2: Category + Item */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Category</div>
              <select value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))} style={inp}>
                <option value="">Select…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Item Name</div>
              <input placeholder="e.g. Vanilla" value={form.item} onChange={e => setForm(f=>({...f,item:e.target.value}))} style={inp}/>
            </div>
          </div>

          {/* Row 3: Description + Qty + Cost */}
          <div className="transfer-form-row3" style={{ display:'grid', gap:12, marginBottom:14 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Description (optional)</div>
              <input placeholder="Notes" value={form.desc} onChange={e => setForm(f=>({...f,desc:e.target.value}))} style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Quantity</div>
              <input type="number" placeholder="0" value={form.quantity} onChange={e => setForm(f=>({...f,quantity:e.target.value}))} style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Unit Cost $</div>
              <input type="number" placeholder="0.00" value={form.cost} onChange={e => setForm(f=>({...f,cost:e.target.value}))} style={inp}/>
            </div>
          </div>

          <button onClick={saveTransfer} disabled={saving}
            style={{ width:'100%', background: saving ? '#aaa' : editId ? '#E65100' : 'var(--dark)', color:'#fff', border:'none', borderRadius:8, padding:'12px', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'inherit' }}>
            {saving ? 'Saving…' : editId ? 'Update Transfer' : 'Save Transfer'}
          </button>
        </div>
      </div>

      {/* Transfer log */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        {/* Header + month filter + export */}
        <div style={{ background:'var(--dark)', padding:'10px 14px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: allMonthKeys.length > 1 ? 8 : 0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Transfer Log ({transfers.length})</div>
            {transfers.length > 0 && (
              <button onClick={exportToCSV}
                style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontSize:11, color:'#fff', fontFamily:'inherit', fontWeight:600 }}>
                Export CSV
              </button>
            )}
          </div>
          {allMonthKeys.length > 0 && (
            <div style={{ display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none' }}>
              {[{key:'', label:'All'}, ...allMonthKeys.map(mk => ({
                key: mk,
                label: transfers.find(t => t.monthKey === mk)?.month || mk
              }))].map(m => (
                <button key={m.key} onClick={() => setFilterMonth(m.key)}
                  style={{ padding:'4px 12px', borderRadius:20, border:'1px solid rgba(255,255,255,0.3)', cursor:'pointer', fontSize:11, fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0,
                    background: (filterMonth === m.key) ? 'rgba(255,255,255,0.25)' : 'transparent',
                    color:'#fff', fontWeight: filterMonth === m.key ? 700 : 400 }}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>Loading…</div>
        ) : visibleLog.length === 0 ? (
          <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)', fontSize:13 }}>No transfers logged yet</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="transfer-desktop">
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:650 }}>
                  <thead>
                    <tr style={{ background:'#F5F0EA' }}>
                      {['Date','From','To','Category','Item','Qty','Total',''].map(h => (
                        <th key={h} style={{ padding:'8px 10px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', textAlign:'left', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLog.map((t, idx) => (
                      <tr key={t.id} style={{ borderBottom: idx < visibleLog.length-1 ? '1px solid var(--border)' : 'none', background: editId===t.id ? '#FFF3E0' : idx%2===0 ? '#fff' : 'var(--cream)' }}>
                        <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{t.date}</td>
                        <td style={{ padding:'8px 10px', fontSize:12, fontWeight:600, color:'var(--dark)' }}>{t.fromStore}</td>
                        <td style={{ padding:'8px 10px', fontSize:12, fontWeight:600, color:'var(--dark)' }}>{t.toStore}</td>
                        <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-muted)' }}>{t.category}</td>
                        <td style={{ padding:'8px 10px', fontSize:12, color:'var(--dark)' }}>
                          {t.item}
                          {t.desc && <div style={{ fontSize:10, color:'var(--text-muted)' }}>{t.desc}</div>}
                        </td>
                        <td style={{ padding:'8px 10px', fontSize:13, fontWeight:700, color:'var(--dark)', textAlign:'center' }}>{t.quantity}</td>
                        <td style={{ padding:'8px 10px', fontSize:12, fontWeight:700, color:'var(--caramel)', textAlign:'right' }}>{t.totalCost > 0 ? `$${t.totalCost.toFixed(2)}` : '—'}</td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                          <button onClick={() => startEdit(t)}
                            style={{ background:'none', border:'1px solid var(--border)', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, color:'var(--dark)', fontFamily:'inherit', marginRight:4 }}>
                            Edit
                          </button>
                          <button onClick={() => deleteTransfer(t.id)}
                            style={{ background:'none', border:'1px solid #FFCDD2', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, color:'#E74C3C', fontFamily:'inherit' }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {monthTotal > 0 && (
                    <tfoot>
                      <tr style={{ background:'var(--dark)' }}>
                        <td colSpan={6} style={{ padding:'8px 10px', fontSize:12, fontWeight:700, color:'#fff' }}>
                          {filterMonth ? transfers.find(t => t.monthKey === filterMonth)?.month || 'Month' : 'This Month'} Total
                        </td>
                        <td style={{ padding:'8px 10px', fontSize:14, fontWeight:700, color:'#C8843A', textAlign:'right' }}>
                          ${monthTotal.toFixed(2)}
                        </td>
                        <td/>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="transfer-mobile">
              {visibleLog.map((t, idx) => (
                <div key={t.id} style={{
                  padding:'14px',
                  borderBottom: idx < visibleLog.length-1 ? '1px solid var(--border)' : 'none',
                  background: editId===t.id ? '#FFF3E0' : idx%2===0 ? '#fff' : 'var(--cream)',
                }}>
                  {/* Transfer arrow */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--dark)', flex:1 }}>{t.fromStore}</span>
                    <span style={{ fontSize:16, color:'#C8843A' }}>→</span>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--dark)', flex:1, textAlign:'right' }}>{t.toStore}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{t.item}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t.category}{t.desc ? ` · ${t.desc}` : ''}</div>
                      <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>{t.date} · {t.loggedBy}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:16, fontWeight:800, color:'var(--dark)' }}>×{t.quantity}</div>
                      {t.totalCost > 0 && <div style={{ fontSize:13, fontWeight:700, color:'var(--caramel)' }}>${t.totalCost.toFixed(2)}</div>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => startEdit(t)}
                      style={{ flex:1, background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'7px', cursor:'pointer', fontSize:12, color:'var(--dark)', fontFamily:'inherit' }}>
                      ✏️ Edit
                    </button>
                    <button onClick={() => deleteTransfer(t.id)}
                      style={{ flex:1, background:'none', border:'1px solid #FFCDD2', borderRadius:8, padding:'7px', cursor:'pointer', fontSize:12, color:'#E74C3C', fontFamily:'inherit' }}>
                      🗑 Delete
                    </button>
                  </div>
                </div>
              ))}
              {monthTotal > 0 && (
                <div style={{ background:'var(--dark)', padding:'12px 14px', display:'flex', justifyContent:'space-between' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#fff' }}>Month Total</div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#C8843A' }}>${monthTotal.toFixed(2)}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        .transfer-form-row3  { grid-template-columns: 1fr 1fr 1fr; }
        .transfer-mobile     { display: none !important; }
        .transfer-desktop    { display: block !important; }
        @media (max-width: 768px) {
          .transfer-form-row3 { grid-template-columns: 1fr !important; }
          .transfer-mobile    { display: block !important; }
          .transfer-desktop   { display: none !important; }
        }
      `}</style>
    </div>
  )
}
