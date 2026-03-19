import { useEffect, useState } from 'react'
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { STORES } from '../data/inventory'

export default function Dashboard({ invHook, viewingStore, setActiveTab, auth }) {
  const { inventory, getStatus } = invHook
  const [lastSale, setLastSale] = useState(null)
  const store = STORES[viewingStore] || {}

  const active   = inventory.filter(i => i.active !== false)
  const critical = active.filter(i => getStatus(i) === 'critical')
  const low      = active.filter(i => getStatus(i) === 'low')
  const ok       = active.filter(i => getStatus(i) === 'ok')
  const totalValue = active.reduce((s,i) => s + (i.stock||0) * (i.cost||0), 0)

  const iceCreamItems = inventory.filter(i => i.cat === 'Ice Cream' && i.active !== false)
  const totalTubs   = iceCreamItems.reduce((s,i) => s + (i.stock||0), 0)
  const totalScoops = iceCreamItems.reduce((s,i) => s + (i.stock||0) * (i.scoops_per_bucket||60), 0)
  const lowFlavors  = iceCreamItems.filter(i => getStatus(i) !== 'ok')

  useEffect(() => {
    loadLastSale()
  }, [viewingStore])

  async function loadLastSale() {
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'salesLedger'),
        orderBy('appliedAt','desc'),
        limit(1)
      )
      const snap = await getDocs(q)
      if (!snap.empty) setLastSale(snap.docs[0].data())
    } catch(e) {}
  }

  const cogsPct = lastSale ? 25.8 : null // TODO: calculate from actual data

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* Store header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:'var(--dark)' }}>{store.name || viewingStore}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>
             {new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>Today</div>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>
            {new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="stat-grid">
        <div className="stat-card" style={{cursor:'pointer'}} onClick={() => setActiveTab('inventory')}>
          <div className="stat-num" style={{color:'var(--red-alert)'}}>{critical.length}</div>
          <div className="stat-label"> Order Now</div>
        </div>
        <div className="stat-card" style={{cursor:'pointer'}} onClick={() => setActiveTab('inventory')}>
          <div className="stat-num" style={{color:'var(--amber)'}}>{low.length}</div>
          <div className="stat-label"> Running Low</div>
        </div>
        <div className="stat-card" style={{cursor:'pointer'}} onClick={() => setActiveTab('inventory')}>
          <div className="stat-num" style={{color:'var(--green-ok)'}}>{ok.length}</div>
          <div className="stat-label"> OK</div>
        </div>
        <div className="stat-card">
          <div className="stat-num" style={{fontSize:18, color:'var(--caramel)'}}>
            ${totalValue.toLocaleString('en-US',{maximumFractionDigits:0})}
          </div>
          <div className="stat-label">Stock Value</div>
        </div>
      </div>

      {/* Sales + COGS */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div className="admin-card" style={{cursor:'pointer'}} onClick={() => setActiveTab('sales')}>
          <div className="admin-card-title"> Last Sales Upload</div>
          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
            {lastSale ? lastSale.period || new Date(lastSale.appliedAt).toLocaleDateString() : 'No upload yet'}
          </div>
          <div style={{fontSize:20,fontWeight:700,color:'var(--green-ok)',marginTop:4}}>
            {lastSale ? '$' + (lastSale.revenue||0).toLocaleString('en-US',{maximumFractionDigits:0}) : '—'}
          </div>
        </div>
        <div className="admin-card" style={{cursor:'pointer'}} onClick={() => setActiveTab('cogs')}>
          <div className="admin-card-title"> COGS</div>
          <div style={{
            fontSize:20, fontWeight:700, marginTop:4,
            color: cogsPct ? (cogsPct < 25 ? 'var(--green-ok)' : cogsPct < 32 ? 'var(--caramel)' : 'var(--red-alert)') : 'var(--text-muted)'
          }}>
            {cogsPct ? cogsPct.toFixed(1) + '%' : '—'}
          </div>
          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
            {cogsPct ? (cogsPct < 25 ? ' Excellent' : cogsPct < 32 ? ' Within benchmark' : ' High') : 'Upload CSV to calculate'}
          </div>
        </div>
      </div>

      {/* Ice Cream */}
      <div className="admin-card" style={{cursor:'pointer'}} onClick={() => setActiveTab('inventory')}>
        <div className="admin-card-title"> Ice Cream Stock</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, margin:'8px 0' }}>
          {[
            { label:'Tubs',    value: totalTubs.toFixed(1) },
            { label:'Scoops',  value: Math.round(totalScoops) },
            { label:'Flavors', value: iceCreamItems.length },
          ].map(({ label, value }) => (
            <div key={label} style={{textAlign:'center'}}>
              <div style={{fontSize:18,fontWeight:700,color:'var(--caramel)'}}>{value}</div>
              <div style={{fontSize:10,color:'var(--text-muted)'}}>{label}</div>
            </div>
          ))}
        </div>
        {lowFlavors.length > 0
          ? <div style={{fontSize:11,color:'var(--red-alert)'}}> Low: {lowFlavors.slice(0,3).map(i=>i.name).join(', ')}</div>
          : <div style={{fontSize:11,color:'var(--green-ok)'}}> All flavors stocked</div>
        }
      </div>

      {/* Needs attention */}
      <div className="admin-card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div className="admin-card-title" style={{margin:0}}> Needs Attention</div>
          <button
            onClick={() => setActiveTab('orders')}
            style={{fontSize:11,color:'var(--caramel)',background:'none',border:'none',cursor:'pointer',fontWeight:600}}
          >
            View Orders
          </button>
        </div>
        {[...critical,...low].length === 0 ? (
          <div style={{textAlign:'center',padding:'16px',color:'var(--green-ok)',fontSize:13}}>
             All items well stocked!
          </div>
        ) : (
          [...critical,...low].slice(0,8).map(item => (
            <div key={item.id} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'8px 0', borderBottom:'1px solid var(--border)'
            }}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:'var(--dark)'}}>{item.name}</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>{item.code} · {item.vendor}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{
                  fontSize:13, fontWeight:700,
                  color: getStatus(item) === 'critical' ? 'var(--red-alert)' : 'var(--amber)'
                }}>
                  {item.stock} {item.uom}
                </div>
                <div style={{fontSize:10,color:'var(--text-muted)'}}>PAR: {item.par}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick actions */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <button className="btn-primary" onClick={() => setActiveTab('sales')}> Upload Sales</button>
        <button className="btn-secondary" onClick={() => setActiveTab('delivery')}> Log Delivery</button>
      </div>
    </div>
  )
}
