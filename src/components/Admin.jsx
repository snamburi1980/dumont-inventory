import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { STORES } from '../data/inventory'

export default function Admin({ showToast, auth }) {
  const [pending, setPending] = useState([])
  const [view,    setView]    = useState('pending')

  useEffect(() => { loadPending() }, [])

  async function loadPending() {
    try {
      const snap = await getDocs(collection(db, 'signupRequests'))
      setPending(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {}
  }

  async function approve(req) {
    try {
      const emailKey = req.email.replace(/\./g,'_').replace(/@/g,'_at_')
      await updateDoc(doc(db, 'users', emailKey), { status:'active', role: req.role || 'store_owner', store: req.store || 'coppell' })
      await deleteDoc(doc(db, 'signupRequests', req.id))
      setPending(prev => prev.filter(p => p.id !== req.id))
      showToast(` ${req.email} approved`)
    } catch(e) { showToast(' Error approving') }
  }

  async function reject(req) {
    try {
      await deleteDoc(doc(db, 'signupRequests', req.id))
      setPending(prev => prev.filter(p => p.id !== req.id))
      showToast(` ${req.email} rejected`)
    } catch(e) {}
  }

  return (
    <div>
      {/* Sub nav */}
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        <button className={`cat-btn ${view==='pending'?'active':''}`} onClick={() => setView('pending')}>
           Pending Signups {pending.length > 0 && `(${pending.length})`}
        </button>
        <button className={`cat-btn ${view==='stores'?'active':''}`} onClick={() => setView('stores')}>
           Stores
        </button>
      </div>

      {/* Pending signups */}
      {view === 'pending' && (
        <div>
          {pending.length === 0 ? (
            <div style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>
              <div style={{fontSize:32,marginBottom:8}}></div>
              <div>No pending signups</div>
            </div>
          ) : pending.map(req => (
            <div key={req.id} className="card" style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--dark)'}}>{req.email}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>
                    {req.store || 'No store'} · {new Date(req.createdAt||Date.now()).toLocaleDateString()}
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button
                    onClick={() => approve(req)}
                    style={{background:'var(--green-ok)',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => reject(req)}
                    style={{background:'var(--red-alert)',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stores list */}
      {view === 'stores' && (
        <div>
          {Object.entries(STORES).map(([id, store]) => (
            <div key={id} className="card" style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--dark)'}}>{store.name}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{store.city} · {id}</div>
                </div>
                <span style={{
                  fontSize:11,padding:'3px 10px',borderRadius:20,
                  background:'var(--green-ok)',color:'#fff',fontWeight:600
                }}>
                  Active
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
