import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'

export default function HQDashboard({ onViewStore }) {
  const [stores,      setStores]      = useState([])
  const [users,       setUsers]       = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const [storeSnap, userSnap, invSnap] = await Promise.all([
        getDocs(collection(db, 'stores')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'invitations')),
      ])
      setStores(storeSnap.docs.map(d => ({ id:d.id, ...d.data() })))
      setUsers(userSnap.docs.map(d => ({ id:d.id, ...d.data() })))
      const now = Date.now()
      setInvitations(
        invSnap.docs.map(d => ({ id:d.id, ...d.data() }))
          .filter(i => i.status === 'pending' && i.expiresAt > now)
      )
    } catch(e) {
      console.warn('HQDashboard load error', e)
    }
    setLoading(false)
  }

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#8B7355' }}>Loading…</div>

  const activeStores  = stores.filter(s => s.status !== 'inactive')
  const pendingStores = stores.filter(s => s.status === 'pending')
  const activeUsers   = users.filter(u => u.status !== 'inactive' && u.role !== 'super_owner')
  const inactiveUsers = users.filter(u => u.status === 'inactive')

  const card = { background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:'16px' }
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })

  return (
    <div style={{ maxWidth:900 }}>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:20, fontWeight:700, color:'#2C1810' }}>HQ Dashboard</div>
        <div style={{ fontSize:12, color:'#8B7355', marginTop:3 }}>{today}</div>
      </div>

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:32 }}>
        {[
          {
            label: 'Total Stores',
            value: activeStores.length,
            color: '#C8843A',
            sub:   pendingStores.length ? `${pendingStores.length} pending setup` : 'all active',
          },
          {
            label: 'Active Users',
            value: activeUsers.length,
            color: '#27AE60',
            sub:   inactiveUsers.length ? `${inactiveUsers.length} inactive` : 'all active',
          },
          {
            label: 'Open Invitations',
            value: invitations.length,
            color: invitations.length > 0 ? '#2980B9' : '#8B7355',
            sub:   invitations.length > 0 ? 'awaiting sign-up' : 'none pending',
          },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ ...card, textAlign:'center' }}>
            <div style={{ fontSize:40, fontWeight:700, color, lineHeight:1 }}>{value}</div>
            <div style={{ fontSize:12, fontWeight:600, color:'#2C1810', marginTop:8 }}>{label}</div>
            <div style={{ fontSize:11, color:'#8B7355', marginTop:3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Store cards */}
      <div style={{ fontSize:11, fontWeight:700, color:'#8B7355', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>
        Stores — click to view operations
      </div>
      {activeStores.length === 0 ? (
        <div style={{ ...card, textAlign:'center', color:'#8B7355', padding:48 }}>
          No stores yet. Go to <strong>Stores</strong> to create one.
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12, marginBottom:32 }}>
          {activeStores.map(store => {
            const storeUsers = users.filter(u =>
              (u.storeId || u.store) === store.id && u.status !== 'inactive'
            )
            return (
              <div key={store.id}
                onClick={() => onViewStore(store.id)}
                style={{ ...card, cursor:'pointer', borderLeft:'4px solid #C8843A', transition:'transform 0.12s, box-shadow 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 18px rgba(0,0,0,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ fontSize:15, fontWeight:700, color:'#2C1810', marginBottom:4 }}>{store.name}</div>
                <div style={{ fontSize:11, color:'#8B7355', marginBottom:12 }}>
                  {storeUsers.length} active user{storeUsers.length !== 1 ? 's' : ''}
                  {store.address ? ` · ${store.address}` : ''}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{
                    fontSize:10, fontWeight:600, borderRadius:4, padding:'2px 8px',
                    background: store.status === 'active' ? '#E8F5E9' : '#FFF3E0',
                    color:      store.status === 'active' ? '#27AE60' : '#C8843A',
                  }}>
                    {store.status || 'active'}
                  </span>
                  <span style={{ fontSize:11, color:'#C8843A', fontWeight:700 }}>View Ops →</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#8B7355', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>
            Pending Invitations ({invitations.length})
          </div>
          {invitations.map(inv => (
            <div key={inv.id} style={{ ...card, marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#2C1810' }}>{inv.email}</div>
                <div style={{ fontSize:11, color:'#8B7355' }}>
                  {inv.storeName} · {(inv.role || '').replace(/_/g,' ')} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                </div>
              </div>
              <span style={{ fontSize:10, fontWeight:700, color:'#2980B9', background:'#E3F2FD', borderRadius:4, padding:'2px 8px', flexShrink:0 }}>
                Pending
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
