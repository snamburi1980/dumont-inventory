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
        <button className={`cat-btn ${view==='report' ? 'active' : ''}`} onClick={() => setView('report')}>
           COGS Report
        </button>
        <button className={`cat-btn ${view==='margins' ? 'active' : ''}`} onClick={() => setView('margins')}>
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
                    ${revenue.toLocaleString('en-US',{maximumFractionDigits:0})}
                  </div>
                  <div className="stat-label">Net Sales</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num" style={{color:'var(--red-alert)',fontSize:18}}>
                    ${totalCOGS.toLocaleString('en-US',{maximumFractionDigits:0})}
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
                    ${grossProfit.toLocaleString('en-US',{maximumFractionDigits:0})}
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
                        <span style={{color:'var(--text-muted)'}}>${rev.toLocaleString('en-US',{maximumFractionDigits:0})}</span>
                        <span style={{color:'var(--caramel)',fontWeight:700}}>{pct.toFixed(0)}% COGS</span>
                      </div>
                    </div>
                    <div style={{background:'#EDE0CC',borderRadius:4,height:4}}>
                      <div style={{background:'var(--caramel)',height:4,borderRadius:4,width:`${(rev/revenue*100).toFixed(0)}%`}} />
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
                        ${(d.revenue||0).toLocaleString('en-US',{maximumFractionDigits:0})}
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
                className={`cat-btn ${marginCat===cat ? 'active' : ''}`}
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
                    Cost: ${item.cost.toFixed(2)} · Sell: ${item.sell.toFixed(2)}
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
