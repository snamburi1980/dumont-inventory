import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

const DAYS     = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const COLORS   = ['#E74C3C','#E67E22','#F39C12','#27AE60','#2980B9','#8E44AD','#16A085','#C0392B']

function getWeekStart(offset = 0) {
  const d   = new Date(); d.setHours(0,0,0,0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff + offset * 7)
  return d
}

function getDateStr(d) {
  return d.toISOString().split('T')[0]
}

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`
}

export default function Schedule({ viewingStore, showToast, auth }) {
  const [offset,     setOffset]     = useState(0)
  const [staff,      setStaff]      = useState([])
  const [shifts,     setShifts]     = useState([])
  const [shiftTypes, setShiftTypes] = useState([])
  const [modal,      setModal]      = useState(null) // null | 'addStaff' | 'addShiftType' | {staffId, date}
  const [hrsPeriod,  setHrsPeriod]  = useState('week')
  const [newStaff,   setNewStaff]   = useState({ name:'', role:'', color: COLORS[0] })
  const [newST,      setNewST]      = useState({ name:'', start:'09:00', end:'17:00', color: COLORS[2] })
  const isManager = auth.isManager()

  useEffect(() => { loadSchedule() }, [viewingStore])

  async function loadSchedule() {
    try {
      const snap = await getDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'))
      if (snap.exists()) {
        const d = snap.data()
        setStaff(d.staff || [])
        setShifts(d.shifts || [])
        setShiftTypes(d.shiftTypes || [])
      }
    } catch(e) {}
  }

  async function save(newStaff_, newShifts_, newShiftTypes_) {
    const s  = newStaff_      ?? staff
    const sh = newShifts_     ?? shifts
    const st = newShiftTypes_ ?? shiftTypes
    await setDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'), {
      staff: s, shifts: sh, shiftTypes: st
    }, { merge: true })
  }

  async function addStaff() {
    if (!newStaff.name.trim()) return
    const member = { id: 'staff_' + Date.now(), ...newStaff }
    const updated = [...staff, member]
    setStaff(updated)
    await save(updated, null, null)
    setNewStaff({ name:'', role:'', color: COLORS[0] })
    setModal(null)
    showToast(' Staff added')
  }

  async function removeStaff(id) {
    const updated = staff.filter(s => s.id !== id)
    setStaff(updated)
    await save(updated, null, null)
  }

  async function updateStaff(id, field, value) {
    const updated = staff.map(s => s.id === id ? { ...s, [field]: value } : s)
    setStaff(updated)
    await save(updated, null, null)
  }

  async function addShiftType() {
    if (!newST.name.trim()) return
    const st = { id: 'st_' + Date.now(), ...newST }
    const updated = [...shiftTypes, st]
    setShiftTypes(updated)
    await save(null, null, updated)
    setNewST({ name:'', start:'09:00', end:'17:00', color: COLORS[2] })
    setModal(null)
    showToast(' Shift type added')
  }

  async function assignShift(staffId, date, shiftTypeId) {
    // Remove existing shift for this staff+date
    const filtered = shifts.filter(s => !(s.staffId === staffId && s.date === date))
    const updated  = [...filtered, { id: 'shift_'+Date.now(), staffId, date, shiftTypeId }]
    setShifts(updated)
    await save(null, updated, null)
    setModal(null)
  }

  async function removeShift(staffId, date) {
    const updated = shifts.filter(s => !(s.staffId === staffId && s.date === date))
    setShifts(updated)
    await save(null, updated, null)
  }

  const ws   = getWeekStart(offset)
  const days = Array.from({length:7}, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate()+i); return d })
  const today = new Date(); today.setHours(0,0,0,0)

  const weekLabel = `${days[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${days[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`

  function shiftHours(st) {
    const [sh,sm] = st.start.split(':').map(Number)
    const [eh,em] = st.end.split(':').map(Number)
    return ((eh*60+em) - (sh*60+sm)) / 60
  }

  const totalShiftsThisWeek = days.reduce((total, d) => {
    const ds = getDateStr(d)
    return total + shifts.filter(s => s.date === ds).length
  }, 0)

  return (
    <div>
      {/* Header controls */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          
          <button className="btn-adj" onClick={() => setOffset(o => o-1)}>{'<'}</button>
          <span style={{fontSize:13,fontWeight:600,color:'var(--dark)',minWidth:200,textAlign:'center'}}>{weekLabel}</span>
          <button className="btn-adj" onClick={() => setOffset(o => o+1)}>{'>'}</button>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button className="cat-btn" onClick={() => setModal('shiftTypes')}> Shifts</button>
          <button className="cat-btn" onClick={() => setModal('addStaff')}>👥 Staff</button>
        </div>
      </div>

      {/* Shift type legend */}
      {shiftTypes.length > 0 && (
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
          {shiftTypes.map(st => (
            <span key={st.id} style={{
              fontSize:11,padding:'3px 10px',borderRadius:20,
              background: st.color+'22', border:`1px solid ${st.color}`, color: st.color
            }}>
              {st.name} {fmt12(st.start)}–{fmt12(st.end)}
            </span>
          ))}
        </div>
      )}

      {/* Schedule grid - scrollable */}
      <div style={{overflowX:'auto',marginBottom:12}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
          <thead>
            <tr>
              <th style={{padding:'8px 12px',textAlign:'left',fontSize:11,color:'var(--text-muted)',background:'var(--cream)',minWidth:100}}>Staff</th>
              {days.map((d,i) => {
                const isToday = d.getTime() === today.getTime()
                return (
                  <th key={i} style={{
                    padding:'8px 4px',textAlign:'center',fontSize:11,
                    background: isToday ? 'rgba(200,132,58,0.1)' : 'var(--cream)',
                    color: isToday ? 'var(--caramel)' : 'var(--text-muted)',
                    minWidth:80
                  }}>
                    <div style={{fontWeight:600}}>{DAYS[i]}</div>
                    <div>{d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                  </th>
                )
              })}
              <th style={{padding:'8px 4px',textAlign:'center',fontSize:11,color:'var(--text-muted)',minWidth:40}}>Hrs</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={9} style={{textAlign:'center',padding:32,color:'var(--text-muted)',fontSize:13}}>
                  No staff added yet — tap 👥 Staff to add
                </td>
              </tr>
            ) : staff.map((member, si) => {
              let totalHrs = 0
              return (
                <tr key={member.id} style={{background: si%2===0 ? '#fff' : 'var(--cream)'}}>
                  <td style={{padding:'8px 12px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:member.color,flexShrink:0}} />
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:'var(--dark)'}}>{member.name}</div>
                        <div style={{fontSize:10,color:'var(--text-muted)'}}>{member.role}</div>
                      </div>
                    </div>
                  </td>
                  {days.map((d, di) => {
                    const ds        = getDateStr(d)
                    const dayShift  = shifts.find(s => s.staffId === member.id && s.date === ds)
                    const st        = dayShift ? shiftTypes.find(t => t.id === dayShift.shiftTypeId) : null
                    const isToday   = d.getTime() === today.getTime()
                    if (st) totalHrs += shiftHours(st)

                    return (
                      <td key={di} style={{
                        padding:4, textAlign:'center',
                        background: isToday ? 'rgba(200,132,58,0.05)' : 'transparent'
                      }}>
                        {st ? (
                          <div
                            onClick={() => isManager && removeShift(member.id, ds)}
                            style={{
                              background: st.color+'22', border:`1.5px solid ${st.color}`,
                              color: st.color, borderRadius:8, padding:'4px 6px',
                              fontSize:10, cursor: isManager ? 'pointer' : 'default',
                              position:'relative'
                            }}
                            title="Click to remove"
                          >
                            <div style={{fontWeight:600}}>{st.name}</div>
                            <div style={{fontSize:9}}>{fmt12(st.start)}–{fmt12(st.end)}</div>
                          </div>
                        ) : isManager ? (
                          <div
                            onClick={() => setModal({ staffId: member.id, date: ds })}
                            style={{fontSize:18,color:'#DDD',lineHeight:'40px',cursor:'pointer'}}
                          >
                            +
                          </div>
                        ) : null}
                      </td>
                    )
                  })}
                  <td style={{textAlign:'center',fontSize:12,fontWeight:700,color:'var(--caramel)'}}>
                    {totalHrs > 0 ? `${totalHrs}h` : ''}
                  </td>
                </tr>
              )
            })}
            {/* Staff per day row */}
            <tr style={{background:'var(--cream)'}}>
              <td style={{padding:'6px 12px',fontSize:10,color:'var(--text-muted)',fontWeight:600}}>STAFF/DAY</td>
              {days.map((d,i) => {
                const ds    = getDateStr(d)
                const count = shifts.filter(s => s.date === ds).length
                return (
                  <td key={i} style={{textAlign:'center',fontSize:12,fontWeight:600,color:'var(--dark)',padding:6}}>
                    {count || ''}
                  </td>
                )
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{fontSize:12,color:'var(--text-muted)',textAlign:'right',marginBottom:16}}>
        {totalShiftsThisWeek} shifts this week
      </div>

      {/* Hours Summary */}
      {staff.length > 0 && (
        <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:'var(--dark)'}}>Hours Summary</div>
            <div style={{display:'flex',gap:6}}>
              <button
                className={`cat-btn ${hrsPeriod==='week'?'active':''}`}
                onClick={() => setHrsPeriod('week')}
                style={{padding:'4px 12px',fontSize:11}}
              >This Week</button>
              <button
                className={`cat-btn ${hrsPeriod==='month'?'active':''}`}
                onClick={() => setHrsPeriod('month')}
                style={{padding:'4px 12px',fontSize:11}}
              >This Month</button>
            </div>
          </div>
          {staff.map(member => {
            const memberShifts = shifts.filter(s => {
              const ws2 = getWeekStart(offset)
              let startDate, endDate
              if (hrsPeriod === 'week') {
                startDate = ws2
                endDate   = new Date(ws2); endDate.setDate(ws2.getDate()+6)
              } else {
                startDate = new Date(ws2.getFullYear(), ws2.getMonth(), 1)
                endDate   = new Date(ws2.getFullYear(), ws2.getMonth()+1, 0)
              }
              return s.staffId === member.id &&
                new Date(s.date) >= startDate &&
                new Date(s.date) <= endDate
            })
            const totalHrs = memberShifts.reduce((sum, s) => {
              const st = shiftTypes.find(t => t.id === s.shiftTypeId)
              if (!st) return sum
              const [sh,sm] = st.start.split(':').map(Number)
              const [eh,em] = st.end.split(':').map(Number)
              return sum + ((eh*60+em) - (sh*60+sm)) / 60
            }, 0)
            if (totalHrs === 0) return null
            const maxHrs = 40
            const pct = Math.min(100, (totalHrs / maxHrs) * 100)
            return (
              <div key={member.id} style={{marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:member.color}}/>
                    <span style={{fontSize:12,fontWeight:600,color:'var(--dark)'}}>{member.name}</span>
                    <span style={{fontSize:11,color:'var(--text-muted)'}}>{member.role}</span>
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--caramel)'}}>{totalHrs}h</span>
                </div>
                <div style={{background:'var(--border)',borderRadius:4,height:6}}>
                  <div style={{background:member.color,height:6,borderRadius:4,width:`${pct}%`,transition:'width 0.3s'}}/>
                </div>
              </div>
            )
          }).filter(Boolean)}
          {/* Total */}
          <div style={{borderTop:'1px solid var(--border)',paddingTop:10,marginTop:4,display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:12,fontWeight:700,color:'var(--dark)'}}>Total Staff Hours</span>
            <span style={{fontSize:14,fontWeight:700,color:'var(--caramel)'}}>
              {staff.reduce((total, member) => {
                const memberShifts = shifts.filter(s => {
                  const ws2 = getWeekStart(offset)
                  let startDate, endDate
                  if (hrsPeriod === 'week') {
                    startDate = ws2
                    endDate   = new Date(ws2); endDate.setDate(ws2.getDate()+6)
                  } else {
                    startDate = new Date(ws2.getFullYear(), ws2.getMonth(), 1)
                    endDate   = new Date(ws2.getFullYear(), ws2.getMonth()+1, 0)
                  }
                  return s.staffId === member.id &&
                    new Date(s.date) >= startDate &&
                    new Date(s.date) <= endDate
                })
                return total + memberShifts.reduce((sum, s) => {
                  const st = shiftTypes.find(t => t.id === s.shiftTypeId)
                  if (!st) return sum
                  const [sh,sm] = st.start.split(':').map(Number)
                  const [eh,em] = st.end.split(':').map(Number)
                  return sum + ((eh*60+em) - (sh*60+sm)) / 60
                }, 0)
              }, 0)}h
            </span>
          </div>
        </div>
      )}

      {/* ── Modals ── */}

      {/* Assign shift modal */}
      {modal && modal.staffId && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{fontSize:15,fontWeight:700,color:'var(--dark)',marginBottom:16}}>
              Select Shift — {staff.find(s=>s.id===modal.staffId)?.name}
            </div>
            {shiftTypes.length === 0 ? (
              <div style={{textAlign:'center',color:'var(--text-muted)',padding:20}}>
                No shift types yet — add them first
              </div>
            ) : shiftTypes.map(st => (
              <div
                key={st.id}
                onClick={() => assignShift(modal.staffId, modal.date, st.id)}
                style={{
                  display:'flex',alignItems:'center',gap:12,padding:14,
                  borderRadius:10,marginBottom:8,cursor:'pointer',
                  background: st.color+'22', border:`1.5px solid ${st.color}`
                }}
              >
                <div style={{width:12,height:12,borderRadius:'50%',background:st.color}} />
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:st.color}}>{st.name}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{fmt12(st.start)} – {fmt12(st.end)}</div>
                </div>
              </div>
            ))}
            <button className="btn-primary" style={{marginTop:8,background:'#888'}} onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add staff modal */}
      {modal === 'addStaff' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{fontSize:15,fontWeight:700,color:'var(--dark)',marginBottom:16}}>Manage Staff</div>

            {/* Existing staff */}
            {staff.map(s => (
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px',background:'var(--cream)',borderRadius:8,marginBottom:6}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:s.color,flexShrink:0}} />
                <div style={{flex:1}}>
                  <input
                    defaultValue={s.name}
                    onBlur={e => updateStaff(s.id,'name',e.target.value)}
                    style={{fontWeight:600,fontSize:13,border:'none',background:'transparent',width:'100%',outline:'none'}}
                  />
                  <input
                    defaultValue={s.role}
                    placeholder="Role"
                    onBlur={e => updateStaff(s.id,'role',e.target.value)}
                    style={{fontSize:11,color:'var(--text-muted)',border:'none',background:'transparent',width:'100%',outline:'none'}}
                  />
                </div>
                <button onClick={() => removeStaff(s.id)} style={{background:'none',border:'none',color:'var(--red-alert)',cursor:'pointer',fontSize:18}}>×</button>
              </div>
            ))}

            <div style={{borderTop:'1px solid var(--border)',paddingTop:14,marginTop:8}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--dark)',marginBottom:8}}>Add New</div>
              <input placeholder="Name" value={newStaff.name} onChange={e => setNewStaff(f=>({...f,name:e.target.value}))} style={{marginBottom:8}} />
              <input placeholder="Role (e.g. Front Crew)" value={newStaff.role} onChange={e => setNewStaff(f=>({...f,role:e.target.value}))} style={{marginBottom:8}} />
              <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
                {COLORS.map(c => (
                  <div key={c} onClick={() => setNewStaff(f=>({...f,color:c}))}
                    style={{width:24,height:24,borderRadius:'50%',background:c,cursor:'pointer',
                      border: newStaff.color===c ? '3px solid var(--dark)' : '2px solid transparent'}} />
                ))}
              </div>
              <button className="btn-primary" onClick={addStaff}>+ Add Staff</button>
            </div>
          </div>
        </div>
      )}

      {/* Shift types modal */}
      {modal === 'shiftTypes' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{fontSize:15,fontWeight:700,color:'var(--dark)',marginBottom:16}}>Manage Shift Types</div>

            {shiftTypes.map(st => (
              <div key={st.id} style={{display:'flex',alignItems:'center',gap:8,padding:10,background:st.color+'22',border:`1px solid ${st.color}`,borderRadius:8,marginBottom:6}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:st.color}}>{st.name}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{fmt12(st.start)} – {fmt12(st.end)}</div>
                </div>
                <button
                  onClick={async () => {
                    const updated = shiftTypes.filter(t => t.id !== st.id)
                    setShiftTypes(updated)
                    await save(null, null, updated)
                  }}
                  style={{background:'none',border:'none',color:'var(--red-alert)',cursor:'pointer',fontSize:18}}
                >×</button>
              </div>
            ))}

            <div style={{borderTop:'1px solid var(--border)',paddingTop:14,marginTop:8}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--dark)',marginBottom:8}}>Add Shift Type</div>
              <input placeholder="Name (e.g. Shift 1)" value={newST.name} onChange={e => setNewST(f=>({...f,name:e.target.value}))} style={{marginBottom:8}} />
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                <div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>Start</div>
                  <input type="time" value={newST.start} onChange={e => setNewST(f=>({...f,start:e.target.value}))} />
                </div>
                <div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>End</div>
                  <input type="time" value={newST.end} onChange={e => setNewST(f=>({...f,end:e.target.value}))} />
                </div>
              </div>
              <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
                {COLORS.map(c => (
                  <div key={c} onClick={() => setNewST(f=>({...f,color:c}))}
                    style={{width:24,height:24,borderRadius:'50%',background:c,cursor:'pointer',
                      border: newST.color===c ? '3px solid var(--dark)' : '2px solid transparent'}} />
                ))}
              </div>
              <button className="btn-primary" onClick={addShiftType}>+ Add Shift Type</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
