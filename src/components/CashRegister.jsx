import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase/config'
import TipBanner from './TipBanner'

export default function CashRegister({ viewingStore, auth, showToast }) {
  const [logs,       setLogs]       = useState([])
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const now     = new Date()
  const todayStr = now.toISOString().split('T')[0] // YYYY-MM-DD for input

  const [form, setForm] = useState({
    date:        todayStr,
    openingCash: '',
    closingCash: '',
    comments:    '',
  })

  const userName = auth?.userConfig?.name || 'Staff'

  useEffect(() => { loadLogs() }, [viewingStore])

  async function loadLogs() {
    if (!viewingStore) return
    setLoading(true)
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'cashRegister'),
        orderBy('timestamp', 'desc'),
        limit(60)
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

      await addDoc(collection(db, 'stores', viewingStore, 'cashRegister'), {
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
      })

      await loadLogs()
      setForm({ date: todayStr, openingCash:'', closingCash:'', comments:'' })
      showToast('Cash register saved ✅')
    } catch(e) {
      console.error(e)
      showToast('Save failed — try again')
    }
    setSaving(false)
  }

  async function deleteLog(id) {
    if (!window.confirm('Delete this entry?')) return
    try {
      await deleteDoc(doc(db, 'stores', viewingStore, 'cashRegister', id))
      setLogs(prev => prev.filter(l => l.id !== id))
      showToast('Entry deleted')
    } catch(e) {
      console.error(e)
      showToast('Delete failed — try again')
    }
  }

  // Monthly summary
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const monthLogs    = logs.filter(l => l.monthKey === thisMonthKey)
  const avgClosing   = monthLogs.length ? monthLogs.reduce((s,l) => s+(l.closingCash||0),0) / monthLogs.length : 0
  const totalDiff    = monthLogs.reduce((s,l) => s+(l.difference||0), 0)

  const diff = (parseFloat(form.closingCash)||0) - (parseFloat(form.openingCash)||0)
  const hasDiff = form.openingCash && form.closingCash

  const cell = { padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8, fontFamily:'inherit', fontSize:13, background:'#FDF6EC', width:'100%', boxSizing:'border-box' }

  return (
    <div>
      <TipBanner message="Log opening and closing cash daily. Date is pre-filled but can be changed to add past entries. Comments for any cash used." />

      {/* Entry form — table style */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
        <div style={{ background:'var(--dark)', padding:'10px 16px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>💵 Cash Register Entry</div>
        </div>
        <div style={{ padding:'14px 16px', overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:560 }}>
            <thead>
              <tr>
                {['Date','Opening $','Closing $','Difference','Comments',''].map(h => (
                  <th key={h} style={{ padding:'0 8px 8px 0', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding:'0 8px 0 0', minWidth:130 }}>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f=>({...f, date:e.target.value}))}
                    style={{ ...cell, minWidth:120 }}
                  />
                </td>
                <td style={{ padding:'0 8px 0 0', minWidth:100 }}>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={form.openingCash}
                    onChange={e => setForm(f=>({...f, openingCash:e.target.value}))}
                    style={{ ...cell, color:'#27AE60', fontWeight:700 }}
                  />
                </td>
                <td style={{ padding:'0 8px 0 0', minWidth:100 }}>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={form.closingCash}
                    onChange={e => setForm(f=>({...f, closingCash:e.target.value}))}
                    style={{ ...cell, color:'#E74C3C', fontWeight:700 }}
                  />
                </td>
                <td style={{ padding:'0 8px 0 0', minWidth:90 }}>
                  <div style={{
                    padding:'8px 10px', borderRadius:8, textAlign:'center',
                    background: hasDiff ? (diff >= 0 ? '#E8F5E9' : '#FFEBEE') : '#F5F5F5',
                    fontSize:14, fontWeight:800,
                    color: hasDiff ? (diff >= 0 ? '#27AE60' : '#E74C3C') : '#ccc'
                  }}>
                    {hasDiff ? `${diff >= 0 ? '+' : ''}$${diff.toFixed(2)}` : '—'}
                  </div>
                </td>
                <td style={{ padding:'0 8px 0 0', minWidth:160 }}>
                  <input
                    type="text"
                    placeholder="Any notes..."
                    value={form.comments}
                    onChange={e => setForm(f=>({...f, comments:e.target.value}))}
                    style={cell}
                  />
                </td>
                <td style={{ minWidth:70 }}>
                  <button onClick={handleSave} disabled={saving}
                    style={{ background: saving ? '#aaa' : 'var(--dark)', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', whiteSpace:'nowrap' }}>
                    {saving ? '...' : '+ Add'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly summary */}
      {monthLogs.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'var(--dark)' }}>{monthLogs.length}</div>
            <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>Days Logged</div>
          </div>
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#27AE60' }}>${avgClosing.toFixed(0)}</div>
            <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>Avg Closing</div>
          </div>
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:700, color: totalDiff >= 0 ? '#27AE60' : '#E74C3C' }}>
              {totalDiff >= 0 ? '+' : ''}${totalDiff.toFixed(0)}
            </div>
            <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>Month Diff</div>
          </div>
        </div>
      )}

      {/* History table */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'100px 90px 90px 90px 1fr', background:'var(--dark)', padding:'10px 14px', gap:8 }}>
          {['Date','Opening','Closing','Diff','Comments',''].map(h => (
            <div key={h} style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase' }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)', fontSize:13 }}>No entries yet</div>
        ) : logs.map((log, idx) => (
          <div key={log.id} style={{
            display:'grid', gridTemplateColumns:'100px 90px 90px 90px 1fr 40px',
            padding:'10px 14px', gap:8, alignItems:'center',
            borderBottom: idx < logs.length-1 ? '1px solid var(--border)' : 'none',
            background: idx%2===0 ? '#fff' : 'var(--cream)'
          }}>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--dark)' }}>{log.date}</div>
              <div style={{ fontSize:10, color:'var(--text-muted)' }}>{log.loggedBy}</div>
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:'#27AE60' }}>${log.openingCash?.toFixed(2)}</div>
            <div style={{ fontSize:13, fontWeight:600, color:'#E74C3C' }}>${log.closingCash?.toFixed(2)}</div>
            <div style={{ fontSize:13, fontWeight:800, color: log.difference >= 0 ? '#27AE60' : '#E74C3C' }}>
              {log.difference >= 0 ? '+' : ''}${log.difference?.toFixed(2)}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {log.comments || '—'}
            </div>
            <button onClick={() => deleteLog(log.id)}
              style={{ background:'none', border:'1px solid #FFCDD2', borderRadius:6, padding:'4px 6px', cursor:'pointer', fontSize:11, color:'#E74C3C', fontFamily:'inherit' }}>
              Del
            </button>
          </div>
        ))}

        {/* Month total row */}
        {logs.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'100px 90px 90px 90px 1fr', padding:'10px 14px', gap:8, background:'var(--dark)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#fff' }}>This Month</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>{monthLogs.length} days</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Avg ${avgClosing.toFixed(0)}</div>
            <div style={{ fontSize:13, fontWeight:800, color:'#C8843A' }}>
              {totalDiff >= 0 ? '+' : ''}${totalDiff.toFixed(2)}
            </div>
            <div/>
          </div>
        )}
      </div>
    </div>
  )
}
