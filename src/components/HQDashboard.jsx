import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase/config'

const fmt     = n  => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const daysAgo = ts => {
  if (!ts) return null
  const d = Math.floor((Date.now() - ts) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return `${d}d ago`
}

export default function HQDashboard({ onViewStore }) {
  const [stores,      setStores]      = useState([])
  const [users,       setUsers]       = useState([])
  const [invitations, setInvitations] = useState([])
  const [metrics,     setMetrics]     = useState({})
  const [loading,     setLoading]     = useState(true)
  const [loadingMet,  setLoadingMet]  = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const [storeSnap, userSnap, invSnap] = await Promise.all([
        getDocs(collection(db, 'stores')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'invitations')),
      ])
      const storeList = storeSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setStores(storeList)
      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      const now = Date.now()
      setInvitations(
        invSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(i => i.status === 'pending' && i.expiresAt > now)
      )
      loadMetrics(storeList)
    } catch (e) { console.warn('HQDashboard load error', e) }
    setLoading(false)
  }

  async function loadMetrics(storeList) {
    setLoadingMet(true)
    const monthKey  = new Date().toISOString().slice(0, 7)
    const result    = {}

    await Promise.all(storeList.map(async store => {
      try {
        const [crSnap, clSnap, invSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'stores', store.id, 'cashRegister'),
            where('monthKey', '==', monthKey)
          )),
          getDocs(query(
            collection(db, 'stores', store.id, 'checklists'),
            orderBy('submittedAt', 'desc'), limit(1)
          )),
          getDocs(query(
            collection(db, 'stores', store.id, 'inventory'),
          )),
        ])

        const revenue      = crSnap.docs.reduce((s, d) => s + (Number(d.data().difference) || 0), 0)
        const lastChecklist = clSnap.docs[0]?.data()?.submittedAt || null
        const stockDoc      = invSnap.docs.find(d => d.id === 'stock')
        const items         = stockDoc ? Object.values(stockDoc.data() || {}) : []
        const lowStock      = items.filter(i => i.active !== false && i.qty <= (i.par * 0.5)).length

        result[store.id] = { revenue, lastChecklist, lowStock, totalItems: items.filter(i => i.active !== false).length }
      } catch (e) {
        result[store.id] = { revenue: 0, lastChecklist: null, lowStock: 0, totalItems: 0 }
      }
    }))

    setMetrics(result)
    setLoadingMet(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6B7F78' }}>Loading…</div>

  const activeStores  = stores.filter(s => s.status !== 'inactive')
  const pendingStores = stores.filter(s => s.status === 'pending')
  const activeUsers   = users.filter(u => u.status !== 'inactive' && u.role !== 'super_owner')
  const inactiveUsers = users.filter(u => u.status === 'inactive')
  const card          = { background: '#fff', border: '1px solid #E3DDD0', borderRadius: 12, padding: 16 }
  const today         = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const thisMonth     = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1A4C48' }}>HQ Dashboard</div>
        <div style={{ fontSize: 12, color: '#6B7F78', marginTop: 3 }}>{today}</div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Total Stores',     value: activeStores.length,  color: '#C1683C', sub: pendingStores.length ? `${pendingStores.length} pending` : 'all active' },
          { label: 'Active Users',     value: activeUsers.length,   color: '#27AE60', sub: inactiveUsers.length ? `${inactiveUsers.length} inactive` : 'all active' },
          { label: 'Open Invitations', value: invitations.length,   color: invitations.length > 0 ? '#2980B9' : '#6B7F78', sub: invitations.length > 0 ? 'awaiting sign-up' : 'none pending' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: 40, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1A4C48', marginTop: 8 }}>{label}</div>
            <div style={{ fontSize: 11, color: '#6B7F78', marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Multi-store Comparison ──────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7F78', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>
        Store Comparison — {thisMonth}
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 28 }}>
        {activeStores.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#6B7F78', fontSize: 13 }}>No stores yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#FAFAF8', borderBottom: '2px solid #E3DDD0' }}>
                  {['Store', 'Revenue (this month)', 'Last Checklist', 'Low Stock', 'Users', ''].map((h, i) => (
                    <th key={i} style={{ padding: '11px 16px', textAlign: i === 0 ? 'left' : 'center', color: '#6B7F78', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeStores.map(store => {
                  const m          = metrics[store.id]
                  const storeUsers = users.filter(u => (u.storeId || u.store) === store.id && u.status !== 'inactive')
                  const ago        = m ? daysAgo(m.lastChecklist) : null
                  const agoColor   = !ago ? '#aaa' : ago === 'Today' || ago === 'Yesterday' ? '#276749' : '#C53030'

                  return (
                    <tr key={store.id} style={{ borderTop: '1px solid #E3DDD0' }}>
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#1A4C48', fontSize: 14 }}>{store.name}</div>
                        {store.address && <div style={{ fontSize: 11, color: '#6B7F78', marginTop: 1 }}>{store.address}</div>}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                        {loadingMet ? (
                          <span style={{ color: '#ccc', fontSize: 12 }}>…</span>
                        ) : (
                          <span style={{ fontWeight: 700, fontSize: 15, color: (m?.revenue || 0) > 0 ? '#276749' : '#aaa' }}>
                            {m?.revenue > 0 ? fmt(m.revenue) : '—'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                        {loadingMet ? (
                          <span style={{ color: '#ccc', fontSize: 12 }}>…</span>
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 600, color: agoColor }}>
                            {ago || '—'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                        {loadingMet ? (
                          <span style={{ color: '#ccc', fontSize: 12 }}>…</span>
                        ) : (
                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: (m?.lowStock || 0) > 0 ? '#C53030' : '#276749',
                          }}>
                            {m ? (m.lowStock > 0 ? `${m.lowStock} low` : '✓ OK') : '—'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'center', color: '#555', fontSize: 13 }}>
                        {storeUsers.length}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                        <button onClick={() => onViewStore(store.id)} style={{
                          background: '#1A4C48', color: '#fff', border: 'none',
                          borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}>
                          View Ops →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {!loadingMet && activeStores.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #E3DDD0', background: '#FAFAF8' }}>
                    <td style={{ padding: '11px 16px', fontWeight: 700, color: '#1A4C48', fontSize: 13 }}>Total</td>
                    <td style={{ padding: '11px 16px', textAlign: 'center', fontWeight: 700, color: '#276749', fontSize: 14 }}>
                      {fmt(activeStores.reduce((s, st) => s + (metrics[st.id]?.revenue || 0), 0))}
                    </td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Store cards */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7F78', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>
        Stores
      </div>
      {activeStores.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: '#6B7F78', padding: 48 }}>
          No stores yet. Go to <strong>Stores</strong> to create one.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, marginBottom: 28 }}>
          {activeStores.map(store => {
            const storeUsers = users.filter(u => (u.storeId || u.store) === store.id && u.status !== 'inactive')
            return (
              <div key={store.id}
                onClick={() => onViewStore(store.id)}
                style={{ ...card, cursor: 'pointer', borderLeft: '4px solid #C1683C', transition: 'transform 0.12s, box-shadow 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1A4C48', marginBottom: 4 }}>{store.name}</div>
                <div style={{ fontSize: 11, color: '#6B7F78', marginBottom: 12 }}>
                  {storeUsers.length} active user{storeUsers.length !== 1 ? 's' : ''}
                  {store.address ? ` · ${store.address}` : ''}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, borderRadius: 4, padding: '2px 8px',
                    background: store.status === 'active' ? '#E8F5E9' : '#FFF3E0',
                    color:      store.status === 'active' ? '#27AE60' : '#C1683C',
                  }}>
                    {store.status || 'active'}
                  </span>
                  <span style={{ fontSize: 11, color: '#C1683C', fontWeight: 700 }}>View Ops →</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7F78', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>
            Pending Invitations ({invitations.length})
          </div>
          {invitations.map(inv => (
            <div key={inv.id} style={{ ...card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A4C48' }}>{inv.email}</div>
                <div style={{ fontSize: 11, color: '#6B7F78' }}>
                  {inv.storeName} · {(inv.role || '').replace(/_/g, ' ')} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#2980B9', background: '#E3F2FD', borderRadius: 4, padding: '2px 8px', flexShrink: 0 }}>
                Pending
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
