import { useState, useRef, useEffect } from 'react'
import { SkeletonList } from './Skeleton'
import { collection, addDoc, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import TipBanner from './TipBanner'

const OPENING_ITEMS = [
  'Open the store at the designated time of the day',
  'Disarm the Security - ADT',
  'CLOCK IN to access the store',
  'Check temperature of Walk-in Freezer, Dipping cabinets & cake freezer. Switch ON Freezer Lights',
  'Wear handgloves and check ice cream for ice particles. Remove if found',
  'Switch ON Signage Light, Store Lights, TV Menu and Music',
  'Start cooking Boba. Plan daily Boba cooking schedule for every 4 hours',
  'Drain the Ice Bin & fill with Fresh Ice Cubes (if needed)',
  'Fill up all dry condiments in the back counter',
  'Refill cups, lids, syrups, popping pearls & Falooda condiments (if needed)',
  'Clean the Dessert Freezer and refill all products',
  'Wash Blenders/Shakers/Coffee making jugs and dry on drying rack',
  'Check Tables and Countertop for cleaning',
  'Check all ice cream buckets and refill if required',
  'Clean entry door and all windows — remove smudge marks',
  'Make Vanilla and Chocolate waffle cones (if needed)',
  'Clean and mop the floor, tables and chairs',
  'Fill the scoop holder with water',
  'Clean glasses of Ice cream freezers and Dessert freezers with dry cloth',
  'Clean display freezer and dessert freezers of all smudges and dirt',
  'Clean entire countertop in front and back',
  'Check expiry dates of all products',
  'Clean and dry your hands',
  'Coffee machine checks',
  'Boba shaker machine checks',
  'Store room checks',
  'Bathroom check',
  'Inventory check - dry and wet ingredients',
  'Get ready to serve our customers with a smile',
  'Keep the A-boards outside at start of shift',
]

const CLOSING_ITEMS = [
  'Switch OFF the OPEN Signage and TVs',
  'Count the cash and match with cash sales',
  'Drain the water in scoop holder',
  'Wash all equipment (Blender jars, stirrers, scoop) properly',
  'Clear out counter trash bins for tasting spoons, wash and place on drying racks',
  'Pack garbage from all trash cans and washrooms — place in outside trash bin',
  'Sweep and Mop the Patio',
  'Clean tables, benches and countertops with clean cloth or sponge',
  'Clean walls — wipe any splashes',
  'Clean main entrance glass on both sides',
  'Wash all dishes and place on drying mats',
  'Sweep and mop the interior floor — no stains',
  'Sweep and mop washroom floor — clean and hygienic',
  'Pour bleach with hot water into all sewers (twice a day)',
  'Update the Ice Cream stock board',
  'Coffee machine maintenance using cleaning powder',
  'Boba machine maintenance check',
  'Check store freezer temp — all ingredients sealed and stored',
  'CLOCK OUT the POS machine',
  'ARM the store (ADT Security)',
  'Lock the door carefully — pull and check',
  'Keep the A-board inside the store',
]

const MAX_PHOTO_SIZE = 400
const PHOTO_QUALITY  = 0.5
const MAX_B64_BYTES  = 80000

// Freezer temperature fields (°F). maxOk = highest acceptable reading;
// anything above shows a red warning (industry: storage ≤ 0°F, dipping 6–10°F).
const TEMP_FIELDS = [
  { key:'walkin',  label:'Walk-in Freezer',  maxOk: 0  },
  { key:'dipping', label:'Dipping Cabinets', maxOk: 10 },
  { key:'cake',    label:'Cake Freezer',     maxOk: 0  },
]

function initItems(items) {
  return items.map(label => ({ label, checked: false, remarks: '', photo: null }))
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          let w = img.width, h = img.height
          if (w > h) {
            if (w > MAX_PHOTO_SIZE) { h = Math.round(h * MAX_PHOTO_SIZE / w); w = MAX_PHOTO_SIZE }
          } else {
            if (h > MAX_PHOTO_SIZE) { w = Math.round(w * MAX_PHOTO_SIZE / h); h = MAX_PHOTO_SIZE }
          }
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          let compressed = canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
          if (compressed.length > MAX_B64_BYTES) compressed = canvas.toDataURL('image/jpeg', 0.3)
          if (compressed.length > MAX_B64_BYTES) {
            const c2 = document.createElement('canvas')
            c2.width = Math.round(w * 0.6); c2.height = Math.round(h * 0.6)
            c2.getContext('2d').drawImage(img, 0, 0, c2.width, c2.height)
            compressed = c2.toDataURL('image/jpeg', 0.3)
          }
          resolve(compressed)
        } catch(e) { reject(e) }
      }
      img.onerror = reject
      img.src = ev.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function estimateSize(items) {
  return items.reduce((s, i) => s + (i.photo ? i.photo.length : 0) + (i.remarks?.length || 0) + 100, 0)
}

