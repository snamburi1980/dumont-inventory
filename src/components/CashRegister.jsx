import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import TipBanner from './TipBanner'

export default function CashRegister({ viewingStore, auth, showToast }) {
  const [logs,       setLogs]       = useState([])
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [editId,     setEditId]     = useState(null)
  const [filterMonth,setFilterMonth]= useState('')

  const now      = new Date()
  const todayStr = now.toISOString().split('T')[0]

  const [form, setForm] = useState({
    date: todayStr, openingCash: '', closingCash: '', comments: '',
  })

  const userName = auth?.userConfig?.name || 'Staff'

  useEffect(() => { loadLogs() }, [viewingStore])

  async function loadLogs() {
    if (!viewingStore) return
    setLoading(true)
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'cashRegister'),
        orderBy('timestamp', 'desc'), limit(90)
      )
      const snap = await getDocs(q)
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function handleSave() {
    if (!form.openingCash && !form.closingCash) { showToast('Enter opening or closing cash'); return }
    if (!form.date) { showToast('Select a date'); return }
    setSaving(true)
    try {
      const entryDate = new Date(form.date + 'T12:00:00')
      const opening   = parseFloat(form.openingCash) || 0
      const closing   = parseFloat(form.closingCash) || 0
      const diff      = closing - opening

      const data = {
        date:        entryDate.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
        dateRaw:     form.date,
        time:        now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true }),
        timestamp:   entryDate.getTime(),
        openingCash: opening,
        closingCash: closing,
        difference:  diff,
        comments:    form.comments.trim(),
        loggedBy:    userName,
        month:       entryDate.toLocaleDateString('en-US', { month:'long', year:'numeric' }),
        monthKey:    `${entryDate.getFullYear()}-${String(entryDate.getMonth()+1).padStart(2,'0')}`,
      }

      if (editId) {
        await updateDoc(doc(db, 'stores', viewingStore, 'cashRegister', editId), data)
        showToast('Entry updated ✅')
        setEditId(null)
      } else {
        await addDoc(collection(db, 'stores', viewingStore, 'cashRegister'), data)
        showToast('Cash register saved ✅')
      }

      await loadLogs()
      setForm({ date: todayStr, openingCash:'', closingCash:'', comments:'' })
    } catch(e) {
      console.error(e)
      showToast('Save failed — try again')
    }
    setSaving(false)
  }

  function startEdit(log) {
    setForm({
      date:        log.dateRaw || todayStr,
      openingCash: String(log.openingCash ?? ''),
      closingCash: String(log.closingCash ?? ''),
      comments:    log.comments || '',
    })
    setEditId(log.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setForm({ date: todayStr, openingCash:'', closingCash:'', comments:'' })
    setEditId(null)
  }

  async function deleteLog(id) {
    if (!window.confirm('Delete this entry?')) return
    try {
      await deleteDoc(doc(db, 'stores', viewingStore, 'cashRegister', id))
      setLogs(prev => prev.filter(l => l.id !== id))
      showToast('Entry deleted')
    } catch(e) {
      showToast('Delete failed — try again')
    }
  }

  // Month filter options derived from actual data
  const allMonthKeys = [...new Set(logs.map(l => l.monthKey).filter(Boolean))].sort().reverse()
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const monthLogs    = filterMonth ? logs.filter(l => l.monthKey === filterMonth) : logs
  const avgClosing   = monthLogs.length ? monthLogs.reduce((s,l) => s+(l.closingCash||0),0) / monthLogs.length : 0
  const totalDiff    = monthLogs.reduce((s,l) => s+(l.difference||0), 0)
  const activeFilterLabel = filterMonth ? (logs.find(l => l.monthKey === filterMonth)?.month || filterMonth) : 'All'

  const diff    = (parseFloat(form.closingCash)||0) - (parseFloat(form.openingCash)||0)
  const hasDiff = form.openingCash && form.closingCash

  const inp = { padding:'10px 12px', border:'1px solid var(--border)', borderRadius:8, fontFamily:'inherit', fontSize:13, background:'#FDF6EC', width:'100%', boxSizing:'border-box' }

  return (
    <div>
      <TipBanner message="Log opening and closing cash daily. Tap any entry's Edit button to correct it." />

      {/* Entry form — responsive card layout */}
      <div style={{ background:'#fff', border:`1px solid ${editId ? '#E65100' : 'var(--border)'}`, borderRadius:12, overflow:'hidden', marginBottom:14 }}>
        <div style={{ background: editId ? '#E65100' : 'var(--dark)', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
            {editId ? '✏️ Edit Entry' : '💵 New Cash Entry'}
          </div>
          {editId && (
            <button onClick={cancelEdit}
              style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontSize:12, color:'#fff', fontFamily:'inherit' }}>
              Cancel
            </button>
          )}
        </div>

        <div style={{ padding:'16px' }}>
          {/* Row 1: Date + Live Diff */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Date</div>
              <input type="date" value={form.date}
                onChange={e => setForm(f=>({...f, date:e.target.value}))}
                style={inp} />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Difference</div>
              <div style={{
                padding:'10px 12px', borderRadius:8, textAlign:'center',
                background: hasDiff ? (diff >= 0 ? '#E8F5E9' : '#FFEBEE') : '#F5F5F5',
                fontSize:16, fontWeight:800,
                color: hasDiff ? (diff >= 0 ? '#27AE60' : '#E74C3C') : '#ccc',
                border:`1px solid ${hasDiff ? (diff >= 0 ? '#81C784' : '#FFCDD2') : '#EDE0CC'}`,
              }}>
                {hasDiff ? `${diff >= 0 ? '+' : ''}$${diff.toFixed(2)}` : '—'}
              </div>
            </div>
          </div>

          {/* Row 2: Opening + Closing */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#27AE60', marginBottom:4 }}>Opening Cash $</div>
              <input type="number" placeholder="0.00" value={form.openingCash}
                onChange={e => setForm(f=>({...f, openingCash:e.target.value}))}
                style={{ ...inp, fontWeight:700 }} />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Closing Cash $</div>
              <input type="number" placeholder="0.00" value={form.closingCash}
                onChange={e => setForm(f=>({...f, closingCash:e.target.value}))}
                style={{ ...inp, fontWeight:700 }} />
            </div>
          </div>

          {/* Row 3: Notes */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Notes / Comments</div>
            <input type="text" placeholder="Any notes about cash used, variance, etc."
              value={form.comments}
              onChange={e => setForm(f=>({...f, comments:e.target.value}))}
              style={inp} />
          </div>

          <button onClick={handleSave} disabled={saving}
            style={{ width:'100%', background: saving ? '#aaa' : editId ? '#E65100' : 'var(--dark)', color:'#fff', border:'none', borderRadius:8, padding:'12px', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'inherit' }}>
            {saving ? 'Saving…' : editId ? 'Update Entry' : '+ Add Entry'}
          </button>
        </div>
      </div>

      {/* Month summary cards */}
      {monthLogs.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:700, color:'var(--dark)' }}>{monthLogs.length}</div>
            <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>Days Logged</div>
          </div>
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:700, color:'#27AE60' }}>${avgClosing.toFixed(0)}</div>
            <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>Avg Closing</div>
          </div>
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:700, color: totalDiff >= 0 ? '#27AE60' : '#E74C3C' }}>
              {totalDiff >= 0 ? '+' : ''}${totalDiff.toFixed(0)}
            </div>
            <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>Month Diff</div>
          </div>
        </div>
      )}

      {/* History */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        {/* Header + month filter */}
        <div style={{ background:'var(--dark)', padding:'10px 14px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: allMonthKeys.length > 1 ? 8 : 0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>History</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>{monthLogs.length} entries</div>
          </div>
          {allMonthKeys.length > 0 && (
            <div style={{ display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none' }}>
              <button onClick={() => setFilterMonth('')}
                style={{ padding:'4px 12px', borderRadius:20, border:'1px solid rgba(255,255,255,0.3)', cursor:'pointer', fontSize:11, fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0,
                  background: !filterMonth ? 'rgba(255,255,255,0.25)' : 'transparent',
                  color:'#fff', fontWeight: !filterMonth ? 700 : 400 }}>
                All
              </button>
              {allMonthKeys.map(mk => {
                const label = logs.find(l => l.monthKey === mk)?.month || mk
                return (
                  <button key={mk} onClick={() => setFilterMonth(mk)}
                    style={{ padding:'4px 12px', borderRadius:20, border:'1px solid rgba(255,255,255,0.3)', cursor:'pointer', fontSize:11, fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0,
                      background: filterMonth===mk ? 'rgba(255,255,255,0.25)' : 'transparent',
                      color:'#fff', fontWeight: filterMonth===mk ? 700 : 400 }}>
                    {label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>Loading…</div>
        ) : monthLogs.length === 0 ? (
          <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)', fontSize:13 }}>No entries yet</div>
        ) : (
          <>
            {/* Column headers — hidden on mobile via CSS */}
            <div className="cash-table-header" style={{ display:'grid', gridTemplateColumns:'110px 90px 90px 90px 1fr 100px', background:'#F5F0EA', padding:'8px 14px', gap:8 }}>
              {['Date','Opening','Closing','Diff','Notes',''].map(h => (
                <div key={h} style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' }}>{h}</div>
              ))}
            </div>

            {monthLogs.map((log, idx) => (
              <div key={log.id}>
                {/* Desktop row */}
                <div className="cash-row-desktop" style={{
                  display:'grid', gridTemplateColumns:'110px 90px 90px 90px 1fr 100px',
                  padding:'10px 14px', gap:8, alignItems:'center',
                  borderBottom:'1px solid var(--border)',
                  background: editId===log.id ? '#FFF3E0' : idx%2===0 ? '#fff' : 'var(--cream)',
                }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--dark)' }}>{log.date}</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)' }}>{log.loggedBy}</div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#27AE60' }}>${log.openingCash?.toFixed(2)}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>${log.closingCash?.toFixed(2)}</div>
                  <div style={{ fontSize:13, fontWeight:800, color: log.difference >= 0 ? '#27AE60' : '#E74C3C' }}>
                    {log.difference >= 0 ? '+' : ''}${log.difference?.toFixed(2)}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {log.comments || '—'}
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => startEdit(log)}
                      style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, color:'var(--dark)', fontFamily:'inherit' }}>
                      Edit
                    </button>
                    <button onClick={() => deleteLog(log.id)}
                      style={{ background:'none', border:'1px solid #FFCDD2', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, color:'#E74C3C', fontFamily:'inherit' }}>
                      Delete
                    </button>
                  </div>
                </div>

                {/* Mobile card */}
                <div className="cash-row-mobile" style={{
                  padding:'12px 14px',
                  borderBottom:'1px solid var(--border)',
                  background: editId===log.id ? '#FFF3E0' : idx%2===0 ? '#fff' : 'var(--cream)',
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--dark)' }}>{log.date}</div>
                      <div style={{ fontSize:10, color:'var(--text-muted)' }}>{log.loggedBy} · {log.time}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:16, fontWeight:800, color: log.difference >= 0 ? '#27AE60' : '#E74C3C' }}>
                        {log.difference >= 0 ? '+' : ''}${log.difference?.toFixed(2)}
                      </div>
                      <div style={{ fontSize:10, color:'var(--text-muted)' }}>difference</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:12, marginBottom:log.comments ? 8 : 0 }}>
                    <div style={{ flex:1, background:'#E8F5E9', borderRadius:8, padding:'8px', textAlign:'center' }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#27AE60' }}>${log.openingCash?.toFixed(2)}</div>
                      <div style={{ fontSize:9, color:'#8B7355', textTransform:'uppercase' }}>Opening</div>
                    </div>
                    <div style={{ flex:1, background:'#F5F5F5', borderRadius:8, padding:'8px', textAlign:'center' }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--dark)' }}>${log.closingCash?.toFixed(2)}</div>
                      <div style={{ fontSize:9, color:'#8B7355', textTransform:'uppercase' }}>Closing</div>
                    </div>
                  </div>
                  {log.comments && (
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8 }}>📝 {log.comments}</div>
                  )}
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => startEdit(log)}
                      style={{ flex:1, background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'7px', cursor:'pointer', fontSize:12, color:'var(--dark)', fontFamily:'inherit' }}>
                      ✏️ Edit
                    </button>
                    <button onClick={() => deleteLog(log.id)}
                      style={{ flex:1, background:'none', border:'1px solid #FFCDD2', borderRadius:8, padding:'7px', cursor:'pointer', fontSize:12, color:'#E74C3C', fontFamily:'inherit' }}>
                      🗑 Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Month total footer */}
            <div style={{ display:'grid', gridTemplateColumns:'110px 90px 90px 90px 1fr 100px', padding:'10px 14px', gap:8, background:'var(--dark)' }}
              className="cash-table-header">
              <div style={{ fontSize:11, fontWeight:700, color:'#fff' }}>{activeFilterLabel}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>{monthLogs.length} days</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Avg ${avgClosing.toFixed(0)}</div>
              <div style={{ fontSize:14, fontWeight:800, color:'#C8843A' }}>
                {totalDiff >= 0 ? '+' : ''}${totalDiff.toFixed(2)}
              </div>
              <div/><div/>
            </div>
          </>
        )}
      </div>

      <style>{`
        .cash-row-mobile  { display: none !important; }
        .cash-row-desktop { display: grid !important; }
        @media (max-width: 768px) {
          .cash-row-mobile  { display: block !important; }
          .cash-row-desktop { display: none !important; }
          .cash-table-header { display: none !important; }
        }
      `}</style>
    </div>
  )
}
