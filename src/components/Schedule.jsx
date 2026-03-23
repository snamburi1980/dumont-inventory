import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

const COLORS = ['#E74C3C','#3498DB','#27AE60','#F39C12','#9B59B6','#1ABC9C','#E67E22','#2ECC71','#E91E63','#00BCD4']
const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function Schedule({ viewingStore, showToast }) {
  const [members,    setMembers]    = useState([])
  const [shiftTypes, setShiftTypes] = useState([])
  const [shifts,     setShifts]     = useState({}) // { "memberId_dayIdx": [shiftTypeId, ...] }
  const [hrsPeriod,  setHrsPeriod]  = useState('week')
  const [offset,     setOffset]     = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [dragging,   setDragging]   = useState(null) // shiftType being dragged
  const [dragOver,   setDragOver]   = useState(null) // "memberId_dayIdx"
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [showAddShift, setShowAddShift] = useState(false)
  const [newStaff,   setNewStaff]   = useState({ name:'', role:'', color: COLORS[0] })
  const [newST,      setNewST]      = useState({ name:'', start:'09:00', end:'17:00', color: COLORS[2] })
  const [editStaffId,setEditStaffId]= useState(null)
  const [editName,   setEditName]   = useState('')
  const schedRef = useRef(null)

  useEffect(() => { if (viewingStore) loadSchedule() }, [viewingStore, offset])

  // Week label
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay()+6)%7) + offset*7)
  const weekLabel = `${monday.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${new Date(monday.getTime()+6*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`

  async function loadSchedule() {
    if (!viewingStore) return
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'))
      if (snap.exists()) {
        const d = snap.data()
        setMembers(d.members   || [])
        setShiftTypes(d.shiftTypes || [])
        setShifts(d.shifts?.[offset] || {})
      }
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function saveSchedule(newMembers, newShiftTypes, newShifts) {
    if (!viewingStore) return
    try {
      const snap = await getDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'))
      const existing = snap.exists() ? snap.data() : {}
      const allShifts = { ...(existing.shifts || {}), [offset]: newShifts }
      await setDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'), {
        members:    newMembers,
        shiftTypes: newShiftTypes,
        shifts:     allShifts,
        updatedAt:  Date.now()
      })
    } catch(e) { showToast('Save failed') }
  }

  // ── DRAG HANDLERS ──
  function handleDragStart(e, st) {
    setDragging(st)
    e.dataTransfer.effectAllowed = 'copy'
  }

  function handleTouchStart(e, st) {
    setDragging(st)
  }

  function handleDragOver(e, key) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(key)
  }

  function handleTouchMove(e) {
    e.preventDefault()
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const key = el?.dataset?.cellkey
    if (key) setDragOver(key)
  }

  function handleDrop(e, key) {
    e.preventDefault()
    if (!dragging) return
    addShiftToCell(key, dragging.id)
    setDragging(null)
    setDragOver(null)
  }

  function handleTouchEnd(e) {
    if (dragging && dragOver) {
      addShiftToCell(dragOver, dragging.id)
    }
    setDragging(null)
    setDragOver(null)
  }

  function addShiftToCell(key, shiftTypeId) {
    const newShifts = { ...shifts }
    if (!newShifts[key]) newShifts[key] = []
    if (!newShifts[key].includes(shiftTypeId)) {
      newShifts[key] = [...newShifts[key], shiftTypeId]
      setShifts(newShifts)
      saveSchedule(members, shiftTypes, newShifts)
    }
  }

  function removeShiftFromCell(key, shiftTypeId) {
    const newShifts = { ...shifts }
    newShifts[key] = (newShifts[key] || []).filter(id => id !== shiftTypeId)
    if (newShifts[key].length === 0) delete newShifts[key]
    setShifts(newShifts)
    saveSchedule(members, shiftTypes, newShifts)
  }

  // ── STAFF MANAGEMENT ──
  function addStaff() {
    if (!newStaff.name.trim()) { showToast('Enter name'); return }
    const updated = [...members, { id: String(Date.now()), ...newStaff }]
    setMembers(updated)
    saveSchedule(updated, shiftTypes, shifts)
    setNewStaff({ name:'', role:'', color: COLORS[members.length % COLORS.length] })
    setShowAddStaff(false)
    showToast(`${newStaff.name} added`)
  }

  function removeStaff(id) {
    if (!window.confirm('Remove this staff member?')) return
    const updated = members.filter(m => m.id !== id)
    const newShifts = { ...shifts }
    DAYS.forEach((_, di) => delete newShifts[`${id}_${di}`])
    setMembers(updated)
    setShifts(newShifts)
    saveSchedule(updated, shiftTypes, newShifts)
  }

  function saveStaffName(id) {
    if (!editName.trim()) return
    const updated = members.map(m => m.id === id ? { ...m, name: editName } : m)
    setMembers(updated)
    saveSchedule(updated, shiftTypes, shifts)
    setEditStaffId(null)
  }

  // ── SHIFT TYPE MANAGEMENT ──
  function addShiftType() {
    if (!newST.name.trim()) { showToast('Enter shift name'); return }
    const updated = [...shiftTypes, { id: String(Date.now()), ...newST }]
    setShiftTypes(updated)
    saveSchedule(members, updated, shifts)
    setNewST({ name:'', start:'09:00', end:'17:00', color: COLORS[shiftTypes.length % COLORS.length] })
    setShowAddShift(false)
    showToast(`${newST.name} shift added`)
  }

  function removeShiftType(id) {
    const updated = shiftTypes.filter(s => s.id !== id)
    setShiftTypes(updated)
    saveSchedule(members, updated, shifts)
  }

  // ── HOURS SUMMARY ──
  function getHours(memberId) {
    let total = 0
    DAYS.forEach((_, di) => {
      const cell = shifts[`${memberId}_${di}`] || []
      cell.forEach(stId => {
        const st = shiftTypes.find(s => s.id === stId)
        if (st) {
          const [sh, sm] = st.start.split(':').map(Number)
          const [eh, em] = st.end.split(':').map(Number)
          total += (eh*60+em - sh*60-sm) / 60
        }
      })
    })
    return total
  }

  // ── COPY LAST WEEK ──
  async function copyLastWeek() {
    try {
      const snap = await getDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'))
      if (snap.exists()) {
        const prevShifts = snap.data().shifts?.[offset-1] || {}
        if (Object.keys(prevShifts).length === 0) { showToast('No previous week to copy'); return }
        setShifts(prevShifts)
        saveSchedule(members, shiftTypes, prevShifts)
        showToast('Previous week copied!')
      }
    } catch(e) { showToast('Copy failed') }
  }

  // ── SNAPSHOT ──
  async function exportSnapshot() {
    showToast('Generating schedule image...')
    try {
      if (!window.html2canvas) {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
          s.onload = res; s.onerror = rej
          document.head.appendChild(s)
        })
      }
      const canvas = await window.html2canvas(schedRef.current, { scale:2, backgroundColor:'#FDF6EC', useCORS:true })
      const file = new File([await new Promise(r => canvas.toBlob(r,'image/png'))], `Schedule_${weekLabel.replace(/[^a-z0-9]/gi,'_')}.png`, { type:'image/png' })
      if (navigator.share && navigator.canShare?.({ files:[file] })) {
        await navigator.share({ title:'Dumont Schedule', files:[file] })
      } else {
        const url = URL.createObjectURL(file)
        const a = document.createElement('a'); a.href = url; a.download = file.name; a.click()
        URL.revokeObjectURL(url)
      }
      showToast('Schedule exported!')
    } catch(e) { showToast('Export failed') }
  }

  const inp = { padding:'8px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, width:'100%', boxSizing:'border-box', marginBottom:8, background:'#FDF6EC' }
  const totalHoursWeek = members.reduce((s, m) => s + getHours(m.id), 0)

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setOffset(o=>o-1)} style={{ background:'none', border:'1px solid #EDE0CC', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:14 }}>{'‹'}</button>
          <span style={{ fontSize:13, fontWeight:600, color:'#2C1810', whiteSpace:'nowrap' }}>{weekLabel}</span>
          <button onClick={() => setOffset(o=>o+1)} style={{ background:'none', border:'1px solid #EDE0CC', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:14 }}>{'›'}</button>
          {offset !== 0 && <button onClick={() => setOffset(0)} style={{ background:'none', border:'1px solid #EDE0CC', borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:11, color:'#8B7355' }}>Today</button>}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={copyLastWeek} style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:11, color:'#8B7355' }}>Copy Last Week</button>
          <button onClick={exportSnapshot} style={{ background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:11, fontWeight:600 }}>📸 Share</button>
        </div>
      </div>

      {/* Shift type palette - drag from here */}
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:11, color:'#8B7355', marginBottom:6, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>
          Drag shifts onto the grid ↓
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {shiftTypes.map(st => (
            <div
              key={st.id}
              draggable
              onDragStart={e => handleDragStart(e, st)}
              onTouchStart={e => handleTouchStart(e, st)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                background: st.color, color:'#fff',
                borderRadius:20, padding:'6px 14px',
                fontSize:12, fontWeight:600, cursor:'grab',
                userSelect:'none', touchAction:'none',
                boxShadow: dragging?.id === st.id ? '0 4px 12px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.15)',
                transform: dragging?.id === st.id ? 'scale(1.05)' : 'scale(1)',
                transition:'transform 0.1s, box-shadow 0.1s'
              }}
            >
              {st.name} {st.start}–{st.end}
            </div>
          ))}
          <button
            onClick={() => setShowAddShift(true)}
            style={{ background:'none', border:'1.5px dashed #EDE0CC', borderRadius:20, padding:'6px 14px', fontSize:12, color:'#8B7355', cursor:'pointer' }}
          >
            + Shift Type
          </button>
        </div>
      </div>

      {/* Schedule grid */}
      <div ref={schedRef} style={{ overflowX:'auto', marginBottom:16 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
          <thead>
            <tr>
              <th style={{ padding:'8px 10px', textAlign:'left', fontSize:12, color:'#8B7355', fontWeight:600, borderBottom:'2px solid #EDE0CC', minWidth:100 }}>Staff</th>
              {DAYS.map(d => (
                <th key={d} style={{ padding:'8px 6px', textAlign:'center', fontSize:12, color:'#8B7355', fontWeight:600, borderBottom:'2px solid #EDE0CC', minWidth:70 }}>{d}</th>
              ))}
              <th style={{ padding:'8px 6px', textAlign:'center', fontSize:12, color:'#8B7355', fontWeight:600, borderBottom:'2px solid #EDE0CC', minWidth:50 }}>Hrs</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member, mi) => (
              <tr key={member.id} style={{ borderBottom:'1px solid #F5EFE8' }}>
                {/* Staff name */}
                <td style={{ padding:'8px 10px', verticalAlign:'middle' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background: member.color, flexShrink:0 }}/>
                    {editStaffId === member.id ? (
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={() => saveStaffName(member.id)}
                        onKeyDown={e => e.key==='Enter' && saveStaffName(member.id)}
                        autoFocus
                        style={{ ...inp, marginBottom:0, padding:'3px 6px', width:80, fontSize:12 }}
                      />
                    ) : (
                      <span
                        style={{ fontSize:12, fontWeight:600, color:'#2C1810', cursor:'pointer' }}
                        onClick={() => { setEditStaffId(member.id); setEditName(member.name) }}
                      >
                        {member.name}
                      </span>
                    )}
                    <button
                      onClick={() => removeStaff(member.id)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#E74C3C', fontSize:12, padding:0, opacity:0.5, marginLeft:2 }}
                    >×</button>
                  </div>
                </td>
                {/* Day cells */}
                {DAYS.map((day, di) => {
                  const key = `${member.id}_${di}`
                  const cellShifts = shifts[key] || []
                  const isOver = dragOver === key
                  return (
                    <td
                      key={di}
                      data-cellkey={key}
                      onDragOver={e => handleDragOver(e, key)}
                      onDrop={e => handleDrop(e, key)}
                      onDragLeave={() => setDragOver(null)}
                      style={{
                        padding:'4px 3px',
                        verticalAlign:'top',
                        background: isOver ? 'rgba(200,132,58,0.1)' : 'transparent',
                        border: isOver ? '2px dashed #C8843A' : '2px solid transparent',
                        borderRadius:8,
                        minHeight:50,
                        transition:'background 0.1s'
                      }}
                    >
                      <div style={{ display:'flex', flexDirection:'column', gap:2, minHeight:40 }}>
                        {cellShifts.map(stId => {
                          const st = shiftTypes.find(s => s.id === stId)
                          if (!st) return null
                          return (
                            <div
                              key={stId}
                              style={{
                                background: st.color, color:'#fff',
                                borderRadius:4, padding:'2px 5px',
                                fontSize:10, fontWeight:600,
                                display:'flex', alignItems:'center', justifyContent:'space-between',
                                gap:2
                              }}
                            >
                              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{st.name}</span>
                              <span
                                onClick={() => removeShiftFromCell(key, stId)}
                                style={{ cursor:'pointer', opacity:0.8, fontSize:11, flexShrink:0 }}
                              >×</span>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
                {/* Hours */}
                <td style={{ padding:'8px 6px', textAlign:'center', fontSize:12, fontWeight:700, color:'#C8843A' }}>
                  {getHours(member.id).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {members.length === 0 && (
          <div style={{ textAlign:'center', padding:'32px 20px', color:'#8B7355', fontSize:13 }}>
            No staff yet — add staff below
          </div>
        )}
      </div>

      {/* Add Staff button */}
      <button
        onClick={() => setShowAddStaff(true)}
        style={{ width:'100%', background:'#fff', border:'1.5px dashed #EDE0CC', borderRadius:10, padding:'11px', cursor:'pointer', fontSize:13, color:'#8B7355', fontWeight:500, marginBottom:16 }}
      >
        + Add Staff Member
      </button>

      {/* Hours Summary */}
      <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#2C1810' }}>Hours Summary</div>
          <div style={{ display:'flex', gap:6 }}>
            {['week','month'].map(p => (
              <button key={p} onClick={() => setHrsPeriod(p)} style={{
                padding:'4px 10px', borderRadius:20, border:'1px solid #EDE0CC',
                background: hrsPeriod===p ? '#2C1810' : '#fff',
                color: hrsPeriod===p ? '#fff' : '#8B7355',
                fontSize:11, cursor:'pointer', fontFamily:'inherit'
              }}>{p === 'week' ? 'This Week' : 'This Month'}</button>
            ))}
          </div>
        </div>
        {members.map(m => {
          const hrs = getHours(m.id)
          return (
            <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #F5EFE8' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: m.color }}/>
                <span style={{ fontSize:13, color:'#2C1810' }}>{m.name}</span>
                {m.role && <span style={{ fontSize:11, color:'#8B7355' }}>· {m.role}</span>}
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:'#C8843A' }}>{hrs.toFixed(1)}h</span>
            </div>
          )
        })}
        <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 0', marginTop:4 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#2C1810' }}>Total</span>
          <span style={{ fontSize:14, fontWeight:700, color:'#2C1810' }}>{totalHoursWeek.toFixed(1)}h</span>
        </div>
      </div>

      {/* Add Staff Modal */}
      {showAddStaff && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:20, width:'100%', maxWidth:360 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#2C1810', marginBottom:14 }}>Add Staff Member</div>
            <input placeholder="Full name" value={newStaff.name} onChange={e => setNewStaff(s=>({...s,name:e.target.value}))} style={inp}/>
            <input placeholder="Role (e.g. Barista, Lead)" value={newStaff.role} onChange={e => setNewStaff(s=>({...s,role:e.target.value}))} style={inp}/>
            <div style={{ fontSize:12, color:'#8B7355', marginBottom:6 }}>Color</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              {COLORS.map(c => (
                <div key={c} onClick={() => setNewStaff(s=>({...s,color:c}))}
                  style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer',
                    border: newStaff.color===c ? '3px solid #2C1810' : '2px solid transparent' }}/>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={addStaff} style={{ flex:1, background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'11px', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit' }}>Add</button>
              <button onClick={() => setShowAddStaff(false)} style={{ padding:'11px 16px', background:'#888', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Shift Type Modal */}
      {showAddShift && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:20, width:'100%', maxWidth:360 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#2C1810', marginBottom:14 }}>Add Shift Type</div>
            <input placeholder="Shift name (e.g. Morning, Close)" value={newST.name} onChange={e => setNewST(s=>({...s,name:e.target.value}))} style={inp}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
              <div>
                <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>Start time</div>
                <input type="time" value={newST.start} onChange={e => setNewST(s=>({...s,start:e.target.value}))} style={{ ...inp, marginBottom:0 }}/>
              </div>
              <div>
                <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>End time</div>
                <input type="time" value={newST.end} onChange={e => setNewST(s=>({...s,end:e.target.value}))} style={{ ...inp, marginBottom:0 }}/>
              </div>
            </div>
            <div style={{ fontSize:12, color:'#8B7355', margin:'8px 0 6px' }}>Color</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              {COLORS.map(c => (
                <div key={c} onClick={() => setNewST(s=>({...s,color:c}))}
                  style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer',
                    border: newST.color===c ? '3px solid #2C1810' : '2px solid transparent' }}/>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={addShiftType} style={{ flex:1, background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'11px', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit' }}>Add Shift</button>
              <button onClick={() => setShowAddShift(false)} style={{ padding:'11px 16px', background:'#888', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
