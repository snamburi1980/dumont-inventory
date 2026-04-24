import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import TipBanner from './TipBanner'

const CATEGORIES = ['Ice Cream', 'Boba', 'Coffee', 'Dry Stock', 'Packaging', 'Condiments', 'Other']

const EMPTY = { fromStore:'', toStore:'', category:'', item:'', desc:'', quantity:'', cost:'' }

export default function Transfers({ auth, showToast }) {
  const [transfers, setTransfers] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form,      setForm]      = useState(EMPTY)
  const [editId,    setEditId]    = useState(null)

  useEffect(() => { loadTransfers() }, [])

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
    if (!form.fromStore.trim()) { showToast('Enter From Store'); return }
    if (!form.toStore.trim())   { showToast('Enter To Store'); return }
    if (!form.category)         { showToast('Select Category'); return }
    if (!form.item.trim())      { showToast('Enter Item'); return }
    if (!form.quantity)         { showToast('Enter Quantity'); return }
    setSaving(true)
    try {
      const now  = new Date()
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
        timestamp: Date.now(),
        date:      now.toLocaleDateString(),
        month:     now.toLocaleDateString('en-US', { month:'long', year:'numeric' }),
        monthKey:  `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`,
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
      setForm(EMPTY)
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
      fromStore: t.fromStore, toStore: t.toStore, category: t.category,
      item: t.item, desc: t.desc || '', quantity: String(t.quantity), cost: String(t.cost || '')
    })
    setEditId(t.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setForm(EMPTY)
    setEditId(null)
  }

  function exportToCSV() {
    const headers = ['Date','From','To','Category','Item','Description','Quantity','Unit Cost','Total Cost','Logged By']
    const rows = transfers.map(t => [
      t.date, t.fromStore, t.toStore, t.category, t.item,
      t.desc || '', t.quantity, t.cost || 0, t.totalCost || 0, t.loggedBy
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `transfers_${new Date().toLocaleDateString().replace(/\//g,'-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Exported to CSV ✅')
  }

  const inp = { padding:'7px 8px', border:'1px solid var(--border)', borderRadius:6, fontFamily:'inherit', fontSize:12, background:'#FDF6EC', width:'100%', boxSizing:'border-box' }

  return (
    <div>
      <TipBanner message="Log stock transfers between stores. Fill the row and click Save. Edit or delete any entry below." />

      {/* Entry row */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
        <div style={{ background: editId ? '#E65100' : 'var(--dark)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
            {editId ? '✏️ Edit Transfer' : '+ New Transfer'}
          </div>
          {editId && (
            <button onClick={cancelEdit}
              style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, color:'#fff', fontFamily:'inherit' }}>
              Cancel
            </button>
          )}
        </div>

        <div style={{ padding:'12px 14px', overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
            <thead>
              <tr>
                {['From','To','Category','Item','Description','Qty','Cost $',''].map(h => (
                  <th key={h} style={{ padding:'0 6px 6px 0', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding:'0 6px 0 0' }}>
                  <input placeholder="Coppell" value={form.fromStore} onChange={e => setForm(f=>({...f,fromStore:e.target.value}))} style={{...inp, minWidth:80}}/>
                </td>
                <td style={{ padding:'0 6px 0 0' }}>
                  <input placeholder="Aubrey" value={form.toStore} onChange={e => setForm(f=>({...f,toStore:e.target.value}))} style={{...inp, minWidth:80}}/>
                </td>
                <td style={{ padding:'0 6px 0 0' }}>
                  <select value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))} style={{...inp, minWidth:100}}>
                    <option value="">Select</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ padding:'0 6px 0 0' }}>
                  <input placeholder="Item name" value={form.item} onChange={e => setForm(f=>({...f,item:e.target.value}))} style={{...inp, minWidth:100}}/>
                </td>
                <td style={{ padding:'0 6px 0 0' }}>
                  <input placeholder="Notes" value={form.desc} onChange={e => setForm(f=>({...f,desc:e.target.value}))} style={{...inp, minWidth:100}}/>
                </td>
                <td style={{ padding:'0 6px 0 0' }}>
                  <input type="number" placeholder="0" value={form.quantity} onChange={e => setForm(f=>({...f,quantity:e.target.value}))} style={{...inp, minWidth:55}}/>
                </td>
                <td style={{ padding:'0 6px 0 0' }}>
                  <input type="number" placeholder="0" value={form.cost} onChange={e => setForm(f=>({...f,cost:e.target.value}))} style={{...inp, minWidth:60}}/>
                </td>
                <td>
                  <button onClick={saveTransfer} disabled={saving}
                    style={{ background: saving ? '#aaa' : editId ? '#E65100' : 'var(--dark)', color:'#fff', border:'none', borderRadius:6, padding:'7px 14px', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit', whiteSpace:'nowrap' }}>
                    {saving ? '...' : editId ? 'Update' : 'Save'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfer log */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--dark)', padding:'10px 14px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
            Transfer Log ({transfers.length})
          </div>
          {transfers.length > 0 && (
            <button onClick={exportToCSV}
              style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontSize:11, color:'#fff', fontFamily:'inherit', fontWeight:600 }}>
              Export CSV
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>Loading...</div>
        ) : transfers.length === 0 ? (
          <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)', fontSize:13 }}>No transfers logged yet</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
              <thead>
                <tr style={{ background:'#F5F0EA' }}>
                  {['Date','From','To','Category','Item','Desc','Qty','Cost','Total',''].map(h => (
                    <th key={h} style={{ padding:'8px 10px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', textAlign:'left', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.map((t, idx) => (
                  <tr key={t.id} style={{ borderBottom: idx < transfers.length-1 ? '1px solid var(--border)' : 'none', background: editId===t.id ? '#FFF3E0' : idx%2===0 ? '#fff' : 'var(--cream)' }}>
                    <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{t.date}</td>
                    <td style={{ padding:'8px 10px', fontSize:12, fontWeight:600, color:'var(--dark)' }}>{t.fromStore}</td>
                    <td style={{ padding:'8px 10px', fontSize:12, fontWeight:600, color:'var(--dark)' }}>{t.toStore}</td>
                    <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-muted)' }}>{t.category}</td>
                    <td style={{ padding:'8px 10px', fontSize:12, color:'var(--dark)' }}>{t.item}</td>
                    <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-muted)' }}>{t.desc || '—'}</td>
                    <td style={{ padding:'8px 10px', fontSize:13, fontWeight:700, color:'var(--dark)', textAlign:'center' }}>{t.quantity}</td>
                    <td style={{ padding:'8px 10px', fontSize:11, color:'var(--text-muted)', textAlign:'right' }}>{t.cost > 0 ? `$${t.cost}` : '—'}</td>
                    <td style={{ padding:'8px 10px', fontSize:12, fontWeight:700, color:'var(--caramel)', textAlign:'right' }}>{t.totalCost > 0 ? `$${t.totalCost.toFixed(2)}` : '—'}</td>
                    <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                      <button onClick={() => startEdit(t)}
                        style={{ background:'none', border:'1px solid var(--border)', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, color:'var(--dark)', fontFamily:'inherit', marginRight:4 }}>
                        Edit
                      </button>
                      <button onClick={() => deleteTransfer(t.id)}
                        style={{ background:'none', border:'1px solid #FFCDD2', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, color:'#E74C3C', fontFamily:'inherit' }}>
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Monthly total */}
              {(() => {
                const thisMonth  = new Date().toLocaleDateString('en-US', { month:'long', year:'numeric' })
                const monthTotal = transfers.filter(t => t.month===thisMonth).reduce((s,t) => s+(t.totalCost||0), 0)
                return monthTotal > 0 ? (
                  <tfoot>
                    <tr style={{ background:'var(--dark)' }}>
                      <td colSpan={8} style={{ padding:'8px 10px', fontSize:12, fontWeight:700, color:'#fff' }}>
                        This Month Total
                      </td>
                      <td style={{ padding:'8px 10px', fontSize:14, fontWeight:700, color:'#C8843A', textAlign:'right' }}>
                        ${monthTotal.toFixed(2)}
                      </td>
                      <td/>
                    </tr>
                  </tfoot>
                ) : null
              })()}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