export default function Checklist({ viewingStore, auth, showToast }) {
  const [view,               setView]               = useState('menu')
  const [type,               setType]               = useState(null)
  const [items,              setItems]              = useState([])
  const [firstName,          setFirstName]          = useState('')
  const [lastName,           setLastName]           = useState('')
  const [submitting,         setSubmitting]         = useState(false)
  const [history,            setHistory]            = useState([])
  const [histType,           setHistType]           = useState('opening')
  const [loadingHist,        setLoadingHist]        = useState(false)
  const [expandedId,         setExpandedId]         = useState(null)
  const [compressing,        setCompressing]        = useState(null)
  const [todayStatus,        setTodayStatus]        = useState({ opening: false, closing: false })
  const [showUncheckedWarn,  setShowUncheckedWarn]  = useState(false)
  const [temps,              setTemps]              = useState({})
  const fileRefs = useRef({})

  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true })

  useEffect(() => { checkTodayStatus() }, [viewingStore])

  async function checkTodayStatus() {
    if (!viewingStore) return
    try {
      const today = now.toLocaleDateString()
      const snap = await getDocs(query(
        collection(db, 'stores', viewingStore, 'checklists'),
        where('date', '==', today)
      ))
      const subs = snap.docs.map(d => d.data())
      setTodayStatus({
        opening: subs.some(s => s.type === 'opening'),
        closing: subs.some(s => s.type === 'closing'),
      })
    } catch(e) { console.error('checkTodayStatus:', e) }
  }

  function startForm(t) {
    setType(t)
    setItems(initItems(t === 'opening' ? OPENING_ITEMS : CLOSING_ITEMS))
    const name = auth?.userConfig?.name || ''
    setFirstName(name.split(' ')[0] || '')
    setLastName(name.split(' ').slice(1).join(' ') || '')
    setShowUncheckedWarn(false)
    setTemps({})
    setView(t)
  }

  function toggle(idx) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item))
  }

  function setRemarks(idx, val) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, remarks: val } : item))
  }

  async function handlePhoto(idx, e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressing(idx)
    try {
      const compressed = await compressPhoto(file)
      setItems(prev => prev.map((item, i) => i === idx ? { ...item, photo: compressed } : item))
    } catch(e) {
      showToast('Could not process photo — try a smaller image')
    }
    setCompressing(null)
    if (fileRefs.current[idx]) fileRefs.current[idx].value = ''
  }

  function removePhoto(idx) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, photo: null } : item))
  }

  async function handleSubmit() {
    if (!firstName.trim()) { showToast('Enter your first name'); return }
    const unchecked = items.filter(i => !i.checked).length
    if (unchecked > 0 && !showUncheckedWarn) {
      setShowUncheckedWarn(true)
      return
    }
    setShowUncheckedWarn(false)
    await submitChecklist()
  }

  async function submitChecklist() {
    const estSize = estimateSize(items)
    if (estSize > 800000) {
      showToast('Too many photos — please remove some and try again')
      return
    }
    setSubmitting(true)
    try {
      const itemsForStorage = items.map(i => ({
        label: i.label, checked: i.checked, remarks: i.remarks, photo: i.photo || null,
      }))
      // Temperatures: store numeric readings + whether any is out of range
      const tempReadings = {}
      let tempAlert = false
      TEMP_FIELDS.forEach(f => {
        const v = temps[f.key]
        if (v !== undefined && v !== '') {
          const num = parseFloat(v)
          if (!isNaN(num)) {
            tempReadings[f.key] = num
            if (num > f.maxOk) tempAlert = true
          }
        }
      })
      const submission = {
        type, storeId: viewingStore,
        firstName: firstName.trim(), lastName: lastName.trim(),
        submittedAt: Date.now(), date: now.toLocaleDateString(), time: timeStr,
        items: itemsForStorage, totalItems: items.length,
        checkedItems: items.filter(i => i.checked).length,
        hasPhotos: items.some(i => i.photo),
        temps: tempReadings, tempAlert,
      }
      let saved = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await addDoc(collection(db, 'stores', viewingStore, 'checklists'), submission)
          saved = true
          break
        } catch(err) {
          if (attempt < 2) await new Promise(r => setTimeout(r, 1500))
          else throw err
        }
      }
      if (saved) {
        showToast(`${type === 'opening' ? 'Opening' : 'Closing'} checklist submitted!`)
        await checkTodayStatus()
        setView('menu')
      }
    } catch(e) {
      if (e.message?.includes('exceeds') || e.message?.includes('size')) {
        showToast('Too many photos — remove some and try again')
      } else if (e.message?.includes('permission') || e.message?.includes('auth')) {
        showToast('Session expired — please refresh and try again')
      } else {
        showToast('Submit failed — check your connection and try again')
      }
    }
    setSubmitting(false)
  }

  async function loadHistory(t) {
    setLoadingHist(true)
    setHistType(t)
    try {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
      const q = query(
        collection(db, 'stores', viewingStore, 'checklists'),
        where('type', '==', t),
        where('submittedAt', '>=', thirtyDaysAgo),
        orderBy('submittedAt', 'desc'),
        limit(30)
      )
      const snap = await getDocs(q)
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {
      showToast('Could not load history — check your connection')
    }
    setLoadingHist(false)
  }

  const completed = items.filter(i => i.checked).length
  const total     = items.length
  const pct       = total ? Math.round((completed / total) * 100) : 0
  const inp       = { padding:'8px 10px', border:'1px solid #E3DDD0', borderRadius:8, fontFamily:'inherit', fontSize:13, background:'#F6F4ED', boxSizing:'border-box', width:'100%' }
  const color     = type === 'opening' ? '#27AE60' : '#E74C3C'

  // ── MENU ──
  if (view === 'menu') {
    return (
      <div>
        <TipBanner message="Complete the opening or closing checklist daily. Your submission is timestamped as proof of completion." />
        <div style={{ fontSize:13, color:'#6B7F78', marginBottom:16 }}>{dateStr}</div>

        {/* Today's status summary */}
        <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, padding:'12px 16px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>
            Today's Status
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{
              flex:1, padding:'8px 12px', borderRadius:8, textAlign:'center',
              background: todayStatus.opening ? '#E8F5E9' : '#FFF3E0',
              border: `1px solid ${todayStatus.opening ? '#81C784' : '#FFB74D'}`,
            }}>
              <div style={{ fontSize:18, marginBottom:2 }}>🌅</div>
              <div style={{ fontSize:12, fontWeight:700, color: todayStatus.opening ? '#2E7D32' : '#E65100' }}>
                {todayStatus.opening ? '✓ Submitted' : 'Not done'}
              </div>
              <div style={{ fontSize:10, color:'#6B7F78' }}>Opening</div>
            </div>
            <div style={{
              flex:1, padding:'8px 12px', borderRadius:8, textAlign:'center',
              background: todayStatus.closing ? '#E8F5E9' : '#F5F5F5',
              border: `1px solid ${todayStatus.closing ? '#81C784' : '#E3DDD0'}`,
            }}>
              <div style={{ fontSize:18, marginBottom:2 }}>🌙</div>
              <div style={{ fontSize:12, fontWeight:700, color: todayStatus.closing ? '#2E7D32' : '#999' }}>
                {todayStatus.closing ? '✓ Submitted' : 'Pending'}
              </div>
              <div style={{ fontSize:10, color:'#6B7F78' }}>Closing</div>
            </div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          <div onClick={() => startForm('opening')}
            style={{ background:'#fff', border:`2px solid ${todayStatus.opening ? '#81C784' : '#27AE60'}`, borderRadius:14, padding:20, cursor:'pointer', textAlign:'center', position:'relative' }}>
            {todayStatus.opening && (
              <div style={{ position:'absolute', top:8, right:8, background:'#27AE60', color:'#fff', borderRadius:20, padding:'1px 8px', fontSize:9, fontWeight:700 }}>
                DONE
              </div>
            )}
            <div style={{ fontSize:32, marginBottom:8 }}>🌅</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#27AE60' }}>Opening</div>
            <div style={{ fontSize:11, color:'#6B7F78', marginTop:4 }}>{OPENING_ITEMS.length} items</div>
          </div>
          <div onClick={() => startForm('closing')}
            style={{ background:'#fff', border:`2px solid ${todayStatus.closing ? '#81C784' : '#E74C3C'}`, borderRadius:14, padding:20, cursor:'pointer', textAlign:'center', position:'relative' }}>
            {todayStatus.closing && (
              <div style={{ position:'absolute', top:8, right:8, background:'#27AE60', color:'#fff', borderRadius:20, padding:'1px 8px', fontSize:9, fontWeight:700 }}>
                DONE
              </div>
            )}
            <div style={{ fontSize:32, marginBottom:8 }}>🌙</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#E74C3C' }}>Closing</div>
            <div style={{ fontSize:11, color:'#6B7F78', marginTop:4 }}>{CLOSING_ITEMS.length} items</div>
          </div>
        </div>

        <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:10 }}>History (Last 30 days)</div>
          <div style={{ display:'flex', gap:8 }}>
            {['opening','closing'].map(t => (
              <button key={t} onClick={() => { setView('history'); loadHistory(t) }}
                style={{ flex:1, padding:'10px', border:'1px solid #E3DDD0', borderRadius:8, cursor:'pointer', fontSize:12,
                  background: t==='opening' ? '#E8F5E9' : '#FFEBEE',
                  color: t==='opening' ? '#27AE60' : '#E74C3C', fontWeight:600, fontFamily:'inherit' }}>
                {t === 'opening' ? '🌅 Opening History' : '🌙 Closing History'}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── HISTORY ──
  if (view === 'history') {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <button onClick={() => setView('menu')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#6B7F78', fontFamily:'inherit' }}>← Back</button>
          <div style={{ fontSize:15, fontWeight:700, color:'#1A4C48', textTransform:'capitalize' }}>{histType} History</div>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {['opening','closing'].map(t => (
            <button key={t} onClick={() => loadHistory(t)}
              style={{ padding:'7px 16px', borderRadius:20, border:'1px solid #E3DDD0', cursor:'pointer', fontSize:12, fontFamily:'inherit',
                background: histType===t ? '#1A4C48' : '#fff', color: histType===t ? '#fff' : '#6B7F78' }}>
              {t === 'opening' ? '🌅 Opening' : '🌙 Closing'}
            </button>
          ))}
        </div>
        {loadingHist ? (
          <SkeletonList count={4} lines={1} />
        ) : history.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'#6B7F78', fontSize:13 }}>No submissions in last 30 days</div>
        ) : history.map(h => (
          <div key={h.id} style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, marginBottom:10, overflow:'hidden' }}>
            <div onClick={() => setExpandedId(expandedId===h.id ? null : h.id)}
              style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', cursor:'pointer' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#1A4C48' }}>
                  {h.date} · {h.time}
                  {h.tempAlert && <span style={{ marginLeft:6, fontSize:9, fontWeight:700, color:'#fff', background:'#C53D18', borderRadius:4, padding:'2px 6px' }}>TEMP ⚠</span>}
                </div>
                <div style={{ fontSize:11, color:'#6B7F78' }}>{h.firstName} {h.lastName}{h.hasPhotos ? ' · 📷' : ''}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ fontSize:12, fontWeight:700, color: h.checkedItems===h.totalItems ? '#27AE60' : '#E67E22' }}>
                  {h.checkedItems}/{h.totalItems}
                </div>
                <span style={{ fontSize:12, color:'#6B7F78' }}>{expandedId===h.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {expandedId === h.id && (
              <div style={{ borderTop:'1px solid #E3DDD0', padding:'10px 16px' }}>
                {h.temps && Object.keys(h.temps).length > 0 && (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', paddingBottom:8, marginBottom:8, borderBottom:'1px solid #EFEBE0' }}>
                    {TEMP_FIELDS.filter(f => h.temps[f.key] !== undefined).map(f => {
                      const bad = h.temps[f.key] > f.maxOk
                      return (
                        <span key={f.key} style={{ fontSize:11, fontWeight:600, borderRadius:6, padding:'3px 8px',
                          background: bad ? '#FFEBEE' : '#E8F5E9', color: bad ? '#C53D18' : '#2E7D32' }}>
                          🌡 {f.label}: {h.temps[f.key]}°F{bad ? ' ⚠' : ''}
                        </span>
                      )
                    })}
                  </div>
                )}
                {h.items?.map((item, i) => (
                  <div key={i} style={{ padding:'6px 0', borderBottom:'1px solid #EFEBE0' }}>
                    <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                      <div style={{ width:16, height:16, borderRadius:4, background: item.checked ? '#27AE60' : '#E3DDD0',
                        flexShrink:0, marginTop:2, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {item.checked && <span style={{ color:'#fff', fontSize:9 }}>✓</span>}
                      </div>
                      <span style={{ fontSize:11, color: item.checked ? '#1A4C48' : '#6B7F78' }}>{item.label}</span>
                    </div>
                    {item.remarks && <div style={{ fontSize:10, color:'#C1683C', marginTop:2, marginLeft:24 }}>📝 {item.remarks}</div>}
                    {item.photo && <img src={item.photo} alt="photo" style={{ marginTop:4, marginLeft:24, maxWidth:120, borderRadius:6 }}/>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  // ── FORM ──
  return (
    <div>
      {/* Sticky progress header */}
      <div style={{
        position:'sticky', top:52, zIndex:50, marginBottom:12,
        background: color, borderRadius:10,
        padding:'10px 14px', boxShadow:'0 2px 10px rgba(0,0,0,0.2)',
        display:'flex', justifyContent:'space-between', alignItems:'center',
      }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
            {type === 'opening' ? '🌅 Opening' : '🌙 Closing'} · {completed}/{total}
          </div>
          <div style={{ background:'rgba(255,255,255,0.3)', borderRadius:4, height:5, marginTop:5, width:140 }}>
            <div style={{ background:'#fff', borderRadius:4, height:5, width:`${pct}%`, transition:'width 0.3s' }}/>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={() => setView('menu')} style={{ background:'rgba(255,255,255,0.2)', color:'#fff', border:'none', borderRadius:8, padding:'7px 12px', cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
            ← Back
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ background:'#fff', color, border:'none', borderRadius:8, padding:'7px 14px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', opacity: submitting ? 0.7 : 1 }}>
            {submitting ? 'Saving…' : 'Submit ↑'}
          </button>
        </div>
      </div>

      {/* Date + Staff name */}
      <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
        <div style={{ fontSize:11, color:'#6B7F78', marginBottom:8 }}>{dateStr} · {timeStr}</div>
        <div style={{ fontSize:12, fontWeight:600, color:'#1A4C48', marginBottom:8 }}>Submitted by</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <input placeholder="First Name *" value={firstName} onChange={e => setFirstName(e.target.value)} style={inp}/>
          <input placeholder="Last Name"    value={lastName}  onChange={e => setLastName(e.target.value)}  style={inp}/>
        </div>
      </div>

      {/* Freezer temperatures — record actual readings, flag out-of-range */}
      <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#1A4C48', marginBottom:2 }}>🌡 Freezer Temperatures (°F)</div>
        <div style={{ fontSize:10, color:'#6B7F78', marginBottom:10 }}>
          Record the display readings. Freezers should be at or below 0°F, dipping cabinets 6–10°F.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
          {TEMP_FIELDS.map(f => {
            const val   = temps[f.key] ?? ''
            const num   = parseFloat(val)
            const isBad = val !== '' && !isNaN(num) && num > f.maxOk
            return (
              <div key={f.key}>
                <div style={{ fontSize:10, fontWeight:600, color: isBad ? '#C53D18' : '#6B7F78', marginBottom:4 }}>{f.label}</div>
                <input type="number" step="0.5" placeholder="°F" value={val}
                  onChange={e => setTemps(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{ ...inp, marginBottom:0, textAlign:'center', fontWeight:700,
                    border: isBad ? '2px solid #C53D18' : '1px solid #E3DDD0',
                    background: isBad ? '#FFF5F2' : '#F6F4ED',
                    color: isBad ? '#C53D18' : '#1A4C48' }}/>
                {isBad && <div style={{ fontSize:9, color:'#C53D18', fontWeight:700, marginTop:3 }}>⚠ Above {f.maxOk}°F — check unit!</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Unchecked warning (replaces window.confirm) */}
      {showUncheckedWarn && (
        <div style={{ background:'#FFF3E0', border:'1px solid #FFB74D', borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#E65100', marginBottom:4 }}>
            ⚠ {items.filter(i => !i.checked).length} items not checked
          </div>
          <div style={{ fontSize:12, color:'#6B7F78', marginBottom:12 }}>
            Some checklist items are still unchecked. Submit anyway?
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={submitChecklist}
              style={{ flex:1, background:'#E65100', color:'#fff', border:'none', borderRadius:8, padding:'10px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit' }}>
              Submit Anyway
            </button>
            <button onClick={() => setShowUncheckedWarn(false)}
              style={{ padding:'10px 16px', background:'#fff', border:'1px solid #E3DDD0', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'inherit', color:'#6B7F78' }}>
              Keep Checking
            </button>
          </div>
        </div>
      )}

      {/* Items */}
      <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ borderBottom: idx < items.length-1 ? '1px solid #EFEBE0' : 'none' }}>
            <div onClick={() => toggle(idx)}
              style={{ display:'flex', gap:12, padding:'13px 16px', cursor:'pointer', alignItems:'flex-start',
                background: item.checked ? (type==='opening' ? '#F0FFF4' : '#FFF5F5') : '#fff', transition:'background 0.15s' }}>
              <div style={{ width:26, height:26, borderRadius:7, border:`2px solid ${item.checked ? color : '#E3DDD0'}`,
                background: item.checked ? color : '#fff', flexShrink:0, marginTop:1,
                display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                {item.checked && <span style={{ color:'#fff', fontSize:14, fontWeight:700 }}>✓</span>}
              </div>
              <span style={{ fontSize:13, color: item.checked ? '#1A4C48' : '#555', lineHeight:1.5 }}>
                {item.label}
              </span>
            </div>

            {item.checked && (
              <div style={{ paddingLeft:54, paddingRight:16, paddingBottom:12, background: type==='opening' ? '#F0FFF4' : '#FFF5F5' }}
                onClick={e => e.stopPropagation()}>
                <input placeholder="Remarks (optional)" value={item.remarks}
                  onChange={e => setRemarks(idx, e.target.value)}
                  style={{ ...inp, fontSize:11, padding:'6px 8px', marginBottom:8 }}/>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {compressing === idx ? (
                    <span style={{ fontSize:11, color:'#6B7F78' }}>Compressing…</span>
                  ) : item.photo ? (
                    <>
                      <img src={item.photo} alt="attached" style={{ width:64, height:64, objectFit:'cover', borderRadius:8, border:'1px solid #E3DDD0' }}/>
                      <button onClick={() => removePhoto(idx)}
                        style={{ background:'#FFEBEE', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:12, color:'#E74C3C', fontWeight:600, fontFamily:'inherit' }}>
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <input type="file" accept="image/*" capture="environment"
                        ref={el => fileRefs.current[idx] = el}
                        onChange={e => handlePhoto(idx, e)}
                        style={{ display:'none' }}/>
                      <button onClick={() => fileRefs.current[idx]?.click()}
                        style={{ background:'#fff', border:'1.5px dashed #C1683C', borderRadius:8, padding:'7px 16px',
                          cursor:'pointer', fontSize:12, color:'#C1683C', fontFamily:'inherit', fontWeight:600 }}>
                        📷 Add Photo
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom submit (visible without scrolling on desktop) */}
      <button onClick={handleSubmit} disabled={submitting}
        style={{ width:'100%', background: submitting ? '#aaa' : color, color:'#fff', border:'none',
          borderRadius:12, padding:'15px', cursor:'pointer', fontSize:15, fontWeight:700,
          fontFamily:'inherit', marginBottom:8 }}>
        {submitting ? 'Submitting…' : `Submit ${type === 'opening' ? 'Opening' : 'Closing'} Checklist (${completed}/${total})`}
      </button>
      <div style={{ fontSize:11, color:'#6B7F78', textAlign:'center', marginBottom:24 }}>
        Photos are compressed automatically for faster upload
      </div>
    </div>
  )
}
