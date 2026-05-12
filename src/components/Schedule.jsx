import TipBanner from './TipBanner'
import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

const COLORS = ['#E74C3C','#3498DB','#27AE60','#F39C12','#9B59B6','#1ABC9C','#E67E22','#2ECC71','#E91E63','#00BCD4']
const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function to12(time24) {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12  = h % 12 || 12
  return `${h12}:${String(m).padStart(2,'0')}${ampm}`
}

function timeToMins(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minsToHrs(m) { return (m / 60).toFixed(1) }

// Detect mobile — screen width < 768px
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function Schedule({ viewingStore, showToast }) {
  const isMobile = useIsMobile()

  const [members,       setMembers]       = useState([])
  const [presets,       setPresets]       = useState([])
  const [shifts,        setShifts]        = useState({})
  const [offset,        setOffset]        = useState(0)
  const [selectedDay,   setSelectedDay]   = useState(0) // mobile: which day is shown
  const [mobileView,    setMobileView]    = useState('week') // mobile: 'week' | 'day'
  const [modal,         setModal]         = useState(null)
  const [shiftForm,     setShiftForm]     = useState({ start:'09:00', end:'17:00' })
  const [showCustom,    setShowCustom]    = useState(false)
  const [showAddStaff,  setShowAddStaff]  = useState(false)
  const [showAddPreset, setShowAddPreset] = useState(false)
  const [newStaff,      setNewStaff]      = useState({ name:'', role:'', color: COLORS[0] })
  const [newPreset,     setNewPreset]     = useState({ name:'', start:'09:00', end:'17:00', color: COLORS[2] })
  const [editStaffId,   setEditStaffId]   = useState(null)
  const [editName,      setEditName]      = useState('')
  const [snapshotUrl,   setSnapshotUrl]   = useState(null)
  const schedRef = useRef(null)

  const offsetRef = useRef(offset)
  useEffect(() => { offsetRef.current = offset }, [offset])

  useEffect(() => { if (viewingStore) loadSchedule() }, [viewingStore, offset])

  // Set selected day to today on mobile
  useEffect(() => {
    const todayIdx = (new Date().getDay() + 6) % 7 // Mon=0
    setSelectedDay(todayIdx)
  }, [])

  const today  = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay()+6)%7) + offset*7)
  const weekLabel = `${monday.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${new Date(monday.getTime()+6*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`

  // Get date for each day
  function getDayDate(dayIdx) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + dayIdx)
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
  }

  function isToday(dayIdx) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + dayIdx)
    return d.toDateString() === new Date().toDateString()
  }

  async function loadSchedule() {
    if (!viewingStore) return
    // Always clear shifts first to prevent stale data showing
    setShifts({})
    try {
      const snap = await getDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'))
      if (snap.exists()) {
        const d = snap.data()
        setMembers(d.members || [])
        setPresets(d.presets || [])
        // Explicitly set to empty object if no shifts for this week
        setShifts(d.shifts?.[String(offset)] || {})
      }
    } catch(e) {
      console.error(e)
      setShifts({}) // clear on error too
    }
  }

  async function save(newMembers, newPresets, newShifts, retries = 2) {
    if (!viewingStore) return
    // Capture offset at call time to avoid stale closure writing to wrong week
    const savedOffset = offsetRef.current
    try {
      const snap     = await getDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'))
      const existing = snap.exists() ? snap.data() : {}
      // Preserve ALL existing weeks, only overwrite the week this save was triggered for
      const allShifts = { ...(existing.shifts || {}) }
      if (newShifts !== null) {
        allShifts[String(savedOffset)] = newShifts
      }
      await setDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'), {
        members:   newMembers,
        presets:   newPresets,
        shifts:    allShifts,
        updatedAt: Date.now()
      })
    } catch(e) {
      console.error('Schedule save error:', e)
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000))
        return save(newMembers, newPresets, newShifts, retries - 1)
      }
      showToast('⚠️ Save failed — check your connection')
    }
  }

  // Save only members/presets without touching shifts at all
  async function saveMetaOnly(newMembers, newPresets) {
    if (!viewingStore) return
    try {
      const snap     = await getDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'))
      const existing = snap.exists() ? snap.data() : {}
      await setDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'), {
        members:   newMembers,
        presets:   newPresets,
        shifts:    existing.shifts || {},
        updatedAt: Date.now()
      })
    } catch(e) {
      console.error('Schedule meta save error:', e)
      showToast('⚠️ Save failed — check your connection')
    }
  }

  function openCell(memberId, dayIdx) {
    setModal({ memberId, dayIdx, key:`${memberId}_${dayIdx}` })
    setShiftForm({ start:'09:00', end:'17:00' })
    setShowCustom(false)
  }

  function addPresetToCell(preset) {
    if (!modal) return
    const newShifts = { ...shifts }
    newShifts[modal.key] = [...(newShifts[modal.key]||[]), { start:preset.start, end:preset.end, name:preset.name, color:preset.color }]
    setShifts(newShifts)
    save(members, presets, newShifts)
  }

  function addCustomShift() {
    if (!modal) return
    const mins = timeToMins(shiftForm.end) - timeToMins(shiftForm.start)
    if (mins <= 0) { showToast('End must be after start'); return }
    const newShifts = { ...shifts }
    const member = members.find(m => m.id === modal.memberId)
    newShifts[modal.key] = [...(newShifts[modal.key]||[]), { start:shiftForm.start, end:shiftForm.end, color: member?.color || COLORS[0] }]
    setShifts(newShifts)
    save(members, presets, newShifts)
    setShiftForm({ start:'09:00', end:'17:00' })
    setShowCustom(false)
  }

  function removeShift(key, idx) {
    const newShifts = { ...shifts }
    newShifts[key] = newShifts[key].filter((_,i) => i !== idx)
    if (!newShifts[key].length) delete newShifts[key]
    setShifts(newShifts)
    save(members, presets, newShifts)
  }

  function addStaff() {
    if (!newStaff.name.trim()) { showToast('Enter name'); return }
    const updated = [...members, { id:String(Date.now()), ...newStaff }]
    setMembers(updated)
    saveMetaOnly(updated, presets)
    setNewStaff({ name:'', role:'', color: COLORS[updated.length % COLORS.length] })
    setShowAddStaff(false)
    showToast(`${newStaff.name} added`)
  }

  function removeStaff(id) {
    if (!window.confirm('Remove this staff member?')) return
    const updated = members.filter(m => m.id !== id)
    const newShifts = { ...shifts }
    DAYS.forEach((_,di) => delete newShifts[`${id}_${di}`])
    setMembers(updated)
    setShifts(newShifts)
    saveMetaOnly(updated, presets)
    save(updated, presets, newShifts)
  }

  function saveStaffName(id) {
    if (!editName.trim()) return
    const updated = members.map(m => m.id===id ? {...m,name:editName} : m)
    setMembers(updated)
    saveMetaOnly(updated, presets)
    setEditStaffId(null)
  }

  function addPreset() {
    if (!newPreset.name.trim()) { showToast('Enter shift name'); return }
    const updated = [...presets, { id:String(Date.now()), ...newPreset }]
    setPresets(updated)
    saveMetaOnly(members, updated)
    setNewPreset({ name:'', start:'09:00', end:'17:00', color: COLORS[updated.length % COLORS.length] })
    setShowAddPreset(false)
    showToast(`${newPreset.name} shift added`)
  }

  function removePreset(id) {
    const updated = presets.filter(p => p.id !== id)
    setPresets(updated)
    saveMetaOnly(members, updated)
  }

  function getHours(memberId) {
    return DAYS.reduce((total, _, di) => {
      const cell = shifts[`${memberId}_${di}`] || []
      return total + cell.reduce((s, sh) => s + Math.max(0, timeToMins(sh.end) - timeToMins(sh.start)), 0)
    }, 0)
  }

  async function copyLastWeek() {
    try {
      const snap = await getDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'))
      if (snap.exists()) {
        const prev = snap.data().shifts?.[String(offset-1)] || {}
        if (!Object.keys(prev).length) { showToast('No previous week to copy'); return }
        setShifts(prev)
        save(members, presets, prev)
        showToast('Previous week copied!')
      }
    } catch(e) { showToast('Copy failed') }
  }

  async function clearWeek() {
    if (!window.confirm(`Clear all shifts for ${weekLabel}?`)) return
    setShifts({})
    await save(members, presets, {})
    showToast('Week cleared ✅')
  }

  async function exportSnapshot() {
    showToast('Generating snapshot...')
    try {
      if (!window.html2canvas) {
        await new Promise((res,rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
          s.onload=res; s.onerror=rej; document.head.appendChild(s)
        })
      }
      const canvas = await window.html2canvas(schedRef.current, { scale:2, backgroundColor:'#FDF6EC', useCORS:true })
      setSnapshotUrl(canvas.toDataURL('image/png'))
    } catch(e) { showToast('Snapshot failed — try again') }
  }

  const inp        = { padding:'8px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, width:'100%', boxSizing:'border-box', marginBottom:8, background:'#FDF6EC' }
  const totalHrs   = members.reduce((s,m) => s + getHours(m.id), 0)
  const member     = modal ? members.find(m => m.id===modal.memberId) : null
  const cellShifts = modal ? (shifts[modal.key]||[]) : []

  // ── SHARED HEADER ─────────────────────────────────────────
  const Header = () => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <button onClick={() => setOffset(o=>o-1)} style={{ background:'none', border:'1px solid #EDE0CC', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:16 }}>‹</button>
        <span style={{ fontSize:13, fontWeight:600, color:'#2C1810', whiteSpace:'nowrap' }}>{weekLabel}</span>
        <button onClick={() => setOffset(o=>o+1)} style={{ background:'none', border:'1px solid #EDE0CC', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:16 }}>›</button>
        {offset !== 0 && <button onClick={() => setOffset(0)} style={{ background:'none', border:'1px solid #EDE0CC', borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:11, color:'#8B7355' }}>Today</button>}
      </div>
      <div style={{ display:'flex', gap:6 }}>
       <button onClick={copyLastWeek} style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:11, color:'#8B7355' }}>Copy Last Week</button>
