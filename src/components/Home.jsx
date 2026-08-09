import TipBanner from './TipBanner'
import { useState, useEffect } from 'react'
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, limit, where, getDoc
} from 'firebase/firestore'
import { db } from '../firebase/config'

export default function Home({ invHook, viewingStore, setActiveTab, auth, showToast }) {
  const { inventory, getStatus } = invHook
  const [announcements,   setAnnouncements]   = useState([])
  const [issues,          setIssues]          = useState([])
  const [newAnnounce,     setNewAnnounce]     = useState({ title:'', message:'', link:'', file:null, fileName:null })
  const [newIssue,        setNewIssue]        = useState({ title:'', description:'' })
  const [showNewIssue,    setShowNewIssue]    = useState(false)
  const [showNewAnnounce, setShowNewAnnounce] = useState(false)
  const [posting,         setPosting]         = useState(false)
  const [storeName,       setStoreName]       = useState('')
  const [todayChecklist,  setTodayChecklist]  = useState({ opening: false, closing: false })
  const [showResolved,    setShowResolved]    = useState(false)
  const [loadError,       setLoadError]       = useState(null)
  const isSuperOwner = auth.isSuperOwner()

  useEffect(() => {
    async function fetchStoreName() {
      if (!viewingStore) { setStoreName(''); return }
      try {
        const snap = await getDoc(doc(db, 'stores', viewingStore))
        if (snap.exists()) setStoreName(snap.data().name || '')
        else setStoreName('')
      } catch(e) { setStoreName('') }
    }
    fetchStoreName()
    loadAnnouncements()
    loadIssues()
    checkTodayChecklist()
  }, [viewingStore])

  async function loadAnnouncements() {
    try {
      const q = query(collection(db, 'announcements'), orderBy('postedAt', 'desc'), limit(5))
      const snap = await getDocs(q)
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoadError(null)
    } catch(e) {
      console.error('loadAnnouncements:', e)
      setLoadError(e?.code === 'permission-denied'
        ? "You don't have access to some of this store's data."
        : 'Could not load the latest data. Pull to refresh or check your connection.')
    }
  }

  async function loadIssues() {
    if (!viewingStore) return
    try {
      const q = query(collection(db, 'stores', viewingStore, 'issues'), orderBy('createdAt', 'desc'), limit(20))
      const snap = await getDocs(q)
      setIssues(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {
      console.error('loadIssues:', e)
    }
  }

  async function checkTodayChecklist() {
    if (!viewingStore) return
    try {
      const today = new Date().toLocaleDateString()
      const snap = await getDocs(query(
        collection(db, 'stores', viewingStore, 'checklists'),
        where('date', '==', today)
      ))
      const subs = snap.docs.map(d => d.data())
      setTodayChecklist({
        opening: subs.some(s => s.type === 'opening'),
        closing: subs.some(s => s.type === 'closing'),
      })
    } catch(e) {
      console.error('checkTodayChecklist:', e)
    }
  }

  async function postAnnouncement() {
    if (!newAnnounce.title.trim()) return
    setPosting(true)
    let fileData = null, fileType = null, fileName = null
    if (newAnnounce.file) {
      fileData = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.readAsDataURL(newAnnounce.file)
      })
      fileType = newAnnounce.file.type
      fileName = newAnnounce.file.name
    }
    const entry = {
      title: newAnnounce.title, message: newAnnounce.message,
      link: newAnnounce.link || null, fileData, fileType, fileName,
      postedAt: Date.now(), postedBy: auth.userConfig?.name || 'HQ', active: true,
    }
    const docRef = await addDoc(collection(db, 'announcements'), entry)
    setAnnouncements(prev => [{ id: docRef.id, ...entry }, ...prev])
    setNewAnnounce({ title:'', message:'', link:'', file:null, fileName:null })
    setShowNewAnnounce(false)
    setPosting(false)
  }

  async function deleteAnnouncement(id) {
    if (!window.confirm('Delete this announcement?')) return
    try {
      await deleteDoc(doc(db, 'announcements', String(id)))
      setAnnouncements(prev => prev.filter(a => a.id !== id))
      if (showToast) showToast('Announcement deleted')
    } catch(e) { console.error(e) }
  }

  async function logIssue() {
    if (!newIssue.title.trim()) return
    const entry = {
      title: newIssue.title, description: newIssue.description,
      status: 'open', createdAt: Date.now(),
      createdBy: auth.userConfig?.name || 'Manager', store: viewingStore,
    }
    const ref = await addDoc(collection(db, 'stores', viewingStore, 'issues'), entry)
    setIssues(prev => [{ id: ref.id, ...entry }, ...prev])
    setNewIssue({ title:'', description:'' })
    setShowNewIssue(false)
  }

  async function resolveIssue(id) {
    await updateDoc(doc(db, 'stores', viewingStore, 'issues', id), { status:'resolved', resolvedAt: Date.now() })
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status:'resolved' } : i))
  }

  const active       = inventory.filter(i => i.active !== false)
  const critical     = active.filter(i => getStatus(i) === 'critical')
  const low          = active.filter(i => getStatus(i) === 'low')
  const totalValue   = active.reduce((s,i) => s + (i.stock||0) * (i.cost||i.cost_price||0), 0)
  const iceCreamItems = inventory.filter(i => i.cat === 'Ice Cream' && i.active !== false)
  const totalTubs    = iceCreamItems.reduce((s,i) => s + (i.stock||0), 0)
  const lowFlavors   = iceCreamItems.filter(i => getStatus(i) !== 'ok')
  const openIssues   = issues.filter(i => i.status === 'open')
  const resolvedIssues = issues.filter(i => i.status === 'resolved')
  const displayIssues  = showResolved ? issues : openIssues
  const hour         = new Date().getHours()
  const greeting     = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const cardStyle = { background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, padding:'14px 16px', marginBottom:12 }

  if (isSuperOwner && !viewingStore) {
    return (
      <div style={{ maxWidth:700, margin:'0 auto', textAlign:'center', padding:'40px 20px' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>D</div>
        <div style={{ fontSize:20, fontWeight:700, color:'#1A4C48', marginBottom:8 }}>{greeting}!</div>
        <div style={{ fontSize:14, color:'#6B7F78', marginBottom:32 }}>
          No stores set up yet. Go to Admin to create your organisation, regions and stores.
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12, maxWidth:300, margin:'0 auto' }}>
          {['Create New Organisation','Add Region','Add Store','Assign Users'].map((s,i) => (
            <div key={i} style={{ background:'#F6F4ED', border:'1px solid #E3DDD0', borderRadius:12, padding:'16px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:4 }}>Step {i+1}</div>
              <div style={{ fontSize:12, color:'#6B7F78' }}>Admin → {s}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth:700, margin:'0 auto' }}>

      <TipBanner message="Your daily dashboard — check stock alerts, read announcements, and log issues for your store." />

      {loadError && (
        <div style={{ background:'#FFF8EC', border:'1px solid #FFB74D', borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:16 }}>⚠</span>
          <span style={{ flex:1, fontSize:12, color:'#8B5A00', lineHeight:1.5 }}>{loadError}</span>
          <button onClick={() => { loadAnnouncements(); loadIssues(); checkTodayChecklist() }}
            style={{ background:'#8B5A00', color:'#fff', border:'none', borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit', flexShrink:0 }}>
            Retry
          </button>
        </div>
      )}

      {/* Greeting — brand display style with sparkle */}
      <div style={{ marginBottom:14, position:'relative' }}>
        <div style={{
          fontFamily:'"Bebas Neue", sans-serif', fontSize:30, letterSpacing:1.5,
          color:'#1A4C48', textShadow:'2px 2px 0 #E39C74', lineHeight:1.1,
        }}>
          {greeting}{storeName ? `, ${storeName}` : ''}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            style={{ display:'inline-block', marginLeft:8, verticalAlign:'super' }}>
            <path d="M12 0 C13 7 17 11 24 12 C17 13 13 17 12 24 C11 17 7 13 0 12 C7 11 11 7 12 0 Z" fill="#FBBC55"/>
          </svg>
        </div>
        <div style={{ fontSize:12, color:'#6B7F78', marginTop:4 }}>
          {new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
        </div>
      </div>

      {/* Today's Checklist Status */}
      <div style={{ ...cardStyle, padding:'12px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.5px' }}>
            Today's Checklists
          </div>
          <button onClick={() => setActiveTab('checklist')}
            style={{ fontSize:11, color:'#C1683C', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
            Open →
          </button>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:10 }}>
          <div onClick={() => setActiveTab('checklist')} style={{
            flex:1, display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
            background: todayChecklist.opening ? '#E8F5E9' : '#FFF3E0',
            border: `1px solid ${todayChecklist.opening ? '#81C784' : '#FFB74D'}`,
            borderRadius:10, cursor:'pointer',
          }}>
            <span style={{ fontSize:20 }}>🌅</span>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color: todayChecklist.opening ? '#2E7D32' : '#E65100' }}>
                Opening
              </div>
              <div style={{ fontSize:10, color: todayChecklist.opening ? '#27AE60' : '#6B7F78' }}>
                {todayChecklist.opening ? '✓ Submitted' : 'Not yet done'}
              </div>
            </div>
          </div>
          <div onClick={() => setActiveTab('checklist')} style={{
            flex:1, display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
            background: todayChecklist.closing ? '#E8F5E9' : '#F5F5F5',
            border: `1px solid ${todayChecklist.closing ? '#81C784' : '#E3DDD0'}`,
            borderRadius:10, cursor:'pointer',
          }}>
            <span style={{ fontSize:20 }}>🌙</span>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color: todayChecklist.closing ? '#2E7D32' : '#999' }}>
                Closing
              </div>
              <div style={{ fontSize:10, color: todayChecklist.closing ? '#27AE60' : '#aaa' }}>
                {todayChecklist.closing ? '✓ Submitted' : 'End of day'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Announcements */}
      <div style={cardStyle}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.5px' }}>Announcements</div>
          {isSuperOwner && (
            <button onClick={() => setShowNewAnnounce(!showNewAnnounce)}
              style={{ fontSize:11, color:'#C1683C', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
              + Post
            </button>
          )}
        </div>
        {showNewAnnounce && isSuperOwner && (
          <div style={{ background:'#F6F4ED', borderRadius:10, padding:12, marginBottom:12 }}>
            <input placeholder="Heading *" value={newAnnounce.title}
              onChange={e => setNewAnnounce(a=>({...a,title:e.target.value}))}
              style={{ marginBottom:8, width:'100%', padding:'8px 10px', border:'1px solid #E3DDD0', borderRadius:8, fontFamily:'inherit', fontSize:13, fontWeight:600, boxSizing:'border-box' }}/>
            <textarea placeholder="Description" value={newAnnounce.message}
              onChange={e => setNewAnnounce(a=>({...a,message:e.target.value}))}
              rows={3} style={{ marginBottom:8, width:'100%', padding:'8px 10px', border:'1px solid #E3DDD0', borderRadius:8, fontFamily:'inherit', fontSize:13, resize:'none', boxSizing:'border-box' }}/>
            <input placeholder="Link (optional)" value={newAnnounce.link||''}
              onChange={e => setNewAnnounce(a=>({...a,link:e.target.value}))}
              style={{ marginBottom:8, width:'100%', padding:'8px 10px', border:'1px solid #E3DDD0', borderRadius:8, fontFamily:'inherit', fontSize:13, boxSizing:'border-box' }}/>
            <label style={{ display:'block', marginBottom:8 }}>
              <div style={{ fontSize:11, color:'#6B7F78', marginBottom:4 }}>Attach image or PDF (optional)</div>
              <input type="file" accept="image/*,.pdf"
                onChange={e => setNewAnnounce(a=>({...a,file:e.target.files[0],fileName:e.target.files[0]?.name}))}
                style={{ fontSize:12 }}/>
            </label>
            {newAnnounce.fileName && <div style={{ fontSize:11, color:'#27AE60', marginBottom:8 }}>Selected: {newAnnounce.fileName}</div>}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={postAnnouncement}
                style={{ flex:1, background:'#1A4C48', color:'#fff', border:'none', borderRadius:8, padding:'8px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                {posting ? 'Posting...' : 'Post to All Stores'}
              </button>
              <button onClick={() => setShowNewAnnounce(false)}
                style={{ padding:'8px 14px', background:'#888', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {announcements.length === 0 ? (
          <div style={{ fontSize:13, color:'#6B7F78', textAlign:'center', padding:'12px 0' }}>No announcements</div>
        ) : announcements.map(a => (
          <div key={a.id} style={{ padding:'10px 12px', background:'#F6F4ED', borderRadius:10, marginBottom:8, borderLeft:'3px solid #C1683C' }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#1A4C48' }}>{a.title}</div>
            {a.message && <div style={{ fontSize:13, color:'#1A4C48', marginTop:4, lineHeight:1.5 }}>{a.message}</div>}
            {a.fileData && a.fileType?.startsWith('image') && (
              <img src={a.fileData} alt={a.fileName} style={{ width:'100%', borderRadius:8, marginTop:8, maxHeight:200, objectFit:'cover' }}/>
            )}
            {a.fileData && !a.fileType?.startsWith('image') && (
              <a href={a.fileData} download={a.fileName} style={{ display:'block', marginTop:8, fontSize:12, color:'#C1683C', fontWeight:600 }}>
                Download: {a.fileName}
              </a>
            )}
            {a.link && (
              <a href={a.link} target="_blank" rel="noreferrer" style={{ display:'block', marginTop:6, fontSize:12, color:'#C1683C', fontWeight:600 }}>View Link</a>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
              <div style={{ fontSize:10, color:'#aaa' }}>{a.postedBy} · {new Date(a.postedAt).toLocaleDateString()}</div>
              {isSuperOwner && (
                <button onClick={() => deleteAnnouncement(a.id)}
                  style={{ fontSize:11, color:'#E74C3C', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Stock Alerts */}
      {(critical.length > 0 || low.length > 0) && (
        <div style={cardStyle}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.5px' }}>
              Stock Alerts
              <span style={{ marginLeft:6, background:'#FFEBEE', color:'#E74C3C', borderRadius:20, padding:'1px 8px', fontSize:10 }}>
                {critical.length + low.length}
              </span>
            </div>
            <button onClick={() => setActiveTab('inventory')}
              style={{ fontSize:11, color:'#C1683C', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
              View Inventory →
            </button>
          </div>
          {[...critical,...low].map(item => (
            <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #E3DDD0' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#1A4C48' }}>{item.name}</div>
                <div style={{ fontSize:11, color:'#6B7F78' }}>{item.cat}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:13, fontWeight:700, color: getStatus(item)==='critical'?'#E74C3C':'#E67E22' }}>
                  {item.stock} {item.uom}
                </div>
                <div style={{ fontSize:10, color:'#aaa' }}>PAR: {item.par}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:12 }}>
        <div style={{ ...cardStyle, marginBottom:0, textAlign:'center' }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#C1683C' }}>
            ${totalValue.toLocaleString('en-US',{maximumFractionDigits:0})}
          </div>
          <div style={{ fontSize:10, color:'#6B7F78', textTransform:'uppercase' }}>Stock Value</div>
        </div>
        <div style={{ ...cardStyle, marginBottom:0, textAlign:'center' }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#C1683C' }}>{totalTubs.toFixed(1)}</div>
          <div style={{ fontSize:10, color:'#6B7F78', textTransform:'uppercase' }}>Ice Cream Tubs</div>
        </div>
      </div>

      {/* Low flavors */}
      {lowFlavors.length > 0 && (
        <div style={{ ...cardStyle, borderLeft:'3px solid #E74C3C', marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#E74C3C', marginBottom:4 }}>⚠ Low Ice Cream Flavors</div>
          <div style={{ fontSize:12, color:'#6B7F78' }}>{lowFlavors.map(i=>i.name).join(', ')}</div>
        </div>
      )}

      {/* Issues */}
      <div style={cardStyle}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.5px' }}>Issues</div>
            {openIssues.length > 0 && (
              <span style={{ background:'#FFF3E0', color:'#E67E22', borderRadius:20, padding:'1px 8px', fontSize:10, fontWeight:700 }}>
                {openIssues.length} open
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {resolvedIssues.length > 0 && (
              <button onClick={() => setShowResolved(v => !v)}
                style={{ fontSize:11, color:'#6B7F78', background:'none', border:'none', cursor:'pointer' }}>
                {showResolved ? 'Hide resolved' : `+${resolvedIssues.length} resolved`}
              </button>
            )}
            <button onClick={() => setShowNewIssue(!showNewIssue)}
              style={{ fontSize:11, color:'#C1683C', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
              + Log Issue
            </button>
          </div>
        </div>
        {showNewIssue && (
          <div style={{ background:'#F6F4ED', borderRadius:10, padding:12, marginBottom:12 }}>
            <input placeholder="Issue title" value={newIssue.title}
              onChange={e => setNewIssue(i=>({...i,title:e.target.value}))}
              style={{ marginBottom:8, width:'100%', padding:'8px 10px', border:'1px solid #E3DDD0', borderRadius:8, fontFamily:'inherit', fontSize:13, boxSizing:'border-box' }}/>
            <textarea placeholder="Details (optional)" value={newIssue.description}
              onChange={e => setNewIssue(i=>({...i,description:e.target.value}))}
              rows={2} style={{ marginBottom:8, width:'100%', padding:'8px 10px', border:'1px solid #E3DDD0', borderRadius:8, fontFamily:'inherit', fontSize:13, resize:'none', boxSizing:'border-box' }}/>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={logIssue}
                style={{ flex:1, background:'#1A4C48', color:'#fff', border:'none', borderRadius:8, padding:'8px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                Log Issue
              </button>
              <button onClick={() => setShowNewIssue(false)}
                style={{ padding:'8px 14px', background:'#888', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {displayIssues.length === 0 ? (
          <div style={{ fontSize:13, color:'#6B7F78', textAlign:'center', padding:'12px 0' }}>
            {openIssues.length === 0 ? 'No open issues 🎉' : 'No issues logged'}
          </div>
        ) : displayIssues.slice(0, 10).map(issue => (
          <div key={issue.id} style={{ padding:'10px 12px', borderRadius:10, marginBottom:8,
            background: issue.status==='resolved' ? '#F9F9F9' : '#FFF3E0',
            borderLeft: `3px solid ${issue.status==='resolved' ? '#ccc' : '#E67E22'}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color: issue.status==='resolved' ? '#999' : '#1A4C48' }}>
                  {issue.status==='resolved' && <span style={{ fontSize:11, marginRight:6 }}>✓</span>}
                  {issue.title}
                </div>
                {issue.description && <div style={{ fontSize:11, color:'#6B7F78', marginTop:2 }}>{issue.description}</div>}
                <div style={{ fontSize:10, color:'#aaa', marginTop:4 }}>
                  {issue.createdBy} · {new Date(issue.createdAt).toLocaleDateString()}
                </div>
              </div>
              {issue.status === 'open' && (
                <button onClick={() => resolveIssue(issue.id)}
                  style={{ fontSize:11, color:'#27AE60', background:'none', border:'1px solid #27AE60', borderRadius:6, padding:'4px 10px', cursor:'pointer', marginLeft:8, whiteSpace:'nowrap', fontFamily:'inherit' }}>
                  Resolve
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
        <button onClick={() => setActiveTab('checklist')}
          style={{ background:'#1A4C48', color:'#fff', border:'none', borderRadius:10, padding:'14px 12px', cursor:'pointer', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          ✅ Start Checklist
        </button>
        <button onClick={() => setActiveTab('icecreamlog')}
          style={{ background:'#C1683C', color:'#fff', border:'none', borderRadius:10, padding:'14px 12px', cursor:'pointer', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          🍦 Log Scoops
        </button>
      </div>
    </div>
  )
}
