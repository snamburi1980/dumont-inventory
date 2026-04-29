import { useState, useRef } from 'react'
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

const MAX_PHOTO_SIZE = 400   // max width/height in pixels
const PHOTO_QUALITY  = 0.5   // jpeg quality
const MAX_B64_BYTES  = 80000 // ~80KB per photo max

function initItems(items) {
  return items.map(label => ({ label, checked: false, remarks: '', photo: null }))
}

// Aggressive compression for iPhone/Android photos
function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          let w = img.width, h = img.height

          // Scale down to MAX_PHOTO_SIZE
          if (w > h) {
            if (w > MAX_PHOTO_SIZE) { h = Math.round(h * MAX_PHOTO_SIZE / w); w = MAX_PHOTO_SIZE }
          } else {
            if (h > MAX_PHOTO_SIZE) { w = Math.round(w * MAX_PHOTO_SIZE / h); h = MAX_PHOTO_SIZE }
          }

          canvas.width  = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)

          // Try quality 0.5 first
          let compressed = canvas.toDataURL('image/jpeg', PHOTO_QUALITY)

          // If still too large, reduce quality further
          if (compressed.length > MAX_B64_BYTES) {
            compressed = canvas.toDataURL('image/jpeg', 0.3)
          }

          // If still too large, reduce dimensions further
          if (compressed.length > MAX_B64_BYTES) {
            const canvas2 = document.createElement('canvas')
            canvas2.width  = Math.round(w * 0.6)
            canvas2.height = Math.round(h * 0.6)
            canvas2.getContext('2d').drawImage(img, 0, 0, canvas2.width, canvas2.height)
            compressed = canvas2.toDataURL('image/jpeg', 0.3)
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

// Estimate total document size
function estimateSize(items) {
  return items.reduce((s, i) => s + (i.photo ? i.photo.length : 0) + (i.remarks?.length || 0) + 100, 0)
}

export default function Checklist({ viewingStore, auth, showToast }) {
  const [view,        setView]        = useState('menu')
  const [type,        setType]        = useState(null)
  const [items,       setItems]       = useState([])
  const [firstName,   setFirstName]   = useState('')
  const [lastName,    setLastName]    = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [history,     setHistory]     = useState([])
  const [histType,    setHistType]    = useState('opening')
  const [loadingHist, setLoadingHist] = useState(false)
  const [expandedId,  setExpandedId]  = useState(null)
  const [compressing, setCompressing] = useState(null) // idx of item being compressed
  const fileRefs = useRef({})

  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true })

  function startForm(t) {
    setType(t)
    setItems(initItems(t === 'opening' ? OPENING_ITEMS : CLOSING_ITEMS))
    const name = auth?.userConfig?.name || ''
    setFirstName(name.split(' ')[0] || '')
    setLastName(name.split(' ').slice(1).join(' ') || '')
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
      // Warn if still large
      const kb = Math.round(compressed.length * 0.75 / 1024)
      if (kb > 100) console.warn(`Photo for item ${idx} is ${kb}KB after compression`)
      setItems(prev => prev.map((item, i) => i === idx ? { ...item, photo: compressed } : item))
    } catch(e) {
      console.error('Photo compression failed:', e)
      showToast('Could not process photo — try a smaller image')
    }
    setCompressing(null)
    // Reset file input
    if (fileRefs.current[idx]) fileRefs.current[idx].value = ''
  }

  function removePhoto(idx) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, photo: null } : item))
  }

  async function handleSubmit() {
    if (!firstName.trim()) { showToast('Enter your first name'); return }

    const unchecked = items.filter(i => !i.checked).length
    if (unchecked > 0) {
      if (!window.confirm(`${unchecked} item${unchecked > 1 ? 's' : ''} not checked. Submit anyway?`)) return
    }

    // Check estimated size — Firestore limit is 1MB per document
    const estSize = estimateSize(items)
    if (estSize > 800000) {
      showToast('Too many photos — please remove some photos and try again')
      return
    }

    setSubmitting(true)
    try {
      const itemsForStorage = items.map(i => ({
        label:   i.label,
        checked: i.checked,
        remarks: i.remarks,
        photo:   i.photo || null,
      }))

      const submission = {
        type,
        storeId:      viewingStore,
        firstName:    firstName.trim(),
        lastName:     lastName.trim(),
        submittedAt:  Date.now(),
        date:         now.toLocaleDateString(),
        time:         timeStr,
        items:        itemsForStorage,
        totalItems:   items.length,
        checkedItems: items.filter(i => i.checked).length,
        hasPhotos:    items.some(i => i.photo),
      }

      // Retry up to 2 times on failure
      let saved = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await addDoc(collection(db, 'stores', viewingStore, 'checklists'), submission)
          saved = true
          break
        } catch(err) {
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1500))
          } else {
            throw err
          }
        }
      }

      if (saved) {
        showToast(`${type === 'opening' ? 'Opening' : 'Closing'} checklist submitted!`)
        setView('menu')
      }
    } catch(e) {
      console.error('Submit error:', e)
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
      console.error('Load history error:', e)
      showToast('Could not load history — check your connection')
    }
    setLoadingHist(false)
  }

  const completed = items.filter(i => i.checked).length
  const total     = items.length
  const pct       = total ? Math.round((completed / total) * 100) : 0
  const inp       = { padding:'8px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, background:'#FDF6EC', boxSizing:'border-box', width:'100%' }
  const color     = type === 'opening' ? '#27AE60' : '#E74C3C'

  // ── MENU ──
  if (view === 'menu') {
    return (
      <div>
        <TipBanner message="Complete the opening or closing checklist daily. Your submission is timestamped as proof of completion. View history for the last 30 days." />
        <div style={{ fontSize:13, color:'#8B7355', marginBottom:16 }}>{dateStr}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          <div onClick={() => startForm('opening')}
            style={{ background:'#fff', border:'2px solid #27AE60', borderRadius:14, padding:20, cursor:'pointer', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🌅</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#27AE60' }}>Opening</div>
            <div style={{ fontSize:11, color:'#8B7355', marginTop:4 }}>{OPENING_ITEMS.length} items</div>
          </div>
          <div onClick={() => startForm('closing')}
            style={{ background:'#fff', border:'2px solid #E74C3C', borderRadius:14, padding:20, cursor:'pointer', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🌙</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#E74C3C' }}>Closing</div>
            <div style={{ fontSize:11, color:'#8B7355', marginTop:4 }}>{CLOSING_ITEMS.length} items</div>
          </div>
        </div>
        <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:10 }}>History (Last 30 days)</div>
          <div style={{ display:'flex', gap:8 }}>
            {['opening','closing'].map(t => (
              <button key={t} onClick={() => { setView('history'); loadHistory(t) }}
                style={{ flex:1, padding:'8px', border:'1px solid #EDE0CC', borderRadius:8, cursor:'pointer', fontSize:12,
                  background: t==='opening' ? '#E8F5E9' : '#FFEBEE',
                  color: t==='opening' ? '#27AE60' : '#E74C3C', fontWeight:600, fontFamily:'inherit' }}>
                {t === 'opening' ? '🌅 Opening' : '🌙 Closing'}
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
          <button onClick={() => setView('menu')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#8B7355' }}>{'<'} Back</button>
          <div style={{ fontSize:15, fontWeight:700, color:'#2C1810', textTransform:'capitalize' }}>{histType} History</div>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {['opening','closing'].map(t => (
            <button key={t} onClick={() => loadHistory(t)}
              style={{ padding:'6px 14px', borderRadius:20, border:'1px solid #EDE0CC', cursor:'pointer', fontSize:12, fontFamily:'inherit',
                background: histType===t ? '#2C1810' : '#fff', color: histType===t ? '#fff' : '#8B7355' }}>
              {t === 'opening' ? '🌅 Opening' : '🌙 Closing'}
            </button>
          ))}
        </div>
        {loadingHist ? (
          <div style={{ textAlign:'center', padding:32, color:'#8B7355' }}>Loading...</div>
        ) : history.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'#8B7355', fontSize:13 }}>No submissions in last 30 days</div>
        ) : history.map(h => (
          <div key={h.id} style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, marginBottom:10, overflow:'hidden' }}>
            <div onClick={() => setExpandedId(expandedId===h.id ? null : h.id)}
              style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', cursor:'pointer' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#2C1810' }}>{h.date} · {h.time}</div>
                <div style={{ fontSize:11, color:'#8B7355' }}>{h.firstName} {h.lastName}{h.hasPhotos ? ' · 📷' : ''}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ fontSize:12, fontWeight:700, color: h.checkedItems===h.totalItems ? '#27AE60' : '#E67E22' }}>
                  {h.checkedItems}/{h.totalItems}
                </div>
                <span style={{ fontSize:12, color:'#8B7355' }}>{expandedId===h.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {expandedId === h.id && (
              <div style={{ borderTop:'1px solid #EDE0CC', padding:'10px 16px' }}>
                {h.items?.map((item, i) => (
                  <div key={i} style={{ padding:'6px 0', borderBottom:'1px solid #F5EFE8' }}>
                    <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                      <div style={{ width:16, height:16, borderRadius:4, background: item.checked ? '#27AE60' : '#EDE0CC',
                        flexShrink:0, marginTop:2, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {item.checked && <span style={{ color:'#fff', fontSize:9 }}>✓</span>}
                      </div>
                      <span style={{ fontSize:11, color: item.checked ? '#2C1810' : '#8B7355' }}>{item.label}</span>
                    </div>
                    {item.remarks && <div style={{ fontSize:10, color:'#C8843A', marginTop:2, marginLeft:24 }}>📝 {item.remarks}</div>}
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
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <button onClick={() => setView('menu')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#8B7355' }}>{'<'} Back</button>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:'#2C1810' }}>
            {type === 'opening' ? '🌅 Opening' : '🌙 Closing'} Checklist
          </div>
          <div style={{ fontSize:11, color:'#8B7355' }}>{dateStr} · {timeStr}</div>
        </div>
      </div>

      {/* Staff name */}
      <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#2C1810', marginBottom:8 }}>Checklist updated by</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <input placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} style={inp}/>
          <input placeholder="Last Name"  value={lastName}  onChange={e => setLastName(e.target.value)}  style={inp}/>
        </div>
      </div>

      {/* Progress */}
      <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:'12px 16px', marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
          <span style={{ fontSize:12, color:'#8B7355' }}>Progress</span>
          <span style={{ fontSize:12, fontWeight:700, color }}>{completed}/{total} ({pct}%)</span>
        </div>
        <div style={{ background:'#EDE0CC', borderRadius:4, height:8 }}>
          <div style={{ background:color, borderRadius:4, height:8, width:`${pct}%`, transition:'width 0.3s' }}/>
        </div>
      </div>

      {/* Items */}
      <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ borderBottom: idx < items.length-1 ? '1px solid #F5EFE8' : 'none' }}>
            <div onClick={() => toggle(idx)}
              style={{ display:'flex', gap:12, padding:'12px 16px', cursor:'pointer', alignItems:'flex-start',
                background: item.checked ? (type==='opening' ? '#F0FFF4' : '#FFF5F5') : '#fff', transition:'background 0.15s' }}>
              <div style={{ width:24, height:24, borderRadius:6, border:`2px solid ${item.checked ? color : '#EDE0CC'}`,
                background: item.checked ? color : '#fff', flexShrink:0, marginTop:1,
                display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                {item.checked && <span style={{ color:'#fff', fontSize:14, fontWeight:700 }}>✓</span>}
              </div>
              <span style={{ fontSize:13, color: item.checked ? '#2C1810' : '#555', lineHeight:1.4 }}>
                {item.label}
              </span>
            </div>

            {/* Remarks + Photo — only when checked */}
            {item.checked && (
              <div style={{ paddingLeft:52, paddingRight:16, paddingBottom:12, background: type==='opening' ? '#F0FFF4' : '#FFF5F5' }}
                onClick={e => e.stopPropagation()}>
                <input placeholder="Remarks (optional)" value={item.remarks}
                  onChange={e => setRemarks(idx, e.target.value)}
                  style={{ ...inp, fontSize:11, padding:'5px 8px', marginBottom:6 }}/>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {compressing === idx ? (
                    <span style={{ fontSize:11, color:'#8B7355' }}>Compressing photo...</span>
                  ) : item.photo ? (
                    <>
                      <img src={item.photo} alt="attached" style={{ width:56, height:56, objectFit:'cover', borderRadius:6, border:'1px solid #EDE0CC' }}/>
                      <button onClick={() => removePhoto(idx)}
                        style={{ background:'#FFEBEE', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:11, color:'#E74C3C', fontWeight:600, fontFamily:'inherit' }}>
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
                        style={{ background:'none', border:'1.5px dashed #EDE0CC', borderRadius:6, padding:'5px 12px',
                          cursor:'pointer', fontSize:11, color:'#8B7355', fontFamily:'inherit' }}>
                        📷 Photo
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} disabled={submitting}
        style={{ width:'100%', background: submitting ? '#aaa' : color, color:'#fff', border:'none',
          borderRadius:12, padding:'14px', cursor:'pointer', fontSize:15, fontWeight:700,
          fontFamily:'inherit', marginBottom:8 }}>
        {submitting ? 'Submitting...' : `Submit ${type === 'opening' ? 'Opening' : 'Closing'} Checklist`}
      </button>
      <div style={{ fontSize:11, color:'#8B7355', textAlign:'center', marginBottom:20 }}>
        Photos are compressed automatically for faster upload
      </div>
    </div>
  )
}
