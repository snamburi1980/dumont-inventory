import { useState, useEffect } from 'react'
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, limit, where
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { STORES } from '../data/inventory'

export default function Home({ invHook, viewingStore, setActiveTab, auth }) {
  const { inventory, getStatus } = invHook
  const [announcements,  setAnnouncements]  = useState([])
  const [issues,         setIssues]         = useState([])
  const [lastSale,       setLastSale]       = useState(null)
  const [newAnnounce,    setNewAnnounce]    = useState({ title:'', message:'' })
  const [newIssue,       setNewIssue]       = useState({ title:'', description:'' })
  const [showNewIssue,   setShowNewIssue]   = useState(false)
  const [showNewAnnounce,setShowNewAnnounce]= useState(false)
  const [posting,        setPosting]         = useState(false)
  const isSuperOwner = auth.isSuperOwner()
  const store = STORES[viewingStore] || { name: viewingStore }

  useEffect(() => {
    loadAnnouncements()
    loadIssues()
    loadLastSale()
  }, [viewingStore])

  async function loadAnnouncements() {
    try {
      const q = query(
        collection(db, 'announcements'),
        orderBy('postedAt', 'desc'),
        limit(5)
      )
      const snap = await getDocs(q)
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {}
  }

  async function loadIssues() {
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'issues'),
        orderBy('createdAt', 'desc'),
        limit(10)
      )
      const snap = await getDocs(q)
      setIssues(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {}
  }

  async function loadLastSale() {
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'salesLedger'),
        orderBy('appliedAt', 'desc'),
        limit(1)
      )
      const snap = await getDocs(q)
      if (!snap.empty) setLastSale(snap.docs[0].data())
    } catch(e) {}
  }

  async function postAnnouncement() {
    if (!newAnnounce.title.trim()) return
    setPosting(true)

    let fileData = null
    let fileType = null
    let fileName = null

    // Convert file to base64 if attached
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
      title:    newAnnounce.title,
      message:  newAnnounce.message,
      link:     newAnnounce.link || null,
      fileData: fileData,
      fileType: fileType,
      fileName: fileName,
      postedAt: Date.now(),
      postedBy: auth.userConfig?.name || 'HQ',
      active:   true,
    }

    await addDoc(collection(db, 'announcements'), entry)
    setAnnouncements(prev => [{ id: Date.now(), ...entry }, ...prev])
    setNewAnnounce({ title:'', message:'', link:'', file:null, fileName:null })
    setShowNewAnnounce(false)
    setPosting(false)
  }

  async function deleteAnnouncement(id) {
    if (!window.confirm('Delete this announcement?')) return
    await deleteDoc(doc(db, 'announcements', id))
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }

  async function deleteAnnouncement(id) {
    if (!window.confirm('Delete this announcement?')) return
    await deleteDoc(doc(db, 'announcements', id))
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }

  async function logIssue() {
    if (!newIssue.title.trim()) return
    const entry = {
      title:       newIssue.title,
      description: newIssue.description,
      status:      'open',
      createdAt:   Date.now(),
      createdBy:   auth.userConfig?.name || 'Manager',
      store:       viewingStore,
    }
    await addDoc(collection(db, 'stores', viewingStore, 'issues'), entry)
    setIssues(prev => [{ id: Date.now(), ...entry }, ...prev])
    setNewIssue({ title:'', description:'' })
    setShowNewIssue(false)
  }

  async function resolveIssue(id) {
    await updateDoc(doc(db, 'stores', viewingStore, 'issues', id), {
      status: 'resolved',
      resolvedAt: Date.now(),
    })
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status:'resolved' } : i))
  }

  // Stock stats
  const active   = inventory.filter(i => i.active !== false)
  const critical = active.filter(i => getStatus(i) === 'critical')
  const low      = active.filter(i => getStatus(i) === 'low')
  const totalValue = active.reduce((s,i) => s + (i.stock||0) * (i.cost||0), 0)

  // Ice cream
  const iceCreamItems = inventory.filter(i => i.cat === 'Ice Cream' && i.active !== false)
  const totalTubs     = iceCreamItems.reduce((s,i) => s + (i.stock||0), 0)
  const lowFlavors    = iceCreamItems.filter(i => getStatus(i) !== 'ok')

  const openIssues = issues.filter(i => i.status === 'open')
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const cardStyle = {
    background: '#fff',
    border: '1px solid #EDE0CC',
    borderRadius: 12,
    padding: '14px 16px',
    marginBottom: 12,
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>

      {/* Greeting */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#2C1810' }}>
          {greeting}, {store.name}
        </div>
        <div style={{ fontSize: 12, color: '#8B7355' }}>
          {new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
        </div>
      </div>

      {/* ── ANNOUNCEMENTS ── */}
      <div style={cardStyle}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8B7355', textTransform:'uppercase', letterSpacing:'0.5px' }}>
            Announcements
          </div>
          {isSuperOwner && (
            <button
              onClick={() => setShowNewAnnounce(!showNewAnnounce)}
              style={{ fontSize:11, color:'#C8843A', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}
            >
              + Post
            </button>
          )}
        </div>

        {/* New announcement form */}
        {showNewAnnounce && isSuperOwner && (
          <div style={{ background:'#FDF6EC', borderRadius:10, padding:12, marginBottom:12 }}>
            <input
              placeholder="Heading *"
              value={newAnnounce.title}
              onChange={e => setNewAnnounce(a => ({...a, title:e.target.value}))}
              style={{ marginBottom:8, width:'100%', padding:'8px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, fontWeight:600, boxSizing:'border-box' }}
            />
            <textarea
              placeholder="Description"
              value={newAnnounce.message}
              onChange={e => setNewAnnounce(a => ({...a, message:e.target.value}))}
              rows={3}
              style={{ marginBottom:8, width:'100%', padding:'8px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, resize:'none', boxSizing:'border-box' }}
            />
            <input
              placeholder="Link (optional) e.g. https://..."
              value={newAnnounce.link||''}
              onChange={e => setNewAnnounce(a => ({...a, link:e.target.value}))}
              style={{ marginBottom:8, width:'100%', padding:'8px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, boxSizing:'border-box' }}
            />
            <label style={{ display:'block', marginBottom:8 }}>
              <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>Attach image or PDF (optional)</div>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={e => setNewAnnounce(a => ({...a, file: e.target.files[0], fileName: e.target.files[0]?.name}))}
                style={{ fontSize:12 }}
              />
            </label>
            {newAnnounce.fileName && (
              <div style={{ fontSize:11, color:'#27AE60', marginBottom:8 }}>
                Selected: {newAnnounce.fileName}
              </div>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={postAnnouncement}
                style={{ flex:1, background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'8px', cursor:'pointer', fontSize:13, fontWeight:600 }}
              >
                {posting ? "Posting..." : "Post to All Stores"}
              </button>
              <button
                onClick={() => setShowNewAnnounce(false)}
                style={{ padding:'8px 14px', background:'#888', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {announcements.length === 0 ? (
          <div style={{ fontSize:13, color:'#8B7355', textAlign:'center', padding:'12px 0' }}>
            No announcements
          </div>
        ) : announcements.map(a => (
          <div key={a.id} style={{
            padding: '10px 12px',
            background: '#FDF6EC',
            borderRadius: 10,
            marginBottom: 8,
            borderLeft: '3px solid #C8843A'
          }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#2C1810' }}>{a.title}</div>
            {a.message && <div style={{ fontSize:13, color:'#2C1810', marginTop:4, lineHeight:1.5 }}>{a.message}</div>}
            {a.fileData && a.fileType?.startsWith('image') && (
              <img src={a.fileData} alt={a.fileName} style={{ width:'100%', borderRadius:8, marginTop:8, maxHeight:200, objectFit:'cover' }} />
            )}
            {a.fileData && !a.fileType?.startsWith('image') && (
              <a href={a.fileData} download={a.fileName} style={{ display:'block', marginTop:8, fontSize:12, color:'#C8843A', fontWeight:600 }}>
                Download: {a.fileName}
              </a>
            )}
            {a.link && (
              <a href={a.link} target="_blank" rel="noreferrer" style={{ display:'block', marginTop:6, fontSize:12, color:'#C8843A', fontWeight:600 }}>
                View Link
              </a>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
              <div style={{ fontSize:10, color:'#aaa' }}>
                {a.postedBy} · {new Date(a.postedAt).toLocaleDateString()}
              </div>
              {isSuperOwner && (
                <button
                  onClick={() => deleteAnnouncement(a.id)}
                  style={{ fontSize:11, color:'#E74C3C', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── STORE ALERTS ── */}
      {(critical.length > 0 || low.length > 0) && (
        <div style={cardStyle}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#8B7355', textTransform:'uppercase', letterSpacing:'0.5px' }}>
              Stock Alerts
            </div>
            <button
              onClick={() => setActiveTab('orders')}
              style={{ fontSize:11, color:'#C8843A', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}
            >
              View Orders
            </button>
          </div>
          {[...critical, ...low].slice(0,6).map(item => (
            <div key={item.id} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'8px 0', borderBottom:'1px solid #EDE0CC'
            }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#2C1810' }}>{item.name}</div>
                <div style={{ fontSize:11, color:'#8B7355' }}>{item.code}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:13, fontWeight:700, color: getStatus(item)==='critical' ? '#E74C3C' : '#E67E22' }}>
                  {item.stock} {item.uom}
                </div>
                <div style={{ fontSize:10, color:'#aaa' }}>PAR: {item.par}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── QUICK STATS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
        <div style={{ ...cardStyle, marginBottom:0, textAlign:'center' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#C8843A' }}>
            ${totalValue.toLocaleString('en-US',{maximumFractionDigits:0})}
          </div>
          <div style={{ fontSize:10, color:'#8B7355', textTransform:'uppercase' }}>Stock Value</div>
        </div>
        <div style={{ ...cardStyle, marginBottom:0, textAlign:'center' }}>
          <div style={{ fontSize:18, fontWeight:700, color: lastSale ? '#27AE60' : '#8B7355' }}>
            {lastSale ? '$' + (lastSale.revenue||0).toLocaleString('en-US',{maximumFractionDigits:0}) : '--'}
          </div>
          <div style={{ fontSize:10, color:'#8B7355', textTransform:'uppercase' }}>Last Sale</div>
        </div>
        <div style={{ ...cardStyle, marginBottom:0, textAlign:'center' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#C8843A' }}>
            {totalTubs.toFixed(1)}
          </div>
          <div style={{ fontSize:10, color:'#8B7355', textTransform:'uppercase' }}>Ice Cream Tubs</div>
        </div>
      </div>

      {/* Low flavors alert */}
      {lowFlavors.length > 0 && (
        <div style={{ ...cardStyle, borderLeft:'3px solid #E74C3C', marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#E74C3C', marginBottom:4 }}>
            Low Ice Cream Flavors
          </div>
          <div style={{ fontSize:12, color:'#8B7355' }}>
            {lowFlavors.map(i => i.name).join(', ')}
          </div>
        </div>
      )}

      {/* ── ISSUES ── */}
      <div style={cardStyle}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#8B7355', textTransform:'uppercase', letterSpacing:'0.5px' }}>
            Issues {openIssues.length > 0 && `(${openIssues.length} open)`}
          </div>
          <button
            onClick={() => setShowNewIssue(!showNewIssue)}
            style={{ fontSize:11, color:'#C8843A', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}
          >
            + Log Issue
          </button>
        </div>

        {/* New issue form */}
        {showNewIssue && (
          <div style={{ background:'#FDF6EC', borderRadius:10, padding:12, marginBottom:12 }}>
            <input
              placeholder="Issue title (e.g. Ice cream machine not working)"
              value={newIssue.title}
              onChange={e => setNewIssue(i => ({...i, title:e.target.value}))}
              style={{ marginBottom:8, width:'100%', padding:'8px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13 }}
            />
            <textarea
              placeholder="Details (optional)"
              value={newIssue.description}
              onChange={e => setNewIssue(i => ({...i, description:e.target.value}))}
              rows={2}
              style={{ marginBottom:8, width:'100%', padding:'8px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, resize:'none' }}
            />
            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={logIssue}
                style={{ flex:1, background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'8px', cursor:'pointer', fontSize:13, fontWeight:600 }}
              >
                Log Issue
              </button>
              <button
                onClick={() => setShowNewIssue(false)}
                style={{ padding:'8px 14px', background:'#888', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {issues.length === 0 ? (
          <div style={{ fontSize:13, color:'#8B7355', textAlign:'center', padding:'12px 0' }}>
            No issues logged
          </div>
        ) : issues.slice(0,5).map(issue => (
          <div key={issue.id} style={{
            padding:'10px 12px', borderRadius:10, marginBottom:8,
            background: issue.status === 'resolved' ? '#F5F5F5' : '#FFF3E0',
            borderLeft: `3px solid ${issue.status === 'resolved' ? '#ccc' : '#E67E22'}`
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color: issue.status==='resolved' ? '#999' : '#2C1810' }}>
                  {issue.title}
                </div>
                {issue.description && (
                  <div style={{ fontSize:11, color:'#8B7355', marginTop:2 }}>{issue.description}</div>
                )}
                <div style={{ fontSize:10, color:'#aaa', marginTop:4 }}>
                  {issue.createdBy} · {new Date(issue.createdAt).toLocaleDateString()}
                  {issue.status === 'resolved' && ' · Resolved'}
                </div>
              </div>
              {issue.status === 'open' && (isSuperOwner || true) && (
                <button
                  onClick={() => resolveIssue(issue.id)}
                  style={{ fontSize:11, color:'#27AE60', background:'none', border:'1px solid #27AE60', borderRadius:6, padding:'3px 8px', cursor:'pointer', marginLeft:8, whiteSpace:'nowrap' }}
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <button
          onClick={() => setActiveTab('sales')}
          style={{ background:'#2C1810', color:'#fff', border:'none', borderRadius:10, padding:'12px', cursor:'pointer', fontSize:13, fontWeight:600 }}
        >
          Upload Sales
        </button>
        <button
          onClick={() => setActiveTab('delivery')}
          style={{ background:'#C8843A', color:'#fff', border:'none', borderRadius:10, padding:'12px', cursor:'pointer', fontSize:13, fontWeight:600 }}
        >
          Log Delivery
        </button>
      </div>

    </div>
  )
}
