# Dumont React - Missing Components Setup

# Writing src\components\Sales.jsx
$content = @'
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
      const netSales = parseFloat(cols[3].replace('$','').replace(',','')) || 0
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
        deductDisplay = `${data.qty.toFixed(0)} scoops = ${deductUnits.toFixed(2)} tubs`
      } else if (data.unit === 'g' && ITEM_SIZES[itemName]) {
        deductUnits   = data.qty / ITEM_SIZES[itemName]
        deductDisplay = `${data.qty.toFixed(0)}g = ${deductUnits.toFixed(2)} bags/bottles`
      } else if (data.unit === 'ml' && itemName === 'Milk') {
        deductUnits   = data.qty / 3785
        deductDisplay = `${(data.qty/1000).toFixed(1)}L = ${deductUnits.toFixed(2)} gallons`
      } else {
        deductUnits   = data.qty
        deductDisplay = `${data.qty.toFixed(2)} ${data.unit}`
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
        showToast('⚠️ Could not parse CSV')
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

    showToast(`✅ Inventory updated — ${results.deductions.filter(d=>d.invItem).length} items deducted`)
    setResults(null)
  }

  const matchPct = results ? Math.round(results.matched.length / (results.matched.length + results.unmatched.length) * 100) : 0

  return (
    <div>
      {/* Upload zone */}
      <label style={{ display:'block', cursor:'pointer' }}>
        <div className="scan-zone" style={{ marginBottom:16 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📊</div>
          <div className="scan-zone-title">Upload Clover Sales Report</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
            Tap to select CSV file (.csv)
          </div>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display:'none' }} />
        </div>
      </label>

      {loading && (
        <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>
          ⏳ Reading Clover report...
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
                ${results.totalSales.toLocaleString('en-US',{maximumFractionDigits:0})}
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
              📅 {results.periodLabel}
            </div>
          )}

          {/* Deductions */}
          <div className="section-title">📦 Inventory to Deduct</div>
          {results.deductions.map(d => (
            <div key={d.itemName} style={{
              display:'flex', alignItems:'center', gap:10,
              padding:10, background:'var(--cream)', borderRadius:10,
              marginBottom:6,
              borderLeft: `4px solid ${!d.invItem ? '#ccc' : d.belowPar ? 'var(--red-alert)' : 'var(--green-ok)'}`
            }}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--dark)'}}>{d.itemName}</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>Used: {d.deductDisplay}</div>
              </div>
              <div style={{textAlign:'right'}}>
                {d.invItem ? (
                  <>
                    <div style={{fontSize:12,color:'var(--text-muted)'}}>
                      {d.currentStock?.toFixed(1)} → <strong style={{color: d.belowPar ? 'var(--red-alert)' : 'var(--green-ok)'}}>
                        {d.newStock?.toFixed(1)}
                      </strong>
                    </div>
                    {d.belowPar && <div style={{fontSize:10,color:'var(--red-alert)'}}>⚠️ Below PAR</div>}
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
              ⚡ Apply — Deduct from Inventory
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

'@
Set-Content -Path 'src\components\Sales.jsx' -Value $content -Encoding UTF8

# Writing src\components\Delivery.jsx
$content = @'
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
    if (!item || !form.qty) { showToast('⚠️ Select item and quantity'); return }

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
    showToast(`✅ +${qty} ${item.uom} ${item.name} logged`)
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
            placeholder="Unit cost $"
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
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{d.date} {d.note ? `· ${d.note}` : ''}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--green-ok)' }}>+{d.qty}</div>
                  {d.cost > 0 && <div style={{ fontSize:11, color:'var(--text-muted)' }}>${d.cost}/unit</div>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

'@
Set-Content -Path 'src\components\Delivery.jsx' -Value $content -Encoding UTF8

# Writing src\components\COGS.jsx
$content = @'
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
          📊 COGS Report
        </button>
        <button className={`cat-btn ${view==='margins' ? 'active' : ''}`} onClick={() => setView('margins')}>
          💰 Menu Margins
        </button>
      </div>

      {/* COGS Report */}
      {view === 'report' && (
        <div>
          {loading && <div style={{textAlign:'center',padding:24,color:'var(--text-muted)'}}>Loading...</div>}

          {!loading && !latest && (
            <div style={{textAlign:'center',padding:32,background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:12}}>
              <div style={{fontSize:32,marginBottom:8}}>📊</div>
              <div style={{fontSize:14,fontWeight:600,color:'var(--dark)',marginBottom:6}}>No Sales Data Yet</div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>Upload your Clover CSV in the Sales tab</div>
            </div>
          )}

          {!loading && latest && (
            <div>
              {latest.period && (
                <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12,textAlign:'center'}}>
                  📅 {latest.period}
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
                  {item.cat==='Ice Cream'?'🍦':item.cat==='Coffee'?'☕':'🧋'}
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

'@
Set-Content -Path 'src\components\COGS.jsx' -Value $content -Encoding UTF8

# Writing src\components\Schedule.jsx
$content = @'
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
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`
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
    showToast('✅ Staff added')
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
    showToast('✅ Shift type added')
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

  const weekLabel = `${days[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${days[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`

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
          <button className="btn-adj" onClick={() => setOffset(o => o-1)}>‹</button>
          <span style={{fontSize:13,fontWeight:600,color:'var(--dark)',minWidth:200,textAlign:'center'}}>{weekLabel}</span>
          <button className="btn-adj" onClick={() => setOffset(o => o+1)}>›</button>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button className="cat-btn" onClick={() => setModal('shiftTypes')}>⚙️ Shifts</button>
          <button className="cat-btn" onClick={() => setModal('addStaff')}>👥 Staff</button>
        </div>
      </div>

      {/* Shift type legend */}
      {shiftTypes.length > 0 && (
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
          {shiftTypes.map(st => (
            <span key={st.id} style={{
              fontSize:11,padding:'3px 10px',borderRadius:20,
              background: st.color+'22', border:`1px solid ${st.color}`, color: st.color
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
                              background: st.color+'22', border:`1.5px solid ${st.color}`,
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
                    {totalHrs > 0 ? `${totalHrs}h` : ''}
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
                  background: st.color+'22', border:`1.5px solid ${st.color}`
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
              <div key={st.id} style={{display:'flex',alignItems:'center',gap:8,padding:10,background:st.color+'22',border:`1px solid ${st.color}`,borderRadius:8,marginBottom:6}}>
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

'@
Set-Content -Path 'src\components\Schedule.jsx' -Value $content -Encoding UTF8

# Writing src\components\Admin.jsx
$content = @'
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
      showToast(`✅ ${req.email} approved`)
    } catch(e) { showToast('⚠️ Error approving') }
  }

  async function reject(req) {
    try {
      await deleteDoc(doc(db, 'signupRequests', req.id))
      setPending(prev => prev.filter(p => p.id !== req.id))
      showToast(`❌ ${req.email} rejected`)
    } catch(e) {}
  }

  return (
    <div>
      {/* Sub nav */}
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        <button className={`cat-btn ${view==='pending'?'active':''}`} onClick={() => setView('pending')}>
          ⏳ Pending Signups {pending.length > 0 && `(${pending.length})`}
        </button>
        <button className={`cat-btn ${view==='stores'?'active':''}`} onClick={() => setView('stores')}>
          🏪 Stores
        </button>
      </div>

      {/* Pending signups */}
      {view === 'pending' && (
        <div>
          {pending.length === 0 ? (
            <div style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>
              <div style={{fontSize:32,marginBottom:8}}>✅</div>
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

'@
Set-Content -Path 'src\components\Admin.jsx' -Value $content -Encoding UTF8