<button onClick={clearWeek} style={{ background:'#fff', border:'1px solid #FFCDD2', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:11, color:'#E74C3C' }}>Clear Week</button>
<button onClick={exportSnapshot} style={{ background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:11, fontWeight:600 }}>Share</button>
      </div>
    </div>
  )

  // ── MOBILE VIEW ──────────────────────────────────────────
  const MobileView = () => (
    <div>
      {/* Week/Day toggle */}
      <div style={{ display:'flex', gap:6, marginBottom:10 }}>
        <button onClick={() => setMobileView('week')}
          style={{ flex:1, padding:'7px', borderRadius:8, border:'1px solid #EDE0CC', cursor:'pointer', fontSize:11, fontFamily:'inherit',
            background: mobileView==='week' ? '#2C1810' : '#fff', color: mobileView==='week' ? '#fff' : '#8B7355', fontWeight: mobileView==='week' ? 700 : 400 }}>
          Week View
        </button>
        <button onClick={() => setMobileView('day')}
          style={{ flex:1, padding:'7px', borderRadius:8, border:'1px solid #EDE0CC', cursor:'pointer', fontSize:11, fontFamily:'inherit',
            background: mobileView==='day' ? '#2C1810' : '#fff', color: mobileView==='day' ? '#fff' : '#8B7355', fontWeight: mobileView==='day' ? 700 : 400 }}>
          Day View
        </button>
      </div>

      {/* WEEK VIEW — mini scrollable grid */}
      {mobileView === 'week' && (
        <div style={{ overflowX:'auto', marginBottom:14, background:'#fff', border:'1px solid #EDE0CC', borderRadius:12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:480 }}>
            <thead>
              <tr style={{ background:'#FAF7F2' }}>
                <th style={{ padding:'8px', textAlign:'left', fontSize:11, color:'#8B7355', fontWeight:600, borderBottom:'1px solid #EDE0CC', width:80 }}>Staff</th>
                {DAYS.map((d, di) => (
                  <th key={d} style={{ padding:'8px 3px', textAlign:'center', fontSize:11, color: isToday(di) ? '#C8843A' : '#8B7355', fontWeight: isToday(di) ? 700 : 600, borderBottom:'1px solid #EDE0CC' }}>
                    <div>{d}</div>
                    <div style={{ fontSize:9, fontWeight:400, color:'#aaa' }}>{getDayDate(di).split(' ')[1]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ borderBottom:'1px solid #F5EFE8' }}>
                  <td style={{ padding:'6px 8px', verticalAlign:'middle' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:m.color, flexShrink:0 }}/>
                      <span style={{ fontSize:11, fontWeight:600, color:'#2C1810' }}>{m.name}</span>
                    </div>
                  </td>
                  {DAYS.map((_, di) => {
                    const key      = `${m.id}_${di}`
                    const cellData = shifts[key] || []
                    return (
                      <td key={di} onClick={() => openCell(m.id, di)}
                        style={{ padding:'3px 2px', verticalAlign:'top', cursor:'pointer', background: isToday(di) ? '#FFFBF5' : 'transparent' }}>
                        <div style={{ minHeight:28, display:'flex', flexDirection:'column', gap:1 }}>
                          {cellData.map((sh, si) => (
                            <div key={si} style={{ background: sh.color || m.color, color:'#fff', borderRadius:3, padding:'1px 3px', fontSize:8, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden' }}>
                              {to12(sh.start)}
                            </div>
                          ))}
                          {cellData.length === 0 && (
                            <div style={{ textAlign:'center', fontSize:12, color:'#EDE0CC', paddingTop:4 }}>+</div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {members.length === 0 && (
            <div style={{ textAlign:'center', padding:20, color:'#8B7355', fontSize:12 }}>No staff yet</div>
          )}
        </div>
      )}

      {/* DAY VIEW */}
      {mobileView === 'day' && (
        <div>
          {/* Day selector tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:10, overflowX:'auto', paddingBottom:4 }}>
            {DAYS.map((day, di) => {
              const hasShifts = members.some(m => (shifts[`${m.id}_${di}`]||[]).length > 0)
              const todayDay  = isToday(di)
              return (
                <button key={di} onClick={() => setSelectedDay(di)} style={{
                  flexShrink:0, padding:'8px 10px', borderRadius:10, cursor:'pointer',
                  fontFamily:'inherit', textAlign:'center', minWidth:44,
                  background: selectedDay===di ? '#2C1810' : todayDay ? '#FFF3E0' : '#fff',
                  border: todayDay ? '1px solid #FFB74D' : '1px solid #EDE0CC',
                  color: selectedDay===di ? '#fff' : '#2C1810',
                }}>
                  <div style={{ fontSize:11, fontWeight:700 }}>{day}</div>
                  <div style={{ fontSize:9, color: selectedDay===di ? 'rgba(255,255,255,0.7)' : '#8B7355', marginTop:1 }}>{getDayDate(di).split(' ')[1]}</div>
                  {hasShifts && <div style={{ width:5, height:5, borderRadius:'50%', background: selectedDay===di ? '#C8843A' : '#27AE60', margin:'3px auto 0' }}/>}
                </button>
              )
            })}
          </div>

          <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
            <div style={{ background:'#2C1810', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{DAYS[selectedDay]} · {getDayDate(selectedDay)}</div>
              {isToday(selectedDay) && <span style={{ fontSize:10, background:'#C8843A', color:'#fff', borderRadius:20, padding:'2px 8px' }}>Today</span>}
            </div>

            {members.length === 0 ? (
              <div style={{ textAlign:'center', padding:24, color:'#8B7355', fontSize:13 }}>No staff added yet</div>
            ) : members.map((m, idx) => {
              const key      = `${m.id}_${selectedDay}`
              const cellData = shifts[key] || []
              const dayHrs   = cellData.reduce((s, sh) => s + Math.max(0, timeToMins(sh.end) - timeToMins(sh.start)), 0)
              return (
                <div key={m.id} style={{ borderBottom: idx < members.length-1 ? '1px solid #F5EFE8' : 'none', padding:'12px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:m.color, flexShrink:0 }}/>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#2C1810' }}>{m.name}</div>
                        {m.role && <div style={{ fontSize:10, color:'#8B7355' }}>{m.role}</div>}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {dayHrs > 0 && <span style={{ fontSize:12, fontWeight:700, color:'#C8843A' }}>{minsToHrs(dayHrs)}h</span>}
                      <button onClick={() => openCell(m.id, selectedDay)}
                        style={{ background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>
                        + Shift
                      </button>
                    </div>
                  </div>
                  {cellData.length > 0 && (
                    <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
                      {cellData.map((sh, si) => (
                        <div key={si} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background: sh.color || m.color, borderRadius:8, padding:'6px 10px' }}>
                          <span style={{ fontSize:12, fontWeight:600, color:'#fff' }}>
                            {sh.name ? `${sh.name} · ` : ''}{to12(sh.start)} – {to12(sh.end)}
                          </span>
                          <button onClick={() => removeShift(key, si)}
                            style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:4, padding:'2px 6px', cursor:'pointer', fontSize:11, color:'#fff', fontWeight:600 }}>
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {cellData.length === 0 && <div style={{ marginTop:6, fontSize:11, color:'#aaa' }}>No shift assigned</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add staff */}
      <button onClick={() => setShowAddStaff(true)}
        style={{ width:'100%', background:'#fff', border:'1.5px dashed #EDE0CC', borderRadius:10, padding:'11px', cursor:'pointer', fontSize:13, color:'#8B7355', fontWeight:500, marginBottom:14 }}>
        + Add Staff Member
      </button>

      {/* Hours summary */}
      <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:'14px 16px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:10 }}>Week Hours Summary</div>
        {members.map(m => (
          <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #F5EFE8' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:m.color }}/>
              <span style={{ fontSize:13, color:'#2C1810' }}>{m.name}</span>
            </div>
            <span style={{ fontSize:13, fontWeight:700, color:'#C8843A' }}>{minsToHrs(getHours(m.id))}h</span>
          </div>
        ))}
        <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 0' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#2C1810' }}>Total</span>
          <span style={{ fontSize:14, fontWeight:700, color:'#2C1810' }}>{minsToHrs(totalHrs)}h</span>
        </div>
      </div>
    </div>
  )

    // ── DESKTOP VIEW ──────────────────────────────────────────
  const DesktopView = () => (
    <div>
      {/* Shift Presets bar */}
      <div style={{ background:'#FAF7F2', border:'1px solid #EDE0CC', borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
        <div style={{ fontSize:11, color:'#8B7355', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Standard Shifts — tap a cell then pick a shift</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {presets.map(p => (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:1 }}>
              <div style={{ background:p.color, color:'#fff', borderRadius:16, padding:'5px 12px', fontSize:11, fontWeight:600 }}>
                {p.name} · {to12(p.start)}–{to12(p.end)}
              </div>
              <button onClick={() => removePreset(p.id)}
                style={{ background:'none', border:'none', color:'#E74C3C', cursor:'pointer', fontSize:13, padding:'0 3px', opacity:0.5 }}>×</button>
            </div>
          ))}
          <button onClick={() => setShowAddPreset(true)}
            style={{ background:'none', border:'1.5px dashed #EDE0CC', borderRadius:16, padding:'5px 12px', fontSize:11, color:'#8B7355', cursor:'pointer' }}>
            + Add Standard Shift
          </button>
        </div>
      </div>

      {/* Grid */}
      <div ref={schedRef} style={{ overflowX:'auto', marginBottom:16, background:'#fff', border:'1px solid #EDE0CC', borderRadius:12 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:520 }}>
          <thead>
            <tr style={{ background:'#FAF7F2' }}>
              <th style={{ padding:'10px 12px', textAlign:'left', fontSize:12, color:'#8B7355', fontWeight:600, borderBottom:'1px solid #EDE0CC', width:110 }}>Staff</th>
              {DAYS.map((d, di) => (
                <th key={d} style={{ padding:'10px 6px', textAlign:'center', fontSize:12, color: isToday(di) ? '#C8843A' : '#8B7355', fontWeight: isToday(di) ? 700 : 600, borderBottom:'1px solid #EDE0CC' }}>
                  {d}
                  <div style={{ fontSize:9, fontWeight:400, color:'#aaa' }}>{getDayDate(di)}</div>
                </th>
              ))}
              <th style={{ padding:'10px 6px', textAlign:'center', fontSize:12, color:'#8B7355', fontWeight:600, borderBottom:'1px solid #EDE0CC', width:48 }}>Hrs</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} style={{ borderBottom:'1px solid #F5EFE8' }}>
                <td style={{ padding:'8px 12px', verticalAlign:'middle' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:m.color, flexShrink:0 }}/>
                    {editStaffId === m.id ? (
                      <input value={editName} onChange={e=>setEditName(e.target.value)}
                        onBlur={() => saveStaffName(m.id)}
                        onKeyDown={e => e.key==='Enter' && saveStaffName(m.id)}
                        autoFocus style={{ ...inp, marginBottom:0, padding:'2px 6px', width:72, fontSize:12 }}/>
                    ) : (
                      <span onClick={() => { setEditStaffId(m.id); setEditName(m.name) }}
                        style={{ fontSize:12, fontWeight:600, color:'#2C1810', cursor:'pointer' }}>
                        {m.name}
                      </span>
                    )}
                    <button onClick={() => removeStaff(m.id)}
                      style={{ background:'none', border:'none', color:'#E74C3C', cursor:'pointer', fontSize:13, padding:0, opacity:0.4 }}>×</button>
                  </div>
                  {m.role && <div style={{ fontSize:10, color:'#8B7355', marginLeft:14, marginTop:1 }}>{m.role}</div>}
                </td>
                {DAYS.map((_, di) => {
                  const key      = `${m.id}_${di}`
                  const cellData = shifts[key] || []
                  return (
                    <td key={di} onClick={() => openCell(m.id, di)}
                      style={{ padding:'4px 3px', verticalAlign:'top', cursor:'pointer', background: isToday(di) ? '#FFFBF5' : 'transparent', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background='#FAF7F2'}
                      onMouseLeave={e => e.currentTarget.style.background= isToday(di) ? '#FFFBF5' : 'transparent'}>
                      <div style={{ minHeight:40, display:'flex', flexDirection:'column', gap:2 }}>
                        {cellData.map((sh, si) => (
                          <div key={si} style={{ background: sh.color || m.color, color:'#fff', borderRadius:4,
                            padding:'2px 4px', fontSize:9, fontWeight:600,
                            display:'flex', justifyContent:'space-between', alignItems:'center', gap:2 }}>
                            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {sh.name || ''} {to12(sh.start)}
                            </span>
                            <span onClick={e => { e.stopPropagation(); removeShift(key, si) }}
                              style={{ cursor:'pointer', opacity:0.8, fontSize:11, flexShrink:0 }}>×</span>
                          </div>
                        ))}
                        {cellData.length === 0 && (
                          <div style={{ textAlign:'center', fontSize:16, color:'#EDE0CC', paddingTop:6 }}>+</div>
                        )}
                      </div>
                    </td>
                  )
                })}
                <td style={{ padding:'8px 6px', textAlign:'center', fontSize:12, fontWeight:700, color:'#C8843A', verticalAlign:'middle' }}>
                  {minsToHrs(getHours(m.id))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && (
          <div style={{ textAlign:'center', padding:'32px', color:'#8B7355', fontSize:13 }}>No staff yet — tap below to add</div>
        )}
      </div>

      <button onClick={() => setShowAddStaff(true)}
        style={{ width:'100%', background:'#fff', border:'1.5px dashed #EDE0CC', borderRadius:10, padding:'11px', cursor:'pointer', fontSize:13, color:'#8B7355', fontWeight:500, marginBottom:16 }}>
        + Add Staff Member
      </button>

      {/* Hours Summary */}
      <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:'14px 16px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:10 }}>Hours Summary</div>
        {members.map(m => (
          <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #F5EFE8' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:m.color }}/>
              <span style={{ fontSize:13, color:'#2C1810' }}>{m.name}</span>
              {m.role && <span style={{ fontSize:11, color:'#8B7355' }}>· {m.role}</span>}
            </div>
            <span style={{ fontSize:13, fontWeight:700, color:'#C8843A' }}>{minsToHrs(getHours(m.id))}h</span>
          </div>
        ))}
        <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 0' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#2C1810' }}>Total</span>
          <span style={{ fontSize:14, fontWeight:700, color:'#2C1810' }}>{minsToHrs(totalHrs)}h</span>
        </div>
      </div>
    </div>
  )

  // ── SHARED MODALS ─────────────────────────────────────────
  return (
    <div>
      <TipBanner message="Build the weekly staff schedule. Tap a cell to assign shifts. Use standard presets or set custom times. Share as an image via WhatsApp." />

      <Header />

      {/* Mobile presets bar */}
      {isMobile && presets.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
          {presets.map(p => (
            <div key={p.id} style={{ background:p.color, color:'#fff', borderRadius:16, padding:'4px 10px', fontSize:11, fontWeight:600 }}>
              {p.name} · {to12(p.start)}–{to12(p.end)}
            </div>
          ))}
          <button onClick={() => setShowAddPreset(true)}
            style={{ background:'none', border:'1.5px dashed #EDE0CC', borderRadius:16, padding:'4px 10px', fontSize:11, color:'#8B7355', cursor:'pointer' }}>
            + Add Shift
          </button>
        </div>
      )}

      {isMobile ? <MobileView /> : <DesktopView />}

      {/* Cell Modal — same for both */}
      {modal && member && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:20, width:'100%', maxWidth:400, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#2C1810' }}>{member.name} — {DAYS[modal.dayIdx]}</div>
                <div style={{ fontSize:12, color:'#8B7355' }}>{cellShifts.length} shift{cellShifts.length!==1?'s':''} assigned</div>
              </div>
              <button onClick={() => setModal(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8B7355' }}>×</button>
            </div>
            {cellShifts.length > 0 && (
              <div style={{ marginBottom:16 }}>
                {cellShifts.map((sh, si) => {
                  const mins = timeToMins(sh.end) - timeToMins(sh.start)
                  return (
                    <div key={si} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#FAF7F2', borderRadius:8, padding:'8px 12px', marginBottom:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background: sh.color || member.color }}/>
                        <div>
                          {sh.name && <span style={{ fontSize:12, fontWeight:700, color:'#2C1810' }}>{sh.name} · </span>}
                          <span style={{ fontSize:12, color:'#2C1810' }}>{to12(sh.start)} – {to12(sh.end)}</span>
                          <span style={{ fontSize:11, color:'#8B7355', marginLeft:6 }}>{minsToHrs(mins)}h</span>
                        </div>
                      </div>
                      <button onClick={() => removeShift(modal.key, si)}
                        style={{ background:'#FFEBEE', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:11, color:'#E74C3C', fontWeight:600 }}>
                        Remove
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {presets.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, color:'#8B7355', fontWeight:600, textTransform:'uppercase', marginBottom:8 }}>Standard Shifts</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {presets.map(p => (
                    <button key={p.id} onClick={() => addPresetToCell(p)}
                      style={{ background:p.color, color:'#fff', border:'none', borderRadius:20, padding:'8px 16px', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>
                      {p.name} · {to12(p.start)}–{to12(p.end)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ borderTop:'1px solid #EDE0CC', paddingTop:14 }}>
              <button onClick={() => setShowCustom(c=>!c)}
                style={{ background:'none', border:'1.5px dashed #EDE0CC', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:12, color:'#8B7355', width:'100%', fontFamily:'inherit', marginBottom: showCustom?10:0 }}>
                {showCustom ? '▲ Hide Custom Time' : '+ Custom Time'}
              </button>
              {showCustom && (
                <div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>Start</div>
                      <input type="time" value={shiftForm.start} onChange={e => setShiftForm(f=>({...f,start:e.target.value}))} style={{ ...inp, marginBottom:0 }}/>
                      <div style={{ fontSize:11, color:'#8B7355', marginTop:3 }}>{to12(shiftForm.start)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>End</div>
                      <input type="time" value={shiftForm.end} onChange={e => setShiftForm(f=>({...f,end:e.target.value}))} style={{ ...inp, marginBottom:0 }}/>
                      <div style={{ fontSize:11, color:'#8B7355', marginTop:3 }}>{to12(shiftForm.end)}</div>
                    </div>
                  </div>
                  <button onClick={addCustomShift}
                    style={{ width:'100%', background: member.color, color:'#fff', border:'none', borderRadius:8, padding:'11px', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit' }}>
                    + Add Custom Shift
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {showAddStaff && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:20, width:'100%', maxWidth:360 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#2C1810', marginBottom:14 }}>Add Staff Member</div>
            <input placeholder="Full name" value={newStaff.name} onChange={e=>setNewStaff(s=>({...s,name:e.target.value}))} style={inp}/>
            <input placeholder="Role (e.g. Barista, Lead)" value={newStaff.role} onChange={e=>setNewStaff(s=>({...s,role:e.target.value}))} style={inp}/>
            <div style={{ fontSize:12, color:'#8B7355', marginBottom:6 }}>Colour</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              {COLORS.map(c => (
                <div key={c} onClick={() => setNewStaff(s=>({...s,color:c}))}
                  style={{ width:26, height:26, borderRadius:'50%', background:c, cursor:'pointer',
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

      {/* Snapshot Modal */}
      {snapshotUrl && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:300, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ fontSize:13, color:'#fff', marginBottom:12, fontWeight:600 }}>{weekLabel} — Press and hold to save</div>
          <img src={snapshotUrl} alt="Schedule snapshot" style={{ maxWidth:'100%', maxHeight:'70vh', borderRadius:8, boxShadow:'0 4px 24px rgba(0,0,0,0.4)' }}/>
          <button onClick={() => setSnapshotUrl(null)}
            style={{ marginTop:16, background:'#fff', color:'#2C1810', border:'none', borderRadius:8, padding:'10px 28px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
            Close
          </button>
        </div>
      )}

      {/* Add Preset Modal */}
      {showAddPreset && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:20, width:'100%', maxWidth:360 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#2C1810', marginBottom:14 }}>Add Standard Shift</div>
            <input placeholder="Shift name (e.g. Morning, Close, Mid)" value={newPreset.name}
              onChange={e=>setNewPreset(p=>({...p,name:e.target.value}))} style={inp}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:4 }}>
              <div>
                <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>Start</div>
                <input type="time" value={newPreset.start} onChange={e=>setNewPreset(p=>({...p,start:e.target.value}))} style={{ ...inp, marginBottom:0 }}/>
                <div style={{ fontSize:11, color:'#8B7355', marginTop:3 }}>{to12(newPreset.start)}</div>
              </div>
              <div>
                <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>End</div>
                <input type="time" value={newPreset.end} onChange={e=>setNewPreset(p=>({...p,end:e.target.value}))} style={{ ...inp, marginBottom:0 }}/>
                <div style={{ fontSize:11, color:'#8B7355', marginTop:3 }}>{to12(newPreset.end)}</div>
              </div>
            </div>
            <div style={{ fontSize:12, color:'#8B7355', margin:'10px 0 6px' }}>Colour</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              {COLORS.map(c => (
                <div key={c} onClick={() => setNewPreset(p=>({...p,color:c}))}
                  style={{ width:26, height:26, borderRadius:'50%', background:c, cursor:'pointer',
                    border: newPreset.color===c ? '3px solid #2C1810' : '2px solid transparent' }}/>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={addPreset} style={{ flex:1, background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'11px', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit' }}>Add Shift</button>
              <button onClick={() => setShowAddPreset(false)} style={{ padding:'11px 16px', background:'#888', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
