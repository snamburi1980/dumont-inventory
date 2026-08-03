import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  collection, getDocs, addDoc, deleteDoc, doc, getDoc, setDoc, query, orderBy, limit
} from 'firebase/firestore'
import { db } from '../firebase/config'

// ── Static data (from COGS) ───────────────────────────────────────────────────
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
  'Ice Cream':0.27,'Milk Tea':0.11,'Coffee & Specialty':0.30,
  'Falooda':0.24,'Fruit Tea':0.11,'Slush':0.11,'Smoothie':0.11,'Bakery':0.35,
}
const CAT_REVENUE_PCT = {
  'Ice Cream':0.61,'Milk Tea':0.085,'Coffee & Specialty':0.12,
  'Falooda':0.038,'Fruit Tea':0.026,'Slush':0.023,'Smoothie':0.009,'Bakery':0.052,
}

function today() {
  return new Date().toISOString().slice(0,10)
}

function fmt$(n) {
  return '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
}

// ── Clover Excel parser ───────────────────────────────────────────────────────
function parseCloverWorkbook(wb) {
  const sheetName = wb.SheetNames[0]
  const ws        = wb.Sheets[sheetName]
  const rows      = XLSX.utils.sheet_to_json(ws, { defval: '' })
  if (!rows.length) return null

  // Detect revenue column (Clover uses "Net Sales" or "Revenue")
  const sample    = rows[0]
  const revKey    = ['Net Sales','Net sales','Revenue','revenue','Total','total']
    .find(k => k in sample) || ''
  const qtyKey    = ['Qty','qty','Quantity','quantity'].find(k => k in sample) || ''
  const itemKey   = ['Item','item','Name','name','Product'].find(k => k in sample) || ''
  const dateKey   = ['Date','date','Payment Date','Order Date'].find(k => k in sample) || ''
  const catKey    = ['Category','category','Item Category'].find(k => k in sample) || ''

  let totalRevenue = 0
  let totalQty     = 0
  const byItem     = {}

  rows.forEach(r => {
    const rev = parseFloat(String(r[revKey]).replace(/[$,]/g,'')) || 0
    const qty = parseFloat(String(r[qtyKey]).replace(/,/g,''))    || 1
    const item = String(r[itemKey] || '').trim()
    const cat  = String(r[catKey]  || '').trim()
    if (rev <= 0 && !item) return
    totalRevenue += rev
    totalQty     += qty
    if (item) {
      if (!byItem[item]) byItem[item] = { item, cat, revenue:0, qty:0 }
      byItem[item].revenue += rev
      byItem[item].qty     += qty
    }
  })

  // Determine period from date column
  const dates = rows.map(r => r[dateKey]).filter(Boolean)
  let periodStr = ''
  if (dates.length) {
    const d0 = new Date(dates[0])
    const d1 = new Date(dates[dates.length-1])
    if (!isNaN(d0) && !isNaN(d1)) {
      const fmt = d => d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
      periodStr = fmt(d0) === fmt(d1) ? fmt(d0) : `${fmt(d0)} – ${fmt(d1)}`
    }
  }

  return {
    revenue:    totalRevenue,
    itemsSold:  Math.round(totalQty),
    period:     periodStr || 'Uploaded ' + new Date().toLocaleDateString(),
    rows:       Object.values(byItem).sort((a,b) => b.revenue - a.revenue),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function Commerce({ viewingStore, viewingOrg, auth, showToast }) {
  const [subTab,        setSubTab]        = useState('sales')
  const [salesHistory,  setSalesHistory]  = useState([])
  const [historyLoaded, setHistoryLoaded] = useState(false)

  // Sales tab
  const [parsedSales,   setParsedSales]   = useState(null)
  const [savingSales,   setSavingSales]   = useState(false)
  const fileRef = useRef()

  // Deliveries tab
  const [deliveries,    setDeliveries]    = useState([])
  const [delivLoaded,   setDelivLoaded]   = useState(false)
  const [dVendor,       setDVendor]       = useState('')
  const [dDate,         setDDate]         = useState(today())
  const [dItems,        setDItems]        = useState([{ name:'', qty:'', cost:'' }])
  const [savingDeliv,   setSavingDeliv]   = useState(false)
  const [delivNotes,    setDelivNotes]    = useState('')

  // Margins tab
  const [marginCat,     setMarginCat]     = useState('all')

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (viewingStore) {
      loadSalesHistory()
      loadDeliveries()
    }
  }, [viewingStore])

  async function loadSalesHistory() {
    try {
      const q    = query(collection(db,'stores',viewingStore,'salesLedger'), orderBy('appliedAt','desc'))
      const snap = await getDocs(q)
      setSalesHistory(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    } catch(e) {}
    setHistoryLoaded(true)
  }

  async function loadDeliveries() {
    try {
      const q    = query(collection(db,'stores',viewingStore,'deliveries'), orderBy('createdAt','desc'), limit(50))
      const snap = await getDocs(q)
      setDeliveries(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    } catch(e) {}
    setDelivLoaded(true)
  }

  // ── KPI derived from latest sales ──────────────────────────────────────────
  const latest      = salesHistory[0]
  const revenue     = latest?.revenue || 0
  let   totalCOGS   = 0
  Object.entries(CAT_REVENUE_PCT).forEach(([cat, pct]) => {
    const rev  = revenue * pct
    totalCOGS += rev * (CAT_COGS[cat] || 0.20)
  })
  const cogsPct     = revenue > 0 ? (totalCOGS / revenue * 100) : 0
  const grossProfit = revenue - totalCOGS
  const margin      = revenue > 0 ? ((grossProfit / revenue) * 100) : 0

  // ── Sales handlers ─────────────────────────────────────────────────────────
  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb     = XLSX.read(ev.target.result, { type:'array' })
        const parsed = parseCloverWorkbook(wb)
        if (!parsed) { showToast('Could not parse file — check format'); return }
        setParsedSales(parsed)
      } catch(err) {
        showToast('Error reading file')
        console.error(err)
      }
    }
    reader.readAsArrayBuffer(f)
  }

  async function saveSalesUpload() {
    if (!parsedSales || !viewingStore) return
    setSavingSales(true)
    try {
      await addDoc(collection(db,'stores',viewingStore,'salesLedger'), {
        ...parsedSales,
        appliedAt: Date.now(),
        uploadedBy: auth?.userConfig?.name || auth?.user?.email || '',
      })
      showToast('Sales data saved')
      setParsedSales(null)
      if (fileRef.current) fileRef.current.value = ''
      await loadSalesHistory()
    } catch(e) {
      showToast('Save failed')
      console.error(e)
    }
    setSavingSales(false)
  }

  async function deleteSalesRecord(id) {
    try {
      await deleteDoc(doc(db,'stores',viewingStore,'salesLedger',id))
      setSalesHistory(h => h.filter(x => x.id !== id))
      showToast('Deleted')
    } catch(e) { showToast('Delete failed') }
  }

  function exportSalesToExcel() {
    if (!salesHistory.length) return
    const rows = salesHistory.flatMap(rec =>
      (rec.rows || []).map(r => ({
        Period:  rec.period,
        Item:    r.item,
        Category:r.cat,
        Qty:     r.qty,
        Revenue: r.revenue.toFixed(2),
      }))
    )
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales')
    XLSX.writeFile(wb, `sales_${viewingStore}.xlsx`)
  }

  // ── Delivery handlers ──────────────────────────────────────────────────────
  function addDelivItem() {
    setDItems(prev => [...prev, { name:'', qty:'', cost:'' }])
  }
  function removeDelivItem(idx) {
    setDItems(prev => prev.filter((_,i) => i !== idx))
  }
  function updateDelivItem(idx, field, val) {
    setDItems(prev => prev.map((it,i) => i===idx ? {...it,[field]:val} : it))
  }

  async function saveDelivery() {
    if (!dVendor.trim()) { showToast('Enter vendor name'); return }
    const validItems = dItems.filter(it => it.name.trim())
    if (!validItems.length) { showToast('Add at least one item'); return }
    setSavingDeliv(true)
    try {
      const items = validItems.map(it => ({
        name: it.name.trim(),
        qty:  parseFloat(it.qty)  || 0,
        cost: parseFloat(it.cost) || 0,
      }))
      const totalCost = items.reduce((s,it) => s + (it.qty * it.cost), 0)
      await addDoc(collection(db,'stores',viewingStore,'deliveries'), {
        vendor:    dVendor.trim(),
        date:      dDate,
        items,
        totalCost,
        notes:     delivNotes.trim(),
        createdAt: Date.now(),
        createdBy: auth?.userConfig?.name || auth?.user?.email || '',
      })
      showToast('Delivery saved')
      setDVendor(''); setDDate(today()); setDItems([{name:'',qty:'',cost:''}]); setDelivNotes('')
      await loadDeliveries()
    } catch(e) {
      showToast('Save failed')
      console.error(e)
    }
    setSavingDeliv(false)
  }

  async function deleteDelivery(id) {
    try {
      await deleteDoc(doc(db,'stores',viewingStore,'deliveries',id))
      setDeliveries(d => d.filter(x => x.id !== id))
      showToast('Deleted')
    } catch(e) { showToast('Delete failed') }
  }

  function exportDeliveries() {
    if (!deliveries.length) return
    const rows = deliveries.flatMap(d =>
      (d.items||[]).map(it => ({
        Date:   d.date,
        Vendor: d.vendor,
        Item:   it.name,
        Qty:    it.qty,
        'Unit Cost': it.cost.toFixed(2),
        'Total Cost': (it.qty * it.cost).toFixed(2),
      }))
    )
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Deliveries')
    XLSX.writeFile(wb, `deliveries_${viewingStore}.xlsx`)
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const card   = { background:'var(--card-bg,#fff)', border:'1px solid var(--border,#E3DDD0)', borderRadius:12, padding:'14px 16px', marginBottom:12 }
  const inp    = { padding:'8px 10px', border:'1px solid var(--border,#E3DDD0)', borderRadius:8, fontSize:13, fontFamily:'inherit', background:'var(--cream,#F6F4ED)', width:'100%', boxSizing:'border-box' }
  const btnPri = { background:'#1A4C48', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit' }
  const btnSec = { background:'#fff', color:'#6B7F78', border:'1px solid #E3DDD0', borderRadius:8, padding:'9px 18px', cursor:'pointer', fontSize:13, fontFamily:'inherit' }

  if (!viewingStore) {
    return <div style={{padding:32,textAlign:'center',color:'#6B7F78'}}>Select a store to view Commerce data.</div>
  }

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── KPI Overview (always visible) ─────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10, marginBottom:16 }}>
        <div style={{ ...card, marginBottom:0, textAlign:'center' }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#3B8050' }}>{fmt$(revenue)}</div>
          <div style={{ fontSize:11, color:'#6B7F78', marginTop:2 }}>Net Revenue</div>
          {latest?.period && <div style={{ fontSize:10, color:'#aaa', marginTop:2 }}>{latest.period}</div>}
        </div>
        <div style={{ ...card, marginBottom:0, textAlign:'center' }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#C62828' }}>{fmt$(totalCOGS)}</div>
          <div style={{ fontSize:11, color:'#6B7F78', marginTop:2 }}>Est. COGS</div>
          <div style={{ fontSize:10, color:'#aaa', marginTop:2 }}>{cogsPct.toFixed(1)}%</div>
        </div>
        <div style={{ ...card, marginBottom:0, textAlign:'center' }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#3B8050' }}>{fmt$(grossProfit)}</div>
          <div style={{ fontSize:11, color:'#6B7F78', marginTop:2 }}>Gross Profit</div>
          <div style={{ fontSize:10, color:'#aaa', marginTop:2 }}>{margin.toFixed(1)}%</div>
        </div>
        <div style={{ ...card, marginBottom:0, textAlign:'center' }}>
          <div style={{ fontSize:20, fontWeight:700, color: cogsPct<25?'#3B8050':cogsPct<32?'#C1683C':'#C62828' }}>
            {cogsPct.toFixed(1)}%
          </div>
          <div style={{ fontSize:11, color:'#6B7F78', marginTop:2 }}>COGS %</div>
          <div style={{ fontSize:10, color: cogsPct<25?'#3B8050':cogsPct<32?'#C1683C':'#C62828', marginTop:2 }}>
            {cogsPct<25?'Excellent':cogsPct<32?'Good':'High'}
          </div>
        </div>
      </div>

      {/* ── Sub-tab nav ───────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { id:'sales',      label:'Sales Upload' },
          { id:'deliveries', label:'Deliveries' },
          { id:'cogs',       label:'COGS Report' },
          { id:'margins',    label:'Menu Margins' },
        ].map(t => (
          <button key={t.id}
            className={`cat-btn ${subTab===t.id?'active':''}`}
            onClick={() => setSubTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SALES TAB */}
      {subTab === 'sales' && (
        <div>
          <div style={card}>
            <div style={{ fontSize:14, fontWeight:700, color:'#1A4C48', marginBottom:10 }}>Upload Clover Sales Report</div>
            <div style={{ fontSize:12, color:'#6B7F78', marginBottom:12 }}>
              Export from Clover: Reports → Sales Summary → Export to Excel (.xlsx). Upload the file below.
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              style={{ display:'block', marginBottom:10, fontSize:13 }} />

            {parsedSales && (
              <div style={{ background:'#F5F9F5', border:'1px solid #C8E6C9', borderRadius:8, padding:'12px 14px', marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48' }}>{parsedSales.period}</div>
                    <div style={{ fontSize:11, color:'#6B7F78' }}>{parsedSales.itemsSold} items · {fmt$(parsedSales.revenue)} revenue</div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => { setParsedSales(null); if (fileRef.current) fileRef.current.value='' }} style={btnSec}>Discard</button>
                    <button onClick={saveSalesUpload} disabled={savingSales} style={{ ...btnPri, opacity:savingSales?0.7:1 }}>
                      {savingSales ? 'Saving...' : 'Save to Records'}
                    </button>
                  </div>
                </div>
                <div style={{ maxHeight:200, overflowY:'auto' }}>
                  <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ background:'#1A4C48', color:'#fff' }}>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>Item</th>
                        <th style={{ padding:'6px 8px', textAlign:'left' }}>Category</th>
                        <th style={{ padding:'6px 8px', textAlign:'right' }}>Qty</th>
                        <th style={{ padding:'6px 8px', textAlign:'right' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedSales.rows.slice(0,30).map((r,i) => (
                        <tr key={i} style={{ background: i%2===0?'#fff':'#FAF8F3' }}>
                          <td style={{ padding:'5px 8px', color:'#1A4C48' }}>{r.item}</td>
                          <td style={{ padding:'5px 8px', color:'#6B7F78' }}>{r.cat||'—'}</td>
                          <td style={{ padding:'5px 8px', textAlign:'right', color:'#6B7F78' }}>{r.qty}</td>
                          <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:600, color:'#3B8050' }}>{fmt$(r.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Sales history */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48' }}>Upload History</div>
            {salesHistory.length > 0 && (
              <button onClick={exportSalesToExcel} style={btnSec}>Export Excel</button>
            )}
          </div>
          {!historyLoaded && <div style={{ color:'#6B7F78', fontSize:13, padding:16 }}>Loading...</div>}
          {historyLoaded && salesHistory.length === 0 && (
            <div style={{ ...card, textAlign:'center', color:'#6B7F78' }}>No sales records yet.</div>
          )}
          {salesHistory.map(rec => (
            <div key={rec.id} style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48' }}>{rec.period}</div>
                  <div style={{ fontSize:11, color:'#6B7F78' }}>
                    {rec.itemsSold} items · {new Date(rec.appliedAt).toLocaleDateString()}
                    {rec.uploadedBy ? ` · by ${rec.uploadedBy}` : ''}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:'#3B8050' }}>{fmt$(rec.revenue)}</div>
                  <button onClick={() => deleteSalesRecord(rec.id)}
                    style={{ background:'none', border:'none', color:'#C62828', cursor:'pointer', fontSize:16, padding:4 }}>
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELIVERIES TAB */}
      {subTab === 'deliveries' && (
        <div>
          {/* Entry form */}
          <div style={card}>
            <div style={{ fontSize:14, fontWeight:700, color:'#1A4C48', marginBottom:12 }}>Log a Delivery</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:11, color:'#6B7F78', marginBottom:4, fontWeight:600 }}>Vendor *</div>
                <input value={dVendor} onChange={e=>setDVendor(e.target.value)}
                  placeholder="e.g. Sysco, Lone Star Dairy" style={inp} />
              </div>
              <div>
                <div style={{ fontSize:11, color:'#6B7F78', marginBottom:4, fontWeight:600 }}>Date *</div>
                <input type="date" value={dDate} onChange={e=>setDDate(e.target.value)} style={inp} />
              </div>
            </div>

            {/* Items table */}
            <div style={{ fontSize:11, color:'#6B7F78', marginBottom:6, fontWeight:600 }}>Items Received</div>
            <div style={{ border:'1px solid #E3DDD0', borderRadius:8, overflow:'hidden', marginBottom:10 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px 36px', background:'#1A4C48', padding:'6px 10px', gap:8 }}>
                <div style={{ fontSize:10, color:'#fff', fontWeight:700 }}>ITEM NAME</div>
                <div style={{ fontSize:10, color:'#fff', fontWeight:700 }}>QTY</div>
                <div style={{ fontSize:10, color:'#fff', fontWeight:700 }}>UNIT COST</div>
                <div />
              </div>
              {dItems.map((it, idx) => (
                <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px 36px', padding:'6px 10px', gap:8, borderBottom:'1px solid #EFEBE0', background: idx%2===0?'#fff':'#FAF8F3', alignItems:'center' }}>
                  <input value={it.name} onChange={e=>updateDelivItem(idx,'name',e.target.value)}
                    placeholder="Item name" style={{ ...inp, marginBottom:0 }} />
                  <input type="number" min="0" step="0.01" value={it.qty}
                    onChange={e=>updateDelivItem(idx,'qty',e.target.value)}
                    placeholder="0" style={{ ...inp, marginBottom:0, textAlign:'right' }} />
                  <input type="number" min="0" step="0.01" value={it.cost}
                    onChange={e=>updateDelivItem(idx,'cost',e.target.value)}
                    placeholder="$0.00" style={{ ...inp, marginBottom:0, textAlign:'right' }} />
                  <button onClick={() => removeDelivItem(idx)}
                    style={{ background:'none', border:'none', color:'#C62828', cursor:'pointer', fontSize:18, padding:0, lineHeight:1 }}>
                    ×
                  </button>
                </div>
              ))}
              <div style={{ padding:'8px 10px', background:'#F6F4ED' }}>
                <button onClick={addDelivItem} style={{ ...btnSec, padding:'5px 12px', fontSize:12 }}>+ Add Item</button>
                <span style={{ float:'right', fontSize:12, color:'#1A4C48', fontWeight:700, lineHeight:'28px' }}>
                  Total: {fmt$(dItems.reduce((s,it)=>s+(parseFloat(it.qty)||0)*(parseFloat(it.cost)||0),0))}
                </span>
              </div>
            </div>

            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#6B7F78', marginBottom:4, fontWeight:600 }}>Notes (optional)</div>
              <input value={delivNotes} onChange={e=>setDelivNotes(e.target.value)}
                placeholder="Invoice #, temp issues, etc." style={inp} />
            </div>

            <button onClick={saveDelivery} disabled={savingDeliv}
              style={{ ...btnPri, opacity:savingDeliv?0.7:1 }}>
              {savingDeliv ? 'Saving...' : 'Save Delivery'}
            </button>
          </div>

          {/* Deliveries history */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48' }}>Delivery History</div>
            {deliveries.length > 0 && (
              <button onClick={exportDeliveries} style={btnSec}>Export Excel</button>
            )}
          </div>
          {!delivLoaded && <div style={{ color:'#6B7F78', fontSize:13, padding:16 }}>Loading...</div>}
          {delivLoaded && deliveries.length === 0 && (
            <div style={{ ...card, textAlign:'center', color:'#6B7F78' }}>No deliveries logged yet.</div>
          )}
          {deliveries.map(d => (
            <div key={d.id} style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48' }}>{d.vendor}</div>
                  <div style={{ fontSize:11, color:'#6B7F78' }}>
                    {d.date} · {d.items?.length||0} items
                    {d.createdBy ? ` · by ${d.createdBy}` : ''}
                  </div>
                  {d.notes && <div style={{ fontSize:11, color:'#6B7F78', marginTop:2, fontStyle:'italic' }}>{d.notes}</div>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'#C62828' }}>{fmt$(d.totalCost)}</div>
                  <button onClick={() => deleteDelivery(d.id)}
                    style={{ background:'none', border:'none', color:'#C62828', cursor:'pointer', fontSize:16, padding:4 }}>
                    ×
                  </button>
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {(d.items||[]).map((it,i) => (
                  <span key={i} style={{ background:'#EFEBE0', borderRadius:6, padding:'3px 8px', fontSize:11, color:'#1A4C48' }}>
                    {it.name} × {it.qty} @ {fmt$(it.cost)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* COGS REPORT TAB */}
      {subTab === 'cogs' && (
        <div>
          {!historyLoaded && <div style={{ color:'#6B7F78', padding:16 }}>Loading...</div>}
          {historyLoaded && !latest && (
            <div style={{ ...card, textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
              <div style={{ fontSize:14, fontWeight:600, color:'#1A4C48', marginBottom:6 }}>No Sales Data Yet</div>
              <div style={{ fontSize:12, color:'#6B7F78' }}>Upload your Clover Excel in the Sales Upload tab</div>
            </div>
          )}
          {historyLoaded && latest && (
            <div>
              {/* Benchmark banner */}
              <div style={{ ...card, display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <div style={{ width:12, height:12, borderRadius:'50%', flexShrink:0, background: cogsPct<25?'#3B8050':cogsPct<32?'#C1683C':'#C62828' }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color: cogsPct<25?'#3B8050':cogsPct<32?'#C1683C':'#C62828' }}>
                    {cogsPct<25?'Excellent food cost control':cogsPct<32?'Within industry benchmark':'Above benchmark — review pricing'}
                  </div>
                  <div style={{ fontSize:11, color:'#6B7F78' }}>
                    {cogsPct<25?'Below 25% — great result':cogsPct<32?'25–32% — industry standard':'Above 32% — review portions or pricing'}
                  </div>
                </div>
                <div style={{ fontSize:22, fontWeight:800, color: cogsPct<25?'#3B8050':cogsPct<32?'#C1683C':'#C62828' }}>
                  {cogsPct.toFixed(1)}%
                </div>
              </div>

              {/* Category breakdown */}
              <div style={{ fontSize:12, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>By Category</div>
              <div style={card}>
                {Object.entries(CAT_REVENUE_PCT).sort((a,b)=>b[1]-a[1]).map(([cat, pct]) => {
                  const rev  = revenue * pct
                  const cost = rev * (CAT_COGS[cat] || 0.20)
                  const cp   = (CAT_COGS[cat]||0.20)*100
                  return (
                    <div key={cat} style={{ padding:'8px 0', borderBottom:'1px solid #EFEBE0' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <span style={{ fontSize:12, fontWeight:600, color:'#1A4C48' }}>{cat}</span>
                        <div style={{ display:'flex', gap:14, fontSize:11 }}>
                          <span style={{ color:'#6B7F78' }}>{fmt$(rev)}</span>
                          <span style={{ color:'#C1683C', fontWeight:700 }}>{cp.toFixed(0)}% COGS</span>
                          <span style={{ color:'#C62828', fontWeight:600 }}>{fmt$(cost)}</span>
                        </div>
                      </div>
                      <div style={{ background:'#E3DDD0', borderRadius:4, height:4 }}>
                        <div style={{ background:'#C1683C', height:4, borderRadius:4, width:`${(pct*100).toFixed(0)}%` }} />
                      </div>
                    </div>
                  )
                })}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 2px', fontWeight:700, fontSize:13 }}>
                  <span style={{ color:'#1A4C48' }}>Total</span>
                  <div style={{ display:'flex', gap:14 }}>
                    <span style={{ color:'#3B8050' }}>{fmt$(revenue)}</span>
                    <span style={{ color:'#C62828' }}>{fmt$(totalCOGS)} COGS</span>
                  </div>
                </div>
              </div>

              {/* Upload history */}
              <div style={{ fontSize:12, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8, marginTop:4 }}>Upload History</div>
              <div style={card}>
                {salesHistory.map((d,idx) => (
                  <div key={d.id} style={{ display:'flex', alignItems:'center', padding:'8px 0', borderBottom: idx<salesHistory.length-1?'1px solid #EFEBE0':'none', gap:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'#1A4C48' }}>{d.period || 'Upload'}</div>
                      <div style={{ fontSize:11, color:'#6B7F78' }}>
                        {d.itemsSold||0} items · {new Date(d.appliedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#3B8050' }}>{fmt$(d.revenue)}</div>
                      <div style={{ fontSize:11, color:'#C1683C' }}>{cogsPct.toFixed(1)}% COGS</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MENU MARGINS TAB */}
      {subTab === 'margins' && (
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            {['all','Ice Cream','Drinks','Coffee'].map(cat => (
              <button key={cat} className={`cat-btn ${marginCat===cat?'active':''}`}
                onClick={() => setMarginCat(cat)}>
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
          {(marginCat==='all' ? MENU_MARGINS : MENU_MARGINS.filter(i=>i.cat===marginCat)).map(item => {
            const margin  = ((item.sell - item.cost) / item.sell * 100)
            const cp      = (item.cost / item.sell * 100)
            const color   = cp<20?'#3B8050':cp<30?'#C1683C':'#C62828'
            return (
              <div key={item.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--cream,#F6F4ED)', borderRadius:10, marginBottom:6, border:'1px solid var(--border,#E3DDD0)' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#1A4C48' }}>{item.name}</div>
                  <div style={{ fontSize:11, color:'#6B7F78' }}>
                    Cost: {fmt$(item.cost)} · Sell: {fmt$(item.sell)} · {item.cat}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:18, fontWeight:700, color }}>{margin.toFixed(0)}%</div>
                  <div style={{ fontSize:10, color:'#6B7F78' }}>margin</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
