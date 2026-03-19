# Stop any running processes and rewrite all files

# src\App.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\App.jsx"),
  @`"
import { useState, useEffect } from 'react'
import { useAuth }      from './hooks/useAuth'
import { useInventory } from './hooks/useInventory'
import { useToast }     from './hooks/useToast'

import LoginScreen  from './components/LoginScreen'
import Layout       from './components/Layout'
import Dashboard    from './components/Dashboard'
import Inventory    from './components/Inventory'
import Orders       from './components/Orders'
import Sales        from './components/Sales'
import Delivery     from './components/Delivery'
import COGS         from './components/COGS'
import Schedule     from './components/Schedule'
import Admin        from './components/Admin'

export default function App() {
  const auth        = useAuth()
  const invHook     = useInventory()
  const { toast, showToast } = useToast()
  const [activeTab,    setActiveTab]    = useState('dashboard')
  const [viewingStore, setViewingStore] = useState('coppell')

  // Load inventory when user logs in or store changes
  useEffect(() => {
    if (auth.userConfig) {
      const store = viewingStore || auth.userConfig.store || 'coppell'
      setViewingStore(store)
      invHook.loadInventory(store)
    }
  }, [auth.userConfig, viewingStore])

  // Show loading
  if (auth.loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--cream)' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}></div>
          <div style={{ fontSize:14, color:'var(--text-muted)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!auth.user || !auth.userConfig) {
    return <LoginScreen auth={auth} />
  }

  // Pending approval
  if (auth.pending) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--cream)', padding:20 }}>
        <div style={{ textAlign:'center', maxWidth:360 }}>
          <div style={{ fontSize:40, marginBottom:16 }}></div>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--dark)', marginBottom:8 }}>Pending Approval</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:24 }}>Your account is waiting for approval. Please contact your store owner.</div>
          <button className="btn-primary" onClick={auth.logout}>Sign Out</button>
        </div>
      </div>
    )
  }

  const tabProps = {
    auth, invHook, viewingStore, setViewingStore,
    showToast, setActiveTab,
  }

  const tabs = [
    { id:'dashboard', label:'Dashboard' },
    { id:'inventory', label:'Inventory' },
    { id:'orders',    label:'Orders' },
    { id:'sales',     label:'Sales' },
    { id:'delivery',  label:'Delivery' },
    { id:'cogs',      label:'COGS' },
    { id:'schedule',  label:'Schedule' },
    ...(auth.isSuperOwner() ? [{ id:'admin', label:'Admin' }] : []),
  ]

  return (
    <Layout
      auth={auth}
      tabs={tabs}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      viewingStore={viewingStore}
      setViewingStore={setViewingStore}
    >
      {activeTab === 'dashboard' && <Dashboard {...tabProps} />}
      {activeTab === 'inventory' && <Inventory {...tabProps} />}
      {activeTab === 'orders'    && <Orders    {...tabProps} />}
      {activeTab === 'sales'     && <Sales     {...tabProps} />}
      {activeTab === 'delivery'  && <Delivery  {...tabProps} />}
      {activeTab === 'cogs'      && <COGS      {...tabProps} />}
      {activeTab === 'schedule'  && <Schedule  {...tabProps} />}
      {activeTab === 'admin'     && <Admin     {...tabProps} />}

      {toast && <div className="toast">{toast}</div>}
    </Layout>
  )
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\components\Admin.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\components\Admin.jsx"),
  @`"
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
      showToast(`` `${req.email} approved``)
    } catch(e) { showToast(' Error approving') }
  }

  async function reject(req) {
    try {
      await deleteDoc(doc(db, 'signupRequests', req.id))
      setPending(prev => prev.filter(p => p.id !== req.id))
      showToast(`` `${req.email} rejected``)
    } catch(e) {}
  }

  return (
    <div>
      {/* Sub nav */}
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        <button className={``cat-btn `${view==='pending'?'active':''}``} onClick={() => setView('pending')}>
           Pending Signups {pending.length > 0 && ``(`${pending.length})``}
        </button>
        <button className={``cat-btn `${view==='stores'?'active':''}``} onClick={() => setView('stores')}>
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

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\components\COGS.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\components\COGS.jsx"),
  @`"
import { useState, useEffect } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { COGS_RATES } from '../data/inventory'

const MENU_MARGINS = [
  { name:'Kids Scoop',        cat:'Ice Cream', cost:1.20, sell:4.61 },
  { name:'Regular Scoop',     cat:'Ice Cream', cost:2.10, sell:6.72 },
  { name:'Milkshake',         cat:'Ice Cream', cost:4.20, sell:8.99 },
  { name:'Hand Packed',       cat:'Ice Cream', cost:4.00, sell:11.45 },
  { name:'Flight of 4',       cat:'Ice Cream', cost:3.00, sell:9.31 },
  { name:'Affogato',          cat:'Coffee',    cost:3.04, sell:6.25 },
  { name:'Milk Tea',          cat:'Drinks',    cost:0.67, sell:6.29 },
  { name:'Fruit Tea',         cat:'Drinks',    cost:0.67, sell:6.26 },
  { name:'Slush',             cat:'Drinks',    cost:0.67, sell:6.28 },
  { name:'Smoothie',          cat:'Drinks',    cost:0.67, sell:6.28 },
  { name:'Falooda',           cat:'Drinks',    cost:1.87, sell:7.94 },
  { name:'Americano',         cat:'Coffee',    cost:0.94, sell:3.25 },
  { name:'Latte/Cappuccino',  cat:'Coffee',    cost:1.31, sell:5.50 },
  { name:'Mocha',             cat:'Coffee',    cost:1.59, sell:5.95 },
  { name:'Specialty Coffee',  cat:'Coffee',    cost:1.84, sell:6.10 },
]

const CAT_COGS = {
  'Ice Cream': 0.27, 'Milk Tea': 0.11, 'Coffee & Specialty': 0.30,
  'Falooda': 0.24, 'Fruit Tea': 0.11, 'Slush': 0.11, 'Smoothie': 0.11, 'Bakery': 0.35,
}
const CAT_REVENUE_PCT = {
  'Ice Cream': 0.61, 'Milk Tea': 0.085, 'Coffee & Specialty': 0.12,
  'Falooda': 0.038, 'Fruit Tea': 0.026, 'Slush': 0.023, 'Smoothie': 0.009, 'Bakery': 0.052,
}

export default function COGS({ viewingStore }) {
  const [view,      setView]      = useState('report')
  const [salesData, setSalesData] = useState([])
  const [marginCat, setMarginCat] = useState('all')
  const [loading,   setLoading]   = useState(false)

  useEffect(() => { if (view === 'report') loadSalesData() }, [view, viewingStore])

  async function loadSalesData() {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'salesLedger'),
        orderBy('appliedAt','desc')
      )
      const snap = await getDocs(q)
      setSalesData(snap.docs.map(d => d.data()))
    } catch(e) {}
    setLoading(false)
  }

  const latest  = salesData[0]
  const revenue = latest?.revenue || 0

  let totalCOGS = 0
  const catBreakdown = Object.entries(CAT_REVENUE_PCT).map(([cat, pct]) => {
    const rev  = revenue * pct
    const cost = rev * (CAT_COGS[cat] || 0.20)
    totalCOGS += cost
    return { cat, rev, cost, pct: CAT_COGS[cat] * 100 }
  })

  const cogsPct    = revenue > 0 ? (totalCOGS / revenue * 100) : 0
  const grossProfit = revenue - totalCOGS

  const marginFiltered = marginCat === 'all' ? MENU_MARGINS
    : MENU_MARGINS.filter(i => i.cat === marginCat)

  return (
    <div>
      {/* Sub nav */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <button className={``cat-btn `${view==='report' ? 'active' : ''}``} onClick={() => setView('report')}>
           COGS Report
        </button>
        <button className={``cat-btn `${view==='margins' ? 'active' : ''}``} onClick={() => setView('margins')}>
           Menu Margins
        </button>
      </div>

      {/* COGS Report */}
      {view === 'report' && (
        <div>
          {loading && <div style={{textAlign:'center',padding:24,color:'var(--text-muted)'}}>Loading...</div>}

          {!loading && !latest && (
            <div style={{textAlign:'center',padding:32,background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:12}}>
              <div style={{fontSize:32,marginBottom:8}}></div>
              <div style={{fontSize:14,fontWeight:600,color:'var(--dark)',marginBottom:6}}>No Sales Data Yet</div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>Upload your Clover CSV in the Sales tab</div>
            </div>
          )}

          {!loading && latest && (
            <div>
              {latest.period && (
                <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12,textAlign:'center'}}>
                   {latest.period}
                </div>
              )}

              {/* KPI cards */}
              <div className="stat-grid" style={{marginBottom:12}}>
                <div className="stat-card">
                  <div className="stat-num" style={{color:'var(--green-ok)',fontSize:18}}>
                    `${revenue.toLocaleString('en-US',{maximumFractionDigits:0})}
                  </div>
                  <div className="stat-label">Net Sales</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num" style={{color:'var(--red-alert)',fontSize:18}}>
                    `${totalCOGS.toLocaleString('en-US',{maximumFractionDigits:0})}
                  </div>
                  <div className="stat-label">COGS</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num" style={{
                    fontSize:18,
                    color: cogsPct < 25 ? 'var(--green-ok)' : cogsPct < 32 ? 'var(--caramel)' : 'var(--red-alert)'
                  }}>
                    {cogsPct.toFixed(1)}%
                  </div>
                  <div className="stat-label">COGS %</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num" style={{color:'var(--green-ok)',fontSize:18}}>
                    `${grossProfit.toLocaleString('en-US',{maximumFractionDigits:0})}
                  </div>
                  <div className="stat-label">Gross Profit</div>
                </div>
              </div>

              {/* Benchmark */}
              <div className="card" style={{marginBottom:12,display:'flex',alignItems:'center',gap:12}}>
                <div style={{
                  width:10,height:10,borderRadius:'50%',flexShrink:0,
                  background: cogsPct < 25 ? 'var(--green-ok)' : cogsPct < 32 ? 'var(--caramel)' : 'var(--red-alert)'
                }} />
                <div style={{flex:1}}>
                  <div style={{
                    fontSize:13,fontWeight:700,
                    color: cogsPct < 25 ? 'var(--green-ok)' : cogsPct < 32 ? 'var(--caramel)' : 'var(--red-alert)'
                  }}>
                    {cogsPct < 25 ? 'Excellent' : cogsPct < 32 ? 'Good' : 'High'}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>
                    {cogsPct < 25 ? 'Below 25% — great food cost control'
                     : cogsPct < 32 ? '25-32% — within industry benchmark'
                     : 'Above 32% — review pricing or portions'}
                  </div>
                </div>
                <div style={{
                  fontSize:18,fontWeight:700,
                  color: cogsPct < 25 ? 'var(--green-ok)' : cogsPct < 32 ? 'var(--caramel)' : 'var(--red-alert)'
                }}>
                  {cogsPct.toFixed(1)}%
                </div>
              </div>

              {/* Category breakdown */}
              <div className="section-title">By Category</div>
              <div className="card" style={{marginBottom:12}}>
                {catBreakdown.sort((a,b)=>b.rev-a.rev).map(({ cat, rev, cost, pct }) => (
                  <div key={cat} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                      <span style={{fontSize:12,fontWeight:600,color:'var(--dark)'}}>{cat}</span>
                      <div style={{display:'flex',gap:12,fontSize:11}}>
                        <span style={{color:'var(--text-muted)'}}>`${rev.toLocaleString('en-US',{maximumFractionDigits:0})}</span>
                        <span style={{color:'var(--caramel)',fontWeight:700}}>{pct.toFixed(0)}% COGS</span>
                      </div>
                    </div>
                    <div style={{background:'#EDE0CC',borderRadius:4,height:4}}>
                      <div style={{background:'var(--caramel)',height:4,borderRadius:4,width:```${(rev/revenue*100).toFixed(0)}%``}} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload history */}
              <div className="section-title">Upload History</div>
              <div className="card">
                {salesData.map((d, idx) => (
                  <div key={idx} style={{display:'flex',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)',gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600,color:'var(--dark)'}}>{d.period || 'Upload'}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>
                        {d.itemsSold || 0} items · {new Date(d.appliedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--green-ok)'}}>
                        `${(d.revenue||0).toLocaleString('en-US',{maximumFractionDigits:0})}
                      </div>
                      <div style={{fontSize:11,color:'var(--caramel)'}}>25.8% COGS</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Menu Margins */}
      {view === 'margins' && (
        <div>
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
            {['all','Ice Cream','Drinks','Coffee'].map(cat => (
              <button
                key={cat}
                className={``cat-btn `${marginCat===cat ? 'active' : ''}``}
                onClick={() => setMarginCat(cat)}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
          {marginFiltered.map(item => {
            const margin  = ((item.sell - item.cost) / item.sell * 100)
            const cogsPct = (item.cost / item.sell * 100)
            const color   = cogsPct < 20 ? 'var(--green-ok)' : cogsPct < 30 ? 'var(--caramel)' : 'var(--red-alert)'
            return (
              <div key={item.name} style={{
                display:'flex',alignItems:'center',gap:10,
                padding:10,background:'var(--cream)',borderRadius:10,marginBottom:6
              }}>
                <div style={{fontSize:20}}>
                  {item.cat==='Ice Cream'?'':item.cat==='Coffee'?'':''}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--dark)'}}>{item.name}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>
                    Cost: `${item.cost.toFixed(2)} · Sell: `${item.sell.toFixed(2)}
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:16,fontWeight:700,color}}>{margin.toFixed(0)}%</div>
                  <div style={{fontSize:10,color:'var(--text-muted)'}}>margin</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\components\Dashboard.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\components\Dashboard.jsx"),
  @`"
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
            `${totalValue.toLocaleString('en-US',{maximumFractionDigits:0})}
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
            {lastSale ? '`$' + (lastSale.revenue||0).toLocaleString('en-US',{maximumFractionDigits:0}) : '—'}
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
            View Orders ->
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

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\components\Delivery.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\components\Delivery.jsx"),
  @`"
import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'

export default function Delivery({ invHook, viewingStore, showToast }) {
  const { inventory, adjustStock, saveInventory } = invHook
  const [deliveries, setDeliveries] = useState([])
  const [search,     setSearch]     = useState('')
  const [form,       setForm]       = useState({ itemId:'', qty:'', cost:'', note:'' })

  useEffect(() => { loadDeliveries() }, [viewingStore])

  async function loadDeliveries() {
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'deliveries'),
        orderBy('dateTs', 'desc')
      )
      const snap = await getDocs(q)
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {}
  }

  async function logDelivery() {
    const item = inventory.find(i => i.id === parseInt(form.itemId))
    if (!item || !form.qty) { showToast(' Select item and quantity'); return }

    const qty  = parseFloat(form.qty)
    const cost = parseFloat(form.cost) || 0

    // Update stock
    const updated = inventory.map(i =>
      i.id === item.id ? { ...i, stock: Math.round((i.stock + qty) * 100) / 100 } : i
    )
    await saveInventory(viewingStore, updated)
    invHook.loadInventory(viewingStore)

    // Log delivery
    const entry = {
      itemId:   item.id,
      itemName: item.name,
      qty, cost,
      note:     form.note,
      dateTs:   Date.now(),
      date:     new Date().toLocaleDateString(),
    }
    await addDoc(collection(db, 'stores', viewingStore, 'deliveries'), entry)
    setDeliveries(prev => [entry, ...prev])
    setForm({ itemId:'', qty:'', cost:'', note:'' })
    showToast(`` +`${qty} `${item.uom} `${item.name} logged``)
  }

  const filtered = deliveries.filter(d =>
    !search || d.itemName?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Manual entry form */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="section-title">Log Delivery</div>

        <select
          value={form.itemId}
          onChange={e => setForm(f => ({...f, itemId: e.target.value}))}
          style={{ marginBottom:8 }}
        >
          <option value="">— Select item —</option>
          {inventory.filter(i => i.active !== false).map(i => (
            <option key={i.id} value={i.id}>{i.name} ({i.uom})</option>
          ))}
        </select>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
          <input
            type="number"
            placeholder="Quantity received"
            value={form.qty}
            onChange={e => setForm(f => ({...f, qty: e.target.value}))}
          />
          <input
            type="number"
            placeholder="Unit cost `$"
            value={form.cost}
            onChange={e => setForm(f => ({...f, cost: e.target.value}))}
          />
        </div>
        <input
          type="text"
          placeholder="Note (optional)"
          value={form.note}
          onChange={e => setForm(f => ({...f, note: e.target.value}))}
          style={{ marginBottom:12 }}
        />
        <button className="btn-primary" onClick={logDelivery}>
          + Log Delivery
        </button>
      </div>

      {/* Delivery history */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <div className="section-title" style={{ margin:0 }}>Delivery Log</div>
          <input
            className="search-bar"
            placeholder="🔍 Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex:1 }}
          />
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
            No deliveries logged yet
          </div>
        ) : (
          filtered.map((d, idx) => (
            <div key={d.id || idx} className="card" style={{ marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{d.itemName}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{d.date} {d.note ? ``· `${d.note}`` : ''}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--green-ok)' }}>+{d.qty}</div>
                  {d.cost > 0 && <div style={{ fontSize:11, color:'var(--text-muted)' }}>`${d.cost}/unit</div>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\components\Inventory.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\components\Inventory.jsx"),
  @`"
import { useState, useRef } from 'react'

export default function Inventory({ invHook, viewingStore, showToast }) {
  const { inventory, getStatus, adjustStock, setStock, toggleActive, setPar, saveInventory } = invHook
  const [activeCategory,  setActiveCategory]  = useState('all')
  const [search,          setSearch]          = useState('')
  const [showInactive,    setShowInactive]     = useState(false)
  const [editingPar,      setEditingPar]       = useState(null)
  const saveTimer = useRef(null)

  const categories = ['all', ...[...new Set(inventory.map(i => i.cat))]]

  const filtered = inventory.filter(i => {
    const catMatch    = activeCategory === 'all' || i.cat === activeCategory
    const searchMatch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.code.toLowerCase().includes(search.toLowerCase())
    const activeMatch = showInactive || i.active !== false
    return catMatch && searchMatch && activeMatch
  })

  // Ice cream totals
  const iceCreamItems    = inventory.filter(i => i.cat === 'Ice Cream' && i.active !== false)
  const inactiveIceCream = inventory.filter(i => i.cat === 'Ice Cream' && i.active === false)
  const totalTubs   = iceCreamItems.reduce((s,i) => s + (i.stock||0), 0)
  const totalScoops = iceCreamItems.reduce((s,i) => s + (i.stock||0) * (i.scoops_per_bucket||60), 0)
  const totalValue  = iceCreamItems.reduce((s,i) => s + (i.stock||0) * (i.cost||0), 0)

  function handleAdjust(id, delta) {
    adjustStock(id, delta)
    scheduleSave()
  }

  function handleSetStock(id, value) {
    setStock(id, value)
    scheduleSave()
  }

  function scheduleSave() {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await saveInventory(viewingStore, inventory)
    }, 1200)
  }

  async function handleToggleActive(id) {
    toggleActive(id)
    await saveInventory(viewingStore, inventory.map(i => i.id === id ? {...i, active: i.active === false ? true : false} : i))
    showToast(' Updated')
  }

  async function handleSetPar(id, value) {
    setPar(id, value)
    setEditingPar(null)
    await saveInventory(viewingStore, inventory.map(i => i.id === id ? {...i, par: parseInt(value)||0} : i))
    showToast(' PAR updated')
  }

  function statusPill(status) {
    if (status === 'critical') return <span className="pill pill-critical"> Critical</span>
    if (status === 'low')      return <span className="pill pill-low"> Low</span>
    return <span className="pill pill-ok"> OK</span>
  }

  return (
    <div>
      {/* Search + actions */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
        <input
          className="search-bar"
          placeholder="🔍 Search items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex:1, minWidth:160, marginBottom:0 }}
        />
      </div>

      {/* Category filter */}
      <div className="filter-bar" style={{ marginBottom:12 }}>
        {categories.map(cat => (
          <button
            key={cat}
            className={``cat-btn `${activeCategory === cat ? 'active' : ''}``}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Ice Cream totals banner */}
      {activeCategory === 'Ice Cream' && (
        <div>
          <div style={{
            background:'var(--dark)', borderRadius:12, padding:'12px 16px',
            marginBottom:10, display:'grid', gridTemplateColumns:'repeat(3,1fr)',
            gap:8, textAlign:'center'
          }}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:'#D4A843'}}>{totalTubs.toFixed(1)}</div>
              <div style={{fontSize:10,color:'#aaa',textTransform:'uppercase'}}>Total Tubs</div>
            </div>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:'var(--caramel)'}}>{Math.round(totalScoops)}</div>
              <div style={{fontSize:10,color:'#aaa',textTransform:'uppercase'}}>Total Scoops</div>
            </div>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:'var(--green-ok)'}}>`${totalValue.toFixed(0)}</div>
              <div style={{fontSize:10,color:'#aaa',textTransform:'uppercase'}}>Stock Value</div>
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:12,color:'var(--text-muted)'}}>
              {iceCreamItems.length} active flavors{inactiveIceCream.length > 0 ? `` · `${inactiveIceCream.length} inactive`` : ''}
            </div>
            {inactiveIceCream.length > 0 && (
              <button
                onClick={() => setShowInactive(!showInactive)}
                style={{fontSize:11,padding:'4px 10px',border:'1px solid var(--border)',borderRadius:6,background:'none',cursor:'pointer',color:'var(--text-muted)'}}
              >
                {showInactive ? 'Hide Inactive' : ``Show Inactive (`${inactiveIceCream.length})``}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Inventory grid */}
      <div className="inventory-grid">
        {filtered.map(item => {
          const s       = getStatus(item)
          const pct     = Math.min(100, (item.stock / (item.par * 2)) * 100)
          const barCls  = s === 'ok' ? 'fill-green' : s === 'low' ? 'fill-amber' : 'fill-red'
          const inactive = item.active === false

          return (
            <div key={item.id} className="item-card" style={{ opacity: inactive ? 0.5 : 1 }}>
              {/* Top row */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:14, fontWeight:600, color:'var(--dark)' }}>{item.name}</span>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  {inactive && <span style={{fontSize:10,background:'#8B7355',color:'#fff',padding:'2px 6px',borderRadius:10}}>Inactive</span>}
                  {!inactive && statusPill(s)}
                </div>
              </div>

              {/* Bar + vendor */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <div className="stock-bar">
                  <div className={``stock-bar-fill `${barCls}``} style={{ width:```${pct}%`` }} />
                </div>
                <span className="vendor-tag">{item.vendor}</span>
              </div>

              {/* Controls */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <button className="btn-adj" onClick={() => handleAdjust(item.id, -1)}>−</button>
                  <input
                    type="number"
                    value={item.stock}
                    onChange={e => handleSetStock(item.id, e.target.value)}
                    style={{
                      width:52, textAlign:'center', fontWeight:700,
                      fontSize:16, padding:'4px 6px',
                      border:'1px solid var(--border)', borderRadius:8,
                      background:'var(--cream)'
                    }}
                  />
                  <button className="btn-adj" onClick={() => handleAdjust(item.id, 1)}>+</button>
                </div>
                <div style={{ textAlign:'right' }}>
                  {editingPar === item.id ? (
                    <input
                      type="number"
                      defaultValue={item.par}
                      autoFocus
                      onBlur={e => handleSetPar(item.id, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSetPar(item.id, e.target.value)}
                      style={{ width:60, padding:'2px 6px', fontSize:11, textAlign:'center' }}
                    />
                  ) : (
                    <div
                      style={{ fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}
                      onClick={() => setEditingPar(item.id)}
                      title="Tap to edit PAR"
                    >
                      Par: {item.par} {item.uom} 
                    </div>
                  )}
                  <div style={{ fontSize:10, color:'#aaa' }}>{item.code}</div>
                  <button
                    onClick={() => handleToggleActive(item.id)}
                    style={{
                      fontSize:10, color: inactive ? 'var(--green-ok)' : 'var(--red-alert)',
                      background:'none', border:'none', cursor:'pointer', padding:0, marginTop:2
                    }}
                  >
                    {inactive ? '✓ Activate' : 'x Set Inactive'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\components\Layout.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\components\Layout.jsx"),
  @`"
import { STORES } from '../data/inventory'

export default function Layout({ auth, tabs, activeTab, setActiveTab, viewingStore, setViewingStore, children }) {
  const store = STORES[viewingStore] || {}

  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{
        background: 'var(--dark)',
        padding: '12px 16px 0',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:22, color:'#fff' }}>Dumont</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>v18</span>
            {auth.isSuperOwner() ? (
              <select
                value={viewingStore}
                onChange={e => setViewingStore(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '4px 8px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {Object.entries(STORES).map(([id, s]) => (
                  <option key={id} value={id} style={{ background:'#2C1810' }}>{s.name}</option>
                ))}
              </select>
            ) : (
              <span style={{
                background: 'rgba(200,132,58,0.3)',
                border: '1px solid rgba(200,132,58,0.5)',
                color: '#D4A843',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
              }}>
                {store.name || viewingStore}
              </span>
            )}
            <button
              onClick={auth.logout}
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.7)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="tab-bar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={``tab-btn `${activeTab === tab.id ? 'active' : ''}``}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, padding:'16px 16px 40px', maxWidth:900, width:'100%', margin:'0 auto' }}>
        {children}
      </div>
    </div>
  )
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\components\LoginScreen.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\components\LoginScreen.jsx"),
  @`"
import { useState } from 'react'

export default function LoginScreen({ auth }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [isSignup, setIsSignup] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    auth.login(email, password)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:42, color:'#fff', letterSpacing:2 }}>
            Dumont
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginTop:4 }}>
            Creamery & Café — Inventory v18
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 28,
        }}>
          <h2 style={{ color:'#fff', fontSize:18, fontWeight:600, marginBottom:20 }}>
            Sign in to continue
          </h2>

          {auth.error && (
            <div style={{
              background: 'rgba(231,76,60,0.15)',
              border: '1px solid rgba(231,76,60,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#ff6b6b',
              fontSize: 13,
              marginBottom: 16,
            }}>
              {auth.error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:12 }}>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', color:'#fff' }}
                required
              />
            </div>
            <div style={{ marginBottom:20 }}>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', color:'#fff' }}
                required
              />
            </div>
            <button type="submit" className="btn-secondary" style={{ width:'100%' }}>
              Sign In
            </button>
          </form>
        </div>

        <div style={{ textAlign:'center', marginTop:20, fontSize:12, color:'rgba(255,255,255,0.3)' }}>
          v18 · Dumont Creamery & Café
        </div>
      </div>
    </div>
  )
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\components\Orders.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\components\Orders.jsx"),
  @`"
export default function Orders({ invHook, showToast }) {
  const { inventory, getStatus } = invHook

  const activeInventory = inventory.filter(i => i.active !== false)
  const karat     = activeInventory.filter(i => getStatus(i) !== 'ok' && i.vendor === 'KARAT')
  const hyperpack = activeInventory.filter(i => getStatus(i) !== 'ok' && i.vendor === 'HYPERPACK')
  const local     = activeInventory.filter(i => getStatus(i) !== 'ok' && i.vendor === 'LOCAL')
  const brand     = activeInventory.filter(i => getStatus(i) !== 'ok' && i.vendor === 'Brand')

  function copyOrder(items, title) {
    const text = ```${title} — `${new Date().toLocaleDateString()}\n\n`` +
      items.map(i => ``• `${i.name} (`${i.code}) — `${i.order_qty}``).join('\n')
    navigator.clipboard.writeText(text)
      .then(() => showToast(' Copied to clipboard!'))
      .catch(() => showToast(' Copy failed'))
  }

  if (!karat.length && !hyperpack.length && !local.length && !brand.length) {
    return (
      <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-muted)' }}>
        <div style={{ fontSize:40, marginBottom:12 }}></div>
        <div style={{ fontSize:16, fontWeight:600, color:'var(--dark)' }}>All stocked up!</div>
        <div style={{ fontSize:13, marginTop:6 }}>Nothing to order right now.</div>
      </div>
    )
  }

  function Section({ title, items, emoji }) {
    if (!items.length) return null
    return (
      <div style={{ marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--dark)' }}>
            {emoji} {title} <span style={{ fontSize:12, color:'var(--text-muted)', fontWeight:400 }}>({items.length} items)</span>
          </div>
        </div>
        <div className="card" style={{ marginBottom:8 }}>
          {items.map((item, idx) => (
            <div key={item.id} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'10px 0',
              borderBottom: idx < items.length-1 ? '1px solid var(--border)' : 'none'
            }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{item.name}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{item.code}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--caramel)' }}>{item.order_qty}</div>
                <div style={{
                  fontSize:10,
                  color: getStatus(item) === 'critical' ? 'var(--red-alert)' : 'var(--amber)'
                }}>
                  Stock: {item.stock} {item.uom}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          className="btn-primary"
          onClick={() => copyOrder(items, title)}
          style={{ fontSize:13 }}
        >
           Copy {title} Order
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16 }}>
        Items below PAR level — tap Copy to send order
      </div>
      <Section title="Karat Order"      items={karat}     emoji="" />
      <Section title="Hyperpack Order"  items={hyperpack} emoji="" />
      <Section title="Local / Grocery"  items={local}     emoji="" />
      <Section title="Brand Ice Cream"  items={brand}     emoji="" />
    </div>
  )
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\components\Sales.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\components\Sales.jsx"),
  @`"
import { useState } from 'react'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { matchCloverItem, ITEM_SIZES } from '../data/recipes'

export default function Sales({ invHook, viewingStore, showToast }) {
  const { inventory, saveInventory } = invHook
  const [results,  setResults]  = useState(null)
  const [loading,  setLoading]  = useState(false)

  function parseCloverCSV(text) {
    const lines = text.split('\n').map(l => l.trim())
    let periodLabel = ''
    for (let i = 0; i < 5; i++) {
      if (lines[i] && lines[i].includes('202')) {
        periodLabel = lines[i].replace(/"/g, '')
        break
      }
    }
    const salesData = []
    for (const line of lines) {
      if (!line.startsWith(',')) continue
      const cols = line.split(',').map(c => c.replace(/"/g,'').trim())
      if (cols.length < 5) continue
      const name = cols[1]
      const sold = parseInt(cols[4])
      const netSales = parseFloat(cols[3].replace('`$','').replace(',','')) || 0
      if (!name || name === 'Name' || isNaN(sold) || sold <= 0) continue
      salesData.push({ name, sold, netSales })
    }
    return { salesData, periodLabel }
  }

  function calculateDeductions(salesData) {
    const matched = [], unmatched = []
    let totalSales = 0

    salesData.forEach(({ name, sold, netSales }) => {
      totalSales += netSales
      const recipe = matchCloverItem(name)
      if (recipe) matched.push({ name, sold, netSales, recipe })
      else unmatched.push({ name, sold, netSales })
    })

    // Aggregate ingredient totals
    const ingredientTotals = {}
    matched.forEach(({ name, sold, recipe }) => {
      recipe.forEach(({ item, qty, unit }) => {
        if (!ingredientTotals[item]) ingredientTotals[item] = { qty: 0, unit }
        ingredientTotals[item].qty += qty * sold
      })
    })

    // Convert to inventory units
    const deductions = []
    Object.entries(ingredientTotals).forEach(([itemName, data]) => {
      const invItem = inventory.find(i => i.name === itemName)
      let deductUnits = 0, deductDisplay = ''

      if (data.unit === 'scoop') {
        const scoopsPerBucket = invItem?.scoops_per_bucket || 60
        deductUnits   = data.qty / scoopsPerBucket
        deductDisplay = ```${data.qty.toFixed(0)} scoops = `${deductUnits.toFixed(2)} tubs``
      } else if (data.unit === 'g' && ITEM_SIZES[itemName]) {
        deductUnits   = data.qty / ITEM_SIZES[itemName]
        deductDisplay = ```${data.qty.toFixed(0)}g = `${deductUnits.toFixed(2)} bags/bottles``
      } else if (data.unit === 'ml' && itemName === 'Milk') {
        deductUnits   = data.qty / 3785
        deductDisplay = ```${(data.qty/1000).toFixed(1)}L = `${deductUnits.toFixed(2)} gallons``
      } else {
        deductUnits   = data.qty
        deductDisplay = ```${data.qty.toFixed(2)} `${data.unit}``
      }

      deductions.push({
        itemName, invItem, deductUnits, deductDisplay,
        currentStock: invItem ? invItem.stock : null,
        newStock:     invItem ? Math.max(0, invItem.stock - deductUnits) : null,
        belowPar:     invItem ? (invItem.stock - deductUnits) < invItem.par : false,
      })
    })

    return { matched, unmatched, deductions, totalSales }
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const { salesData, periodLabel } = parseCloverCSV(ev.target.result)
      if (!salesData.length) {
        showToast(' Could not parse CSV')
        setLoading(false)
        return
      }
      const { matched, unmatched, deductions, totalSales } = calculateDeductions(salesData)
      setResults({ matched, unmatched, deductions, totalSales, periodLabel })
      setLoading(false)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function applyDeductions() {
    if (!results) return
    const updatedInventory = inventory.map(item => {
      const ded = results.deductions.find(d => d.itemName === item.name)
      if (!ded || ded.newStock === null) return item
      return { ...item, stock: Math.round(ded.newStock * 100) / 100 }
    })
    await saveInventory(viewingStore, updatedInventory)
    invHook.loadInventory(viewingStore)

    // Save to sales ledger
    try {
      await addDoc(collection(db, 'stores', viewingStore, 'salesLedger'), {
        period:       results.periodLabel,
        revenue:      results.totalSales,
        itemsSold:    results.matched.reduce((s,r) => s+r.sold, 0),
        matchedItems: results.matched.length,
        appliedAt:    Date.now(),
        dateTs:       Date.now(),
      })
    } catch(e) {}

    showToast(`` Inventory updated — `${results.deductions.filter(d=>d.invItem).length} items deducted``)
    setResults(null)
  }

  const matchPct = results ? Math.round(results.matched.length / (results.matched.length + results.unmatched.length) * 100) : 0

  return (
    <div>
      {/* Upload zone */}
      <label style={{ display:'block', cursor:'pointer' }}>
        <div className="scan-zone" style={{ marginBottom:16 }}>
          <div style={{ fontSize:36, marginBottom:8 }}></div>
          <div className="scan-zone-title">Upload Clover Sales Report</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
            Tap to select CSV file (.csv)
          </div>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display:'none' }} />
        </div>
      </label>

      {loading && (
        <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>
           Reading Clover report...
        </div>
      )}

      {/* Results */}
      {results && (
        <div>
          {/* Summary */}
          <div style={{
            background:'var(--dark)', borderRadius:12, padding:'14px 16px',
            marginBottom:12, display:'grid', gridTemplateColumns:'repeat(3,1fr)',
            gap:8, textAlign:'center'
          }}>
            <div>
              <div style={{fontSize:20,fontWeight:700,color:'#D4A843'}}>
                `${results.totalSales.toLocaleString('en-US',{maximumFractionDigits:0})}
              </div>
              <div style={{fontSize:10,color:'#aaa',textTransform:'uppercase'}}>Net Sales</div>
            </div>
            <div>
              <div style={{fontSize:20,fontWeight:700,color:'var(--green-ok)'}}>
                {results.matched.reduce((s,r)=>s+r.sold,0)}
              </div>
              <div style={{fontSize:10,color:'#aaa',textTransform:'uppercase'}}>Items Sold</div>
            </div>
            <div>
              <div style={{fontSize:20,fontWeight:700,color:'var(--caramel)'}}>{matchPct}%</div>
              <div style={{fontSize:10,color:'#aaa',textTransform:'uppercase'}}>Matched</div>
            </div>
          </div>

          {results.periodLabel && (
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:12,textAlign:'center'}}>
               {results.periodLabel}
            </div>
          )}

          {/* Deductions */}
          <div className="section-title"> Inventory to Deduct</div>
          {results.deductions.map(d => (
            <div key={d.itemName} style={{
              display:'flex', alignItems:'center', gap:10,
              padding:10, background:'var(--cream)', borderRadius:10,
              marginBottom:6,
              borderLeft: ``4px solid `${!d.invItem ? '#ccc' : d.belowPar ? 'var(--red-alert)' : 'var(--green-ok)'}``
            }}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--dark)'}}>{d.itemName}</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>Used: {d.deductDisplay}</div>
              </div>
              <div style={{textAlign:'right'}}>
                {d.invItem ? (
                  <>
                    <div style={{fontSize:12,color:'var(--text-muted)'}}>
                      {d.currentStock?.toFixed(1)} -> <strong style={{color: d.belowPar ? 'var(--red-alert)' : 'var(--green-ok)'}}>
                        {d.newStock?.toFixed(1)}
                      </strong>
                    </div>
                    {d.belowPar && <div style={{fontSize:10,color:'var(--red-alert)'}}> Below PAR</div>}
                  </>
                ) : (
                  <div style={{fontSize:11,color:'#aaa'}}>Not in inventory</div>
                )}
              </div>
            </div>
          ))}

          {/* Unmatched */}
          {results.unmatched.length > 0 && (
            <details style={{marginTop:10,marginBottom:16}}>
              <summary style={{fontSize:12,color:'var(--text-muted)',cursor:'pointer'}}>
                {results.unmatched.length} items not matched (Bakery, Custom etc.)
              </summary>
              <div style={{marginTop:6}}>
                {results.unmatched.slice(0,20).map(u => (
                  <div key={u.name} style={{fontSize:11,color:'#aaa',padding:'3px 8px'}}>
                    {u.name} (×{u.sold})
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Actions */}
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button className="btn-primary" style={{flex:1,background:'var(--green-ok)'}} onClick={applyDeductions}>
               Apply — Deduct from Inventory
            </button>
            <button
              onClick={() => setResults(null)}
              style={{padding:'12px 16px',background:'#888',color:'#fff',border:'none',borderRadius:10,cursor:'pointer'}}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\components\Schedule.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\components\Schedule.jsx"),
  @`"
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
  return ```${h % 12 || 12}:`${String(m).padStart(2,'0')} `${ampm}``
}

export default function Schedule({ viewingStore, showToast, auth }) {
  const [offset,     setOffset]     = useState(0)
  const [staff,      setStaff]      = useState([])
  const [shifts,     setShifts]     = useState([])
  const [shiftTypes, setShiftTypes] = useState([])
  const [modal,      setModal]      = useState(null) // null | 'addStaff' | 'addShiftType' | {staffId, date}
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

  const weekLabel = ```${days[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})} – `${days[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}``

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
          <button className="btn-adj" onClick={() => setOffset(o => o-1)}><</button>
          <span style={{fontSize:13,fontWeight:600,color:'var(--dark)',minWidth:200,textAlign:'center'}}>{weekLabel}</span>
          <button className="btn-adj" onClick={() => setOffset(o => o+1)}>></button>
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
              background: st.color+'22', border:``1px solid `${st.color}``, color: st.color
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
                              background: st.color+'22', border:``1.5px solid `${st.color}``,
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
                    {totalHrs > 0 ? ```${totalHrs}h`` : ''}
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

      <div style={{fontSize:12,color:'var(--text-muted)',textAlign:'right'}}>
        {totalShiftsThisWeek} shifts this week
      </div>

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
                  background: st.color+'22', border:``1.5px solid `${st.color}``
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
              <div key={st.id} style={{display:'flex',alignItems:'center',gap:8,padding:10,background:st.color+'22',border:``1px solid `${st.color}``,borderRadius:8,marginBottom:6}}>
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

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\data\inventory.js
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\data\inventory.js"),
  @`"
// Dumont inventory items — from real Lollicup invoices Feb 2026

export const DEFAULT_INVENTORY = [
  { id:1,  name:"Chewy Tapioca Pearls",      code:"A2000",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:7.54, units_per_case:6, case_desc:"CASE of 6 bags" },
  { id:2,  name:"Jasmine Green Tea",         code:"T1022",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:3.62, units_per_case:25, case_desc:"CASE of 25 bags" },
  { id:3,  name:"Golden Milk Tea",           code:"T1025",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:2.33, units_per_case:25, case_desc:"CASE of 25 bags" },
  { id:4,  name:"Black Tea",                 code:"T1030",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:3.05, units_per_case:25, case_desc:"CASE of 25 bags" },
  { id:5,  name:"Thai Tea",                  code:"T1035",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:4.79, units_per_case:1, case_desc:"BAG 13oz" },
  { id:6,  name:"White Peach Tea",           code:"T2001",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.83, units_per_case:50, case_desc:"CASE of 50 bags" },
  { id:7,  name:"NDC (Creamer)",             code:"P1020",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:6.775, units_per_case:10, case_desc:"CASE of 10 bags" },
  { id:8,  name:"Granulated Sugar",          code:"S1030",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:2,  order_qty:"1 BAG", cost:49.19, units_per_case:1, case_desc:"BAG" },
  { id:9,  name:"Demerara Cane Sugar",       code:"S1020",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:1,  order_qty:"1 BAG", cost:79.9, units_per_case:1, case_desc:"BAG" },
  { id:10, name:"Dark Brown Sugar",          code:"S1005",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:57.1, units_per_case:1, case_desc:"CASE" },
  { id:11, name:"Longan Honey",              code:"S1015",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:12.5 },
  { id:12, name:"Fructose",                  code:"S1013",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:2,  order_qty:"1 BOTTLE", cost:11.0 },
  { id:13, name:"Dark Brown Sugar Syrup",    code:"S1006",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:2,  order_qty:"1 BOTTLE", cost:24.5 },
  { id:14, name:"Con Dark Brown Sugar Syrup",code:"S1007",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:26.75 },
  { id:15, name:"Grapefruit Syrup",          code:"J1015",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:16, name:"Lychee Syrup",             code:"J1040",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:17, name:"Mango Syrup",              code:"J1045",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:18, name:"Passion Fruit Syrup",      code:"J1060",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:19, name:"Pineapple Syrup",          code:"J1071",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:20, name:"Strawberry Syrup",         code:"J1090",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:21, name:"Winter Melon Syrup",       code:"J1095",        cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:10.25 },
  { id:22, name:"Passion Fruit Puree",      code:"J1095-P",      cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:16.99 },
  { id:23, name:"Strawberry Fruit Puree",   code:"H-PUREE-STR",  cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:14.09 },
  { id:24, name:"Mango Fruit Puree",        code:"H-PUREE-MNG",  cat:"Boba",       vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:15.49 },
  { id:25, name:"Sea Salt Caramel Powder",  code:"P1044",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:1,  order_qty:"1 BAG", cost:10.25 },
  { id:26, name:"Matcha Green Tea Powder",  code:"P1046",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:2,  order_qty:"1 BAG", cost:15.5 },
  { id:27, name:"Taro Powder",              code:"P0065",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:15.5, units_per_case:1, case_desc:"BAG 2.2lbs" },
  { id:28, name:"Vanilla Powder",           code:"P1068",        cat:"Boba",       vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:13.35, units_per_case:1, case_desc:"BAG" },
  { id:29, name:"Yoggi Powder",             code:"P2000",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:1,  order_qty:"1 BAG", cost:13.75 },
  { id:30, name:"Horchata Powder",          code:"P6071",        cat:"Boba",       vendor:"KARAT",     uom:"BAG",    par:1,  order_qty:"1 BAG", cost:24.39, units_per_case:1, case_desc:"BAG" },
  { id:31, name:"Chocolate Popping Pearls", code:"B2071",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:19.0 },
  { id:32, name:"Lychee Coconut Jelly",     code:"B2005",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:15.25 },
  { id:33, name:"Assorted Jelly (Rainbow)", code:"B2020",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:2,  order_qty:"1 JAR", cost:15.25 },
  { id:34, name:"Coffee Jelly",             code:"B2025",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:17.75 },
  { id:35, name:"Mango Popping Pearls",     code:"B2051",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:19.0 },
  { id:36, name:"Strawberry Popping Pearls",code:"B2053",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:19.0 },
  { id:37, name:"Passion Popping Pearls",   code:"B2055",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:19.0 },
  { id:38, name:"Blueberry Popping Pearls", code:"B2056",        cat:"Boba",       vendor:"KARAT",     uom:"JAR",    par:1,  order_qty:"1 JAR", cost:19.0, units_per_case:6, case_desc:"CASE of 6 bags" },
  { id:40, name:"Monin Caramel Sauce 1.69L",code:"H-CARAMEL-S",  cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:18.99 },
  { id:41, name:"Monin White Mocha Sauce",  code:"H-CHOCOLATE-WMS",cat:"Coffee",   vendor:"KARAT",     uom:"BOTTLE", par:2,  order_qty:"1 BOTTLE", cost:18.99 },
  { id:42, name:"Monin Dark Mocha Sauce",   code:"H-CHOCOLATE-S",  cat:"Coffee",   vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:18.99 },
  { id:43, name:"Monin Vanilla Syrup 750ml",code:"H-VANILLA",    cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:2,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:44, name:"Monin Caramel Syrup 750ml",code:"H-CARAMEL",    cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:45, name:"Monin Hazelnut Syrup",     code:"H-HAZELNUT",   cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:46, name:"Monin Pistachio Syrup",    code:"H-PISTACHIO",  cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:47, name:"Monin Blackberry Syrup",   code:"H-BLACKBERRY", cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:48, name:"Monin Strawberry Syrup",   code:"H-STRAWBERRY", cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:49, name:"Ghirardelli Choc Sauce 64oz",code:"I-Chocolate-S",cat:"Coffee",   vendor:"KARAT",     uom:"BOTTLE", par:2,  order_qty:"1 BOTTLE", cost:18.99 },
  { id:50, name:"Ghirardelli Caramel Sauce",code:"I-Caramel-S",  cat:"Coffee",     vendor:"KARAT",     uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:18.99 },
  { id:51, name:"Coffee Beans",             code:"D-Coffeebeans", cat:"Coffee",    vendor:"DUMONT",    uom:"BAG",    par:2,  order_qty:"1 BAG", cost:20.0 },
  { id:52, name:"Milk",                     code:"D-Milk",       cat:"Coffee",    vendor:"LOCAL",     uom:"GALLON", par:4,  order_qty:"1 GALLON", cost:4.69 },
  { id:60, name:"Kids Scoop Cup",           code:"HP-KSC",       cat:"Dry Stock",  vendor:"HYPERPACK", uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.108 },
  { id:61, name:"Regular Scoop Cup",        code:"HP-RSC",       cat:"Dry Stock",  vendor:"HYPERPACK", uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.12 },
  { id:62, name:"Triple Scoop Cup",         code:"HP-TSC",       cat:"Dry Stock",  vendor:"HYPERPACK", uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.15 },
  { id:63, name:"Hand Picked Happiness Tub",code:"HP-HPHC",      cat:"Dry Stock",  vendor:"HYPERPACK", uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.168 },
  { id:64, name:"Take Away Bag",            code:"HP-BAG",       cat:"Dry Stock",  vendor:"HYPERPACK", uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.216 },
  { id:65, name:"24 Oz Boba Cups",          code:"C-TPP24C",     cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.1305 },
  { id:66, name:"16 Oz Milkshake Cups",     code:"C-TPP16C",     cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.079 },
  { id:67, name:"16/24 Oz PP Lids",         code:"C-TPPLW",      cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.046 },
  { id:68, name:"12 Oz Coffee Cups",        code:"C-KC12",       cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.168 },
  { id:69, name:"16 Oz Coffee Cups",        code:"C-KC16",       cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.065 },
  { id:70, name:"Boba Straws",              code:"C9050s",       cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:2,  order_qty:"1 CASE", cost:0.0175 },
  { id:71, name:"Beverage Napkins",         code:"KN-B99-1K",    cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.00488 },
  { id:72, name:"Gloves (M)",               code:"FP-GV1007",    cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.024 },
  { id:73, name:"Color Changing Spoons",    code:"U4000",        cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.3 },
  { id:74, name:"Tasting Spoons",           code:"U2400",        cat:"Dry Stock",  vendor:"KARAT",     uom:"CASE",   par:1,  order_qty:"1 CASE", cost:0.05 },
  { id:80, name:"Frozen Mango Chunks",      code:"COND-01",      cat:"Condiments", vendor:"Target",    uom:"BAG",    par:2,  order_qty:"2 BAGS", cost:4.99 },
  { id:81, name:"Frozen Strawberry Chunks", code:"COND-02",      cat:"Condiments", vendor:"Target",    uom:"BAG",    par:2,  order_qty:"2 BAGS", cost:4.99 },
  { id:82, name:"Tajin Seasoning",          code:"COND-03",      cat:"Condiments", vendor:"Walmart",   uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:3.99 },
  { id:83, name:"Chamoy Sauce",             code:"COND-04",      cat:"Condiments", vendor:"Walmart",   uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:3.49 },
  { id:84, name:"Lemons",                   code:"COND-05",      cat:"Condiments", vendor:"Indian Store",uom:"COUNT",par:15, order_qty:"30 COUNT", cost:0.25 },
  { id:85, name:"Mint Leaves",              code:"COND-06",      cat:"Condiments", vendor:"Indian Store",uom:"LBS", par:1,  order_qty:"1 LB", cost:2.99 },
  { id:86, name:"Condensed Milk",           code:"COND-07",      cat:"Condiments", vendor:"Walmart",   uom:"CAN",    par:2,  order_qty:"4 CANS", cost:1.5 },
  { id:87, name:"Oat Milk",                 code:"COND-08",      cat:"Condiments", vendor:"Walmart",   uom:"CARTON", par:2,  order_qty:"2 CARTONS", cost:4.99 },
  { id:88, name:"Almond Milk",              code:"COND-09",      cat:"Condiments", vendor:"Walmart",   uom:"CARTON", par:2,  order_qty:"2 CARTONS", cost:3.99 },
  { id:89, name:"Heavy Cream",              code:"COND-10",      cat:"Condiments", vendor:"Walmart",   uom:"CARTON", par:2,  order_qty:"2 CARTONS", cost:3.99 },
  { id:90, name:"Honey",                    code:"COND-11",      cat:"Condiments", vendor:"Walmart",   uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:5.99 },
  { id:91, name:"Date Syrup",               code:"COND-12",      cat:"Condiments", vendor:"Walmart",   uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:6.99 },
  { id:92, name:"Cardamom Powder",          code:"COND-13",      cat:"Condiments", vendor:"Indian Store",uom:"PKT", par:1,  order_qty:"1 PKT", cost:3.99 },
  { id:93, name:"Callebaut Dark Chocolate", code:"COND-14",      cat:"Condiments", vendor:"Walmart",   uom:"BAG",    par:1,  order_qty:"1 BAG", cost:8.99 },
  { id:94, name:"Whipped Cream Spray",      code:"COND-15",      cat:"Condiments", vendor:"Walmart",   uom:"CAN",    par:2,  order_qty:"2 CANS", cost:4.99 },
  { id:95, name:"Roasted Nuts",             code:"COND-16",      cat:"Condiments", vendor:"Walmart",   uom:"LBS",    par:1,  order_qty:"1 LB", cost:6.99 },
  { id:96, name:"Biscoff Biscuits",         code:"COND-17",      cat:"Condiments", vendor:"Walmart",   uom:"PKT",    par:1,  order_qty:"1 PKT", cost:3.99 },
  { id:97, name:"Ferrero Rocher",           code:"COND-18",      cat:"Condiments", vendor:"Walmart",   uom:"BOX",    par:1,  order_qty:"1 BOX", cost:12.99 },
  { id:98, name:"Graham Crackers",          code:"COND-19",      cat:"Condiments", vendor:"Walmart",   uom:"BOX",    par:1,  order_qty:"1 BOX", cost:3.99 },
  { id:99, name:"PB M&Ms",                  code:"COND-20",      cat:"Condiments", vendor:"Walmart",   uom:"BAG",    par:1,  order_qty:"1 BAG", cost:4.99 },
  { id:100,name:"Coconut Water",            code:"COND-21",      cat:"Condiments", vendor:"Walmart",   uom:"PACK",   par:1,  order_qty:"1 PACK", cost:5.99 },
  { id:101,name:"Tonic Water",              code:"COND-22",      cat:"Condiments", vendor:"Walmart",   uom:"PACK",   par:1,  order_qty:"1 PACK", cost:4.99 },
  { id:102,name:"Simple Syrup",             code:"COND-23",      cat:"Condiments", vendor:"Target",    uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:3.99 },
  { id:103,name:"Maple Syrup",              code:"COND-24",      cat:"Condiments", vendor:"Costco",    uom:"BOTTLE", par:1,  order_qty:"1 BOTTLE", cost:9.99 },
  { id:110,name:"Vanilla Bean",             code:"IC-01",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:2,  order_qty:"2 TUBS", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:111,name:"Classic Chocolate",        code:"IC-02",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:2,  order_qty:"2 TUBS", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:112,name:"Butterscotch",             code:"IC-03",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:113,name:"Strawberry Chunks",        code:"IC-04",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:114,name:"Berry Yogurt",             code:"IC-05",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:115,name:"Pistachio",                code:"IC-06",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:116,name:"Lots of Nuts",             code:"IC-07",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:117,name:"Oreo Caramel Fudge",       code:"IC-08",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:118,name:"Salted Caramel",           code:"IC-09",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:2,  order_qty:"2 TUBS", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:119,name:"Taro",                     code:"IC-10",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:2,  order_qty:"2 TUBS", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:120,name:"Mango",                    code:"IC-11",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:2,  order_qty:"2 TUBS", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:121,name:"Kheer",                    code:"IC-12",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:122,name:"Filter Coffee",            code:"IC-13",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:123,name:"Mint Chocochip",           code:"IC-14",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:124,name:"Ferrero Ice Cream",        code:"IC-15",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:125,name:"Biscoff Ice Cream",        code:"IC-16",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:126,name:"Ruby Cheese",              code:"IC-17",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
  { id:127,name:"Peanut Butter Chocolate",  code:"IC-18",        cat:"Ice Cream",  vendor:"Brand",     uom:"TUB",    par:1,  order_qty:"1 TUB", cost:63.0, scoops_per_bucket:60, cost_per_scoop:1.12 },
];

export const STORES = {
  coppell:   { name:"Coppell",   city:"Coppell, TX",   regionId:"texas" },
  aubrey:    { name:"Aubrey",     city:"Aubrey, TX",    regionId:"texas" },
  southlake: { name:"Southlake",  city:"Southlake, TX", regionId:"texas" },
};

export const ROLES = { SUPER_OWNER:"super_owner", REGIONAL_OWNER:"regional_owner", STORE_OWNER:"store_owner", MANAGER:"manager" };
export const COGS_RATES = { kids:1.20, medium:1.40, regular:2.10, large:2.10, "hand packed":4.00, milkshake:4.20, flight:3.00, affogato:3.04, drinks:0.67, falooda:1.87, americano:0.94, espresso:0.94, cappuccino:1.31, latte:1.31, mocha:1.59, specialty:1.84 };

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\data\recipes.js
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\data\recipes.js"),
  @`"
// Clover menu item -> ingredient recipes

export const CLOVER_RECIPES = {
  // ── ICE CREAM ──
  '_kids':     [{ item:'Ice Cream', qty:1, unit:'scoop' }],
  '_regular':  [{ item:'Ice Cream', qty:2, unit:'scoop' }],
  '_milkshake':[{ item:'Ice Cream', qty:4, unit:'scoop' }, { item:'Milk', qty:120, unit:'ml' }],
  '_hph':      [{ item:'Ice Cream', qty:6, unit:'scoop' }],
  '_flight':   [{ item:'Ice Cream', qty:4, unit:'scoop' }],
  // ── MILK TEA ──
  'Taro Milk Tea':    [{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  'Matcha Milk Tea':  [{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  'Horchata Milk Tea':[{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  'Classic Milk Tea': [{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Golden Milk Tea', qty:2.4, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  'Thai Mlik Tea':    [{ item:'Thai Tea', qty:12, unit:'g' }, { item:'NDC (Creamer)', qty:30, unit:'g' }],
  'Tiger Stripes':    [{ item:'Thai Tea', qty:12, unit:'g' }, { item:'NDC (Creamer)', qty:30, unit:'g' }],
  'Dirty Mad Tea':    [{ item:'Golden Milk Tea', qty:2.4, unit:'g' }, { item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Dark Brown Sugar Syrup', qty:24, unit:'g' }],
  'White Peach Green Milk Tea': [{ item:'White Peach Tea', qty:3, unit:'g' }, { item:'NDC (Creamer)', qty:30, unit:'g' }],
  // ── FRUIT TEA ──
  'Lychee Lust':    [{ item:'Black Tea', qty:2.4, unit:'g' }, { item:'Lychee Syrup', qty:24, unit:'g' }],
  'Mangoficient':   [{ item:'Jasmine Green Tea', qty:2.4, unit:'g' }, { item:'Grapefruit Syrup', qty:24, unit:'g' }],
  'Passionate Love':[{ item:'Jasmine Green Tea', qty:2.4, unit:'g' }, { item:'Grapefruit Syrup', qty:24, unit:'g' }],
  // ── SLUSH ──
  'Strawberry Burst':[{ item:'Lychee Syrup', qty:48, unit:'g' }],
  'Sunny Mango':     [{ item:'Grapefruit Syrup', qty:48, unit:'g' }],
  'Mangonada':       [{ item:'Grapefruit Syrup', qty:48, unit:'g' }],
  // ── SMOOTHIE ──
  'Purple Patch':    [{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  'Matcha Smoothie': [{ item:'NDC (Creamer)', qty:30, unit:'g' }, { item:'Fructose', qty:12, unit:'g' }],
  // ── COFFEE ──
  'Latte Hot':            [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Latte Iced':           [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:320, unit:'ml' }],
  'Cappuccino Hot':       [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Cappuccino Iced':      [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Americano Hot':        [{ item:'Coffee Beans', qty:18, unit:'g' }],
  'Americano Iced':       [{ item:'Coffee Beans', qty:18, unit:'g' }],
  'Flat white':           [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:180, unit:'ml' }],
  'Single shot Espresso': [{ item:'Coffee Beans', qty:9,  unit:'g' }],
  'Double shot espresso': [{ item:'Coffee Beans', qty:18, unit:'g' }],
  'Affogato Single shot': [{ item:'Coffee Beans', qty:9,  unit:'g' }, { item:'Ice Cream', qty:2, unit:'scoop' }],
  'Affogato Double Shot': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Ice Cream', qty:2, unit:'scoop' }],
  'Dark Chocolate Mocha Hot':  [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:270, unit:'ml' }],
  'Dark Chocolate Mocha Iced': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'White Chocolate Mocha Hot': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:290, unit:'ml' }],
  'White Chocolate Mocha Iced':[{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Dumont Hot Chocolate':      [{ item:'Milk', qty:300, unit:'ml' }],
  // ── SPECIALTY ──
  'Date Cardamom Latte Hot':  [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Date Cardamom Latte Iced': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Pistachio White Mocha Hot': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Pistachio White Mocha Iced':[{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Blackberry White Mocha Hot':[{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Blackberry White Mocha Iced':[{item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Lavender Latte Hot':  [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Lavender Latte Iced': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Spanish Latte Hot':   [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Spanish Latte Iced':  [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Lavender Matcha Latte Iced':     [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Strawberry Matcha Latte Iced':   [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'Strawberry Matcha Latte Hot':    [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:300, unit:'ml' }],
  'OG Cold Coffee': [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:200, unit:'ml' }],
  'Kheer Iced':     [{ item:'Coffee Beans', qty:18, unit:'g' }, { item:'Milk', qty:200, unit:'ml' }],
  // ── FALOODA ──
  'Kheer Falooda':        [{ item:'Ice Cream', qty:1, unit:'scoop' }, { item:'NDC (Creamer)', qty:50, unit:'g' }],
  'Butterscotch Falooda': [{ item:'Ice Cream', qty:1, unit:'scoop' }, { item:'NDC (Creamer)', qty:50, unit:'g' }],
  'Mango Falooda':        [{ item:'Ice Cream', qty:1, unit:'scoop' }, { item:'NDC (Creamer)', qty:50, unit:'g' }],
};

export const ITEM_SIZES = {
  'NDC (Creamer)':       600,    // grams per bag
  'Fructose':            1200,   // grams per bottle
  'Dark Brown Sugar Syrup': 1200,
  'Lychee Syrup':        1200,
  'Grapefruit Syrup':    1200,
  'Jasmine Green Tea':   25,     // bags per case, each ~3.6g per cup usage
  'Golden Milk Tea':     25,
  'Black Tea':           25,
  'Thai Tea':            1,      // sold individually
  'White Peach Tea':     50,
  'Coffee Beans':        500,    // grams per bag
  'Ice Cream':           60,     // scoops per bucket
  'Milk':                3785,   // ml per gallon
};

export function matchCloverItem(name) {
  const n = name.toLowerCase().trim();
  // Direct match first
  if (CLOVER_RECIPES[name]) return CLOVER_RECIPES[name];
  // Ice cream pattern matching
  if (n.includes('milkshake'))                          return CLOVER_RECIPES['_milkshake'];
  if (n.includes('hand packed happiness') || n.includes('hand packed')) return CLOVER_RECIPES['_hph'];
  if (n.includes('flight of 4'))                        return CLOVER_RECIPES['_flight'];
  if (n.includes('regular scoop'))                      return CLOVER_RECIPES['_regular'];
  if (n.endsWith(' kids') || n.includes(' kids'))       return CLOVER_RECIPES['_kids'];
  if (n.endsWith(' regular') || n.endsWith(' large'))   return CLOVER_RECIPES['_regular'];
  // Drinks
  if (n.includes('affogato single'))    return CLOVER_RECIPES['Affogato Single shot'];
  if (n.includes('affogato double'))    return CLOVER_RECIPES['Affogato Double Shot'];
  if (n.includes('affogato'))           return CLOVER_RECIPES['Affogato Single shot'];
  if (n.includes('taro milk tea'))      return CLOVER_RECIPES['Taro Milk Tea'];
  if (n.includes('matcha milk tea'))    return CLOVER_RECIPES['Matcha Milk Tea'];
  if (n.includes('horchata milk tea'))  return CLOVER_RECIPES['Horchata Milk Tea'];
  if (n.includes('classic milk tea'))   return CLOVER_RECIPES['Classic Milk Tea'];
  if (n.includes('tiger stripes'))      return CLOVER_RECIPES['Tiger Stripes'];
  if (n.includes('dirty mad tea'))      return CLOVER_RECIPES['Dirty Mad Tea'];
  if (n.includes('thai'))               return CLOVER_RECIPES['Thai Mlik Tea'];
  if (n.includes('white peach'))        return CLOVER_RECIPES['White Peach Green Milk Tea'];
  if (n.includes('lychee lust'))        return CLOVER_RECIPES['Lychee Lust'];
  if (n.includes('mangoficient'))       return CLOVER_RECIPES['Mangoficient'];
  if (n.includes('passionate love'))    return CLOVER_RECIPES['Passionate Love'];
  if (n.includes('strawberry burst'))   return CLOVER_RECIPES['Strawberry Burst'];
  if (n.includes('sunny mango'))        return CLOVER_RECIPES['Sunny Mango'];
  if (n.includes('mangonada'))          return CLOVER_RECIPES['Mangonada'];
  if (n.includes('purple patch'))       return CLOVER_RECIPES['Purple Patch'];
  if (n.includes('matcha smoothie'))    return CLOVER_RECIPES['Matcha Smoothie'];
  if (n.includes('kheer falooda'))      return CLOVER_RECIPES['Kheer Falooda'];
  if (n.includes('butterscotch falooda')) return CLOVER_RECIPES['Butterscotch Falooda'];
  if (n.includes('mango falooda'))      return CLOVER_RECIPES['Mango Falooda'];
  if (n.includes('date cardamom') && n.includes('iced')) return CLOVER_RECIPES['Date Cardamom Latte Iced'];
  if (n.includes('date cardamom'))      return CLOVER_RECIPES['Date Cardamom Latte Hot'];
  if (n.includes('pistachio white mocha') && n.includes('iced')) return CLOVER_RECIPES['Pistachio White Mocha Iced'];
  if (n.includes('pistachio white mocha')) return CLOVER_RECIPES['Pistachio White Mocha Hot'];
  if (n.includes('blackberry white mocha') && n.includes('iced')) return CLOVER_RECIPES['Blackberry White Mocha Iced'];
  if (n.includes('blackberry'))         return CLOVER_RECIPES['Blackberry White Mocha Hot'];
  if (n.includes('lavender matcha'))    return CLOVER_RECIPES['Lavender Matcha Latte Iced'];
  if (n.includes('lavender'))          return CLOVER_RECIPES['Lavender Latte Hot'];
  if (n.includes('strawberry matcha') && n.includes('hot')) return CLOVER_RECIPES['Strawberry Matcha Latte Hot'];
  if (n.includes('strawberry matcha')) return CLOVER_RECIPES['Strawberry Matcha Latte Iced'];
  if (n.includes('spanish latte') && n.includes('iced')) return CLOVER_RECIPES['Spanish Latte Iced'];
  if (n.includes('spanish latte'))     return CLOVER_RECIPES['Spanish Latte Hot'];
  if (n.includes('og cold coffee') || n.includes('cold coffee')) return CLOVER_RECIPES['OG Cold Coffee'];
  if (n.includes('kheer iced'))        return CLOVER_RECIPES['Kheer Iced'];
  if (n.includes('latte iced') || n.includes('iced latte'))  return CLOVER_RECIPES['Latte Iced'];
  if (n.includes('latte hot') || (n.includes('latte') && !n.includes('iced'))) return CLOVER_RECIPES['Latte Hot'];
  if (n.includes('cappuccino iced'))   return CLOVER_RECIPES['Cappuccino Iced'];
  if (n.includes('cappuccino'))        return CLOVER_RECIPES['Cappuccino Hot'];
  if (n.includes('americano iced') || n.includes('iced americano')) return CLOVER_RECIPES['Americano Iced'];
  if (n.includes('americano'))         return CLOVER_RECIPES['Americano Hot'];
  if (n.includes('flat white'))        return CLOVER_RECIPES['Flat white'];
  if (n.includes('dark chocolate mocha iced')) return CLOVER_RECIPES['Dark Chocolate Mocha Iced'];
  if (n.includes('dark chocolate mocha'))      return CLOVER_RECIPES['Dark Chocolate Mocha Hot'];
  if (n.includes('white chocolate mocha iced')) return CLOVER_RECIPES['White Chocolate Mocha Iced'];
  if (n.includes('white chocolate mocha'))     return CLOVER_RECIPES['White Chocolate Mocha Hot'];
  if (n.includes('hot chocolate'))     return CLOVER_RECIPES['Dumont Hot Chocolate'];
  if (n.includes('double shot') || n.includes('doppio')) return CLOVER_RECIPES['Double shot espresso'];
  if (n.includes('single shot') || n.includes('espresso')) return CLOVER_RECIPES['Single shot Espresso'];
  return null;
}

// ── Parse Clover CSV/Excel ──
"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\firebase\config.js
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\firebase\config.js"),
  @`"
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBofsUP3yf2OkaQVPav8rfxUiax39TkxYY",
  authDomain: "dumont-inventory.firebaseapp.com",
  projectId: "dumont-inventory",
  storageBucket: "dumont-inventory.firebasestorage.app",
  messagingSenderId: "208739741985",
  appId: "1:208739741985:web:85493fbe669b0e43b78e60"
}

const app  = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db   = getFirestore(app)
export default app

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\hooks\useAuth.js
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\hooks\useAuth.js"),
  @`"
import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const HARDCODED_USERS = {
  'dumonttexas@gmail.com':    { role:'super_owner', store:'coppell',  name:'Sasikanth' },
  'txccpointwest@gmail.com':  { role:'store_owner',  store:'coppell',  name:'Coppell Owner' },
}

export function useAuth() {
  const [user,       setUser]       = useState(null)
  const [userConfig, setUserConfig] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [pending,    setPending]    = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        await loadUserConfig(firebaseUser)
      } else {
        setUser(null)
        setUserConfig(null)
        setLoading(false)
      }
    })
    return unsub
  }, [])

  async function loadUserConfig(firebaseUser) {
    let cfg = HARDCODED_USERS[firebaseUser.email] || { role:'manager', store:'coppell', name:firebaseUser.email }
    try {
      const emailKey = firebaseUser.email.replace(/\./g,'_').replace(/@/g,'_at_')
      const snap = await getDoc(doc(db, 'users', emailKey))
      if (snap.exists()) {
        const fd = snap.data()
        if (fd.role === 'owner') fd.role = 'super_owner'
        cfg = { ...cfg, ...fd }
        // Check pending
        if (fd.status === 'pending') {
          setPending(true)
          setLoading(false)
          return
        }
      } else {
        // First login — write profile
        const emailKey2 = firebaseUser.email.replace(/\./g,'_').replace(/@/g,'_at_')
        await setDoc(doc(db, 'users', emailKey2), {
          email: firebaseUser.email,
          store: cfg.store,
          role:  cfg.role,
          name:  cfg.name,
          createdAt: Date.now()
        })
      }
    } catch(e) {
      console.warn('Could not load user profile', e)
    }
    setUserConfig(cfg)
    setPending(false)
    setLoading(false)
  }

  async function login(email, password) {
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch(e) {
      setError('Invalid email or password')
    }
  }

  async function logout() {
    await signOut(auth)
  }

  const isSuperOwner   = () => userConfig?.role === 'super_owner'
  const isStoreOwner   = () => ['super_owner','store_owner'].includes(userConfig?.role)
  const isManager      = () => ['super_owner','store_owner','manager'].includes(userConfig?.role)

  return { user, userConfig, loading, error, pending, login, logout, isSuperOwner, isStoreOwner, isManager }
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\hooks\useInventory.js
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\hooks\useInventory.js"),
  @`"
import { useState, useCallback } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { DEFAULT_INVENTORY } from '../data/inventory'

export function useInventory(storeId) {
  const [inventory, setInventory] = useState([])
  const [loading,   setLoading]   = useState(false)

  const loadInventory = useCallback(async (sid) => {
    if (!sid) return
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'stores', sid, 'inventory', 'stock'))
      const stockMap = snap.exists() ? snap.data() : {}
      const merged = DEFAULT_INVENTORY.map(item => ({
        ...item,
        stock:  stockMap[String(item.id)]  !== undefined ? stockMap[String(item.id)]  : 0,
        active: stockMap[``active_`${item.id}``] !== undefined ? stockMap[``active_`${item.id}``] : true,
      }))
      setInventory(merged)
    } catch(e) {
      console.error('loadInventory error', e)
      setInventory(DEFAULT_INVENTORY.map(i => ({ ...i, stock: 0 })))
    }
    setLoading(false)
  }, [])

  const saveInventory = useCallback(async (sid, inv) => {
    if (!sid) return
    const stockMap = {}
    inv.forEach(item => {
      stockMap[String(item.id)] = item.stock
      if (item.active === false) stockMap[``active_`${item.id}``] = false
    })
    await setDoc(doc(db, 'stores', sid, 'inventory', 'stock'), stockMap, { merge: true })
  }, [])

  const adjustStock = useCallback((id, delta) => {
    setInventory(prev => prev.map(item =>
      item.id === id
        ? { ...item, stock: Math.max(0, Math.round((item.stock + delta) * 10) / 10) }
        : item
    ))
  }, [])

  const setStock = useCallback((id, value) => {
    setInventory(prev => prev.map(item =>
      item.id === id ? { ...item, stock: Math.max(0, parseFloat(value) || 0) } : item
    ))
  }, [])

  const toggleActive = useCallback((id) => {
    setInventory(prev => prev.map(item =>
      item.id === id ? { ...item, active: item.active === false ? true : false } : item
    ))
  }, [])

  const setPar = useCallback((id, value) => {
    setInventory(prev => prev.map(item =>
      item.id === id ? { ...item, par: Math.max(0, parseInt(value) || 0) } : item
    ))
  }, [])

  function getStatus(item) {
    if (!item || item.stock === undefined) return 'ok'
    if (item.stock === 0)           return 'critical'
    if (item.stock <= item.par / 2) return 'critical'
    if (item.stock <= item.par)     return 'low'
    return 'ok'
  }

  return { inventory, loading, loadInventory, saveInventory, adjustStock, setStock, toggleActive, setPar, getStatus }
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\hooks\useToast.js
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\hooks\useToast.js"),
  @`"
import { useState, useCallback } from 'react'

export function useToast() {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, duration = 3000) => {
    setToast(message)
    setTimeout(() => setToast(null), duration)
  }, [])

  return { toast, showToast }
}

"`@,
  [System.Text.UTF8Encoding]::new($false)
)

# src\main.jsx
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "src\main.jsx"),
  @`"
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

"`@,
  [System.Text.UTF8Encoding]::new($false)
)