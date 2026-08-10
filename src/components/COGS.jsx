import { useState, useEffect, useRef } from 'react'
import { SkeletonStats, SkeletonRows } from './Skeleton'
import { confirm } from './ConfirmDialog'
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import { parseCloverReport } from '../utils/cloverParser'
import { withRetry } from '../utils/withRetry'

// ── Static theoretical margins (per-product view) ────────────────────────────
const MENU_MARGINS = [
  { name:'Kids Scoop',       cat:'Ice Cream', cost:1.20, sell:4.61 },
  { name:'Regular Scoop',    cat:'Ice Cream', cost:2.10, sell:6.72 },
  { name:'Milkshake',        cat:'Ice Cream', cost:4.20, sell:8.99 },
  { name:'Hand Packed',      cat:'Ice Cream', cost:4.00, sell:11.45 },
  { name:'Flight of 4',      cat:'Ice Cream', cost:3.00, sell:9.31 },
  { name:'Affogato',         cat:'Coffee',    cost:3.04, sell:6.25 },
  { name:'Milk Tea',         cat:'Drinks',    cost:0.67, sell:6.29 },
  { name:'Fruit Tea',        cat:'Drinks',    cost:0.67, sell:6.26 },
  { name:'Slush',            cat:'Drinks',    cost:0.67, sell:6.28 },
  { name:'Smoothie',         cat:'Drinks',    cost:0.67, sell:6.28 },
  { name:'Falooda',          cat:'Drinks',    cost:1.87, sell:7.94 },
  { name:'Americano',        cat:'Coffee',    cost:0.94, sell:3.25 },
  { name:'Latte/Cappuccino', cat:'Coffee',    cost:1.31, sell:5.50 },
  { name:'Mocha',            cat:'Coffee',    cost:1.59, sell:5.95 },
  { name:'Specialty Coffee', cat:'Coffee',    cost:1.84, sell:6.10 },
]

// Map a Clover sales category name → COGS group (matches invoice categories).
// Tuned against the real Dumont Clover categories: Ice Cream, Coffee, Milk Tea,
// Bakery, Falooda, Fruit Tea, Slush, Smoothie, Specialty Beverages, Sides, Uncategorized.
function revGroup(catName = '') {
  const c = String(catName).toLowerCase()
  if (/ice ?cream|scoop|dessert|sundae|shake|gelato|cone/.test(c))            return 'icecream'
  if (/tea|boba|slush|smoothie|falooda|drink|beverage|juice|soda/.test(c))    return 'drinks'
  if (/coffee|espresso|latte|affogato/.test(c))                              return 'coffee'
  if (/bakery|cake|pastry|waffle|croissant|cookie/.test(c))                   return 'bakery'
  return 'other'
}
const GROUPS = [
  { id:'icecream', label:'Ice Cream',     color:'#C1683C' },
  { id:'drinks',   label:'Boba & Drinks', color:'#2980B9' },
  { id:'coffee',   label:'Coffee',        color:'#6D4C41' },
  { id:'bakery',   label:'Bakery',        color:'#9B59B6' },
  { id:'other',    label:'Other',         color:'#95A5A6' },
]

function monthOptions(n = 12) {
  const opts = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
                label: d.toLocaleDateString('en-US', { month:'long', year:'numeric' }) })
  }
  return opts
}
const MONTHS = monthOptions()
const fmt  = n => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtD = n => `$${Number(n || 0).toFixed(2)}`

export default function COGS({ viewingStore, viewingOrg, auth, showToast }) {
  const orgId = viewingOrg || auth?.userConfig?.orgId || 'dumont'
  const [view,      setView]      = useState('report')   // report | upload | margins
  const [monthKey,  setMonthKey]  = useState(MONTHS[0].key)
  const [sales,     setSales]     = useState([])          // salesLedger docs for this store
  const [purchases, setPurchases] = useState([])          // approved invoices (org)
  const [loading,   setLoading]   = useState(false)
  const [marginCat, setMarginCat] = useState('all')

  // Upload state
  const [parsed,      setParsed]      = useState(null)
  const [uploadMonth, setUploadMonth] = useState(MONTHS[0].key)
  const [savingUp,    setSavingUp]    = useState(false)
  const fileRef = useRef()

  useEffect(() => { if (viewingStore) loadAll() }, [viewingStore, orgId])

  async function loadAll() {
    setLoading(true)
    try {
      const [salesSnap, invSnap] = await Promise.all([
        getDocs(query(collection(db, 'stores', viewingStore, 'salesLedger'), orderBy('appliedAt', 'desc'), limit(36))),
        getDocs(query(collection(db, 'invoices'), where('orgId', '==', orgId), where('approved', '==', true))),
      ])
      setSales(salesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setPurchases(invSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        // this store's invoices (legacy invoices without storeId count for all stores)
        .filter(i => !i.storeId || i.storeId === viewingStore))
    } catch(e) { console.error('COGS load:', e) }
    setLoading(false)
  }

  // ── Month computations ─────────────────────────────────────────────────────
  function monthData(mk) {
    const monthSales = sales.filter(s => s.monthKey === mk)
    const revenue    = monthSales.reduce((s, d) => s + (d.revenue || 0), 0)
    const byCategory = {}
    monthSales.forEach(d => Object.entries(d.byCategory || {}).forEach(([c, v]) => {
      byCategory[c] = (byCategory[c] || 0) + v
    }))
    const monthInv = purchases.filter(i => (i.invoiceDate || '').startsWith(mk))
    const cogsInv  = monthInv.filter(i => i.category !== 'opex')
    const cogsCost = cogsInv.reduce((s, i) => s + (i.total || 0), 0)
    const opexCost = monthInv.filter(i => i.category === 'opex').reduce((s, i) => s + (i.total || 0), 0)
    const purchByCat = {}
    cogsInv.forEach(i => {
      const c = i.category || 'other'
      purchByCat[c] = (purchByCat[c] || 0) + (i.total || 0)
    })
    const vendorSpend = {}
    cogsInv.forEach(i => { vendorSpend[i.vendor || '?'] = (vendorSpend[i.vendor || '?'] || 0) + (i.total || 0) })
    return { revenue, byCategory, cogsCost, opexCost, purchByCat, vendorSpend, invCount: cogsInv.length }
  }

  const d = monthData(monthKey)
  const margin    = d.revenue - d.cogsCost
  const cogsPct   = d.revenue > 0 ? (d.cogsCost / d.revenue * 100) : 0
  const marginPct = d.revenue > 0 ? (margin / d.revenue * 100) : 0
  // Ice cream shop benchmarks: COGS ≤30% excellent, ≤40% watch, >40% high
  const health      = d.revenue === 0 ? '—' : cogsPct <= 30 ? 'Excellent' : cogsPct <= 40 ? 'On Watch' : 'Too High'
  const healthColor = d.revenue === 0 ? '#6B7F78' : cogsPct <= 30 ? '#276749' : cogsPct <= 40 ? '#C1683C' : '#C53030'

  // Revenue grouped for category COGS table
  const revByGroup = {}
  Object.entries(d.byCategory).forEach(([cat, v]) => {
    const g = revGroup(cat)
    revByGroup[g] = (revByGroup[g] || 0) + v
  })

  const trend = MONTHS.slice(0, 6).map(m => ({ ...m, ...monthData(m.key) }))
  const uploadedMonths = [...new Set(sales.map(s => s.monthKey))].sort().reverse()

  // ── Upload handlers ────────────────────────────────────────────────────────
  function handleFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const p = parseCloverReport(new Uint8Array(ev.target.result))
        if (!p) { showToast('Could not read this file — export "Item Sales" from Clover Reporting → Revenue'); return }
        setParsed(p)
        if (p.firstDate) {
          setUploadMonth(`${p.firstDate.getFullYear()}-${String(p.firstDate.getMonth()+1).padStart(2,'0')}`)
        }
      } catch(err) {
        console.error(err)
        showToast('Error reading file — is it the Clover export?')
      }
    }
    reader.readAsArrayBuffer(f)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function saveUpload() {
    if (!parsed) return
    if (!viewingStore) { showToast('No store selected — pick a store in the header first'); return }
    const existing = sales.filter(s => s.monthKey === uploadMonth)
    if (existing.length) {
      const prev = existing.reduce((s,x)=>s+(x.revenue||0),0)
      const ok = await confirm({
        title: `Replace ${MONTHS.find(m=>m.key===uploadMonth)?.label}?`,
        message: `This month already has ${fmt(prev)} of revenue uploaded. Saving will replace it with ${fmt(parsed.revenue)}.`,
        confirmLabel: 'Replace',
      })
      if (!ok) return
    }
    setSavingUp(true)
    try {
      const mDate = new Date(uploadMonth + '-15T12:00:00')
      // Save the NEW upload before deleting the old one — if the save fails after
      // retries, the store still has last month's revenue instead of nothing.
      await withRetry(() => addDoc(collection(db, 'stores', viewingStore, 'salesLedger'), {
        revenue:    parsed.revenue,
        itemsSold:  parsed.itemsSold,
        period:     parsed.period,
        rows:       parsed.rows,
        byCategory: parsed.byCategory,
        monthKey:   uploadMonth,
        month:      mDate.toLocaleDateString('en-US', { month:'long', year:'numeric' }),
        appliedAt:  Date.now(),
        uploadedBy: auth?.userConfig?.name || auth?.user?.email || '',
      }))
      for (const ex of existing) {
        try { await deleteDoc(doc(db, 'stores', viewingStore, 'salesLedger', ex.id)) }
        catch(e) { console.warn('Could not remove replaced upload:', e) }
      }
      showToast('Sales uploaded ✓')
      setParsed(null)
      setMonthKey(uploadMonth)
      await loadAll()
      setView('report')
    } catch(e) {
      console.error('saveUpload failed:', e)
      // Surface the real cause — a generic message makes this impossible to diagnose
      const why = e?.code === 'permission-denied'
        ? 'permission denied (Firestore rules / your role)'
        : e?.code === 'invalid-argument'
          ? 'invalid data for Firestore'
          : (e?.code || e?.message || 'unknown error')
      showToast(`Save failed: ${why}`)
    }
    setSavingUp(false)
  }

  async function deleteUpload(s) {
    if (!await confirm({ title:`Delete ${s.month} sales?`, message:'The uploaded revenue for this month will be removed.', danger:true })) return
    await deleteDoc(doc(db, 'stores', viewingStore, 'salesLedger', s.id))
    showToast('Deleted')
    loadAll()
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const btn = id => ({
    flex: 1, padding: '10px 6px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12.5, fontWeight: view === id ? 700 : 500, fontFamily: 'inherit',
    background: view === id ? 'var(--dark)' : '#fff',
    color:      view === id ? '#fff'        : 'var(--text-muted)',
    border:     view === id ? 'none'        : '1px solid var(--border)',
  })
  const kpi = (label, value, color, sub) => (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#6B7F78', marginTop: 2 }}>{sub}</div>}
    </div>
  )
  const card = { background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:14 }
  const cardHead = { padding:'11px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.05em' }

  if (!viewingStore) return (
    <div style={{ textAlign:'center', padding:32, color:'#6B7F78', fontSize:13 }}>Select a store to view Sales & COGS.</div>
  )

  const maxCatRev = Math.max(1, ...Object.values(d.byCategory))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={btn('report')}  onClick={() => setView('report')}>📊 COGS Report</button>
        <button style={btn('upload')}  onClick={() => setView('upload')}>⬆️ Upload Sales</button>
        <button style={btn('margins')} onClick={() => setView('margins')}>💰 Menu Margins</button>
      </div>

      {/* ═══ UPLOAD SALES ═══════════════════════════════════════════════════ */}
      {view === 'upload' && (
        <div>
          <div style={card}>
            <div style={{ padding:16 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--dark)', marginBottom:4 }}>Upload Clover Sales Report</div>
              <div style={{ fontSize:12, color:'#6B7F78', marginBottom:12, lineHeight:1.6 }}>
                In Clover: <strong>Reporting → Revenue → Item Sales</strong> → set the date range to the
                month → Export. Upload that CSV or Excel file here.
              </div>
              <input type="file" accept=".xlsx,.xls,.csv" ref={fileRef} onChange={handleFile} style={{ display:'none' }} />
              <button onClick={() => fileRef.current?.click()}
                style={{ width:'100%', background:'#FDF9F3', border:'1.5px dashed #C1683C', borderRadius:10, padding:'16px', cursor:'pointer', fontSize:14, color:'#C1683C', fontWeight:700, fontFamily:'inherit' }}>
                📈 Choose Clover Report File
              </button>

              {parsed && (
                <div style={{ marginTop:14, background:'#F0FFF4', border:'1px solid #81C784', borderRadius:10, padding:14 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:'#276749' }}>
                    {fmt(parsed.revenue)} <span style={{ fontSize:12, fontWeight:600 }}>net sales</span>
                  </div>
                  <div style={{ fontSize:12, color:'#276749', marginBottom:8 }}>
                    {parsed.itemsSold.toLocaleString()} items sold · {parsed.rows.length} products · {parsed.period}
                  </div>
                  {!parsed.reconciled && (
                    <div style={{ fontSize:11, color:'#8B5A00', background:'#FFF8EC', border:'1px solid #FFB74D', borderRadius:6, padding:'6px 10px', marginBottom:8 }}>
                      ⚠ Category totals ({fmt(parsed.catSum)}) don't match the report total ({fmt(parsed.grandTotal)}).
                      Check the file before saving.
                    </div>
                  )}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                    {Object.entries(parsed.byCategory).sort((a,b) => b[1]-a[1]).map(([c, v]) => (
                      <span key={c} style={{ fontSize:11, background:'#fff', border:'1px solid #C8E6C9', borderRadius:6, padding:'3px 8px', color:'#276749' }}>
                        {c}: {fmt(v)}
                      </span>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <span style={{ fontSize:12, color:'#6B7F78', fontWeight:600 }}>This is sales for:</span>
                    <select value={uploadMonth} onChange={e => setUploadMonth(e.target.value)}
                      style={{ padding:'8px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer' }}>
                      {MONTHS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                    <button onClick={saveUpload} disabled={savingUp}
                      style={{ background:'#276749', color:'#fff', border:'none', borderRadius:8, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit' }}>
                      {savingUp ? 'Saving…' : 'Save Revenue'}
                    </button>
                    <button onClick={() => setParsed(null)}
                      style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'9px 14px', cursor:'pointer', fontSize:13, fontFamily:'inherit', color:'#6B7F78' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Existing uploads */}
          <div style={card}>
            <div style={cardHead}>Uploaded Months</div>
            {sales.length === 0 ? (
              <div style={{ padding:20, textAlign:'center', color:'#6B7F78', fontSize:13 }}>Nothing uploaded yet</div>
            ) : sales.map(s => (
              <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderBottom:'1px solid #EFEBE0' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{s.month || s.monthKey}</div>
                  <div style={{ fontSize:11, color:'#6B7F78' }}>{s.period} · by {s.uploadedBy}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:'#276749' }}>{fmt(s.revenue)}</div>
                  <button onClick={() => deleteUpload(s)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#bbb', fontSize:13 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ COGS REPORT ════════════════════════════════════════════════════ */}
      {view === 'report' && (
        <div>
          {/* Month picker */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <label style={{ fontSize:13, color:'#6B7F78', fontWeight:600 }}>Month</label>
            <select value={monthKey} onChange={e => setMonthKey(e.target.value)}
              style={{ padding:'8px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer' }}>
              {MONTHS.map(m => (
                <option key={m.key} value={m.key}>
                  {m.label}{uploadedMonths.includes(m.key) ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <><SkeletonStats count={4} columns={2} /><SkeletonRows count={4} /></>
          ) : (
            <>
              {d.revenue === 0 && (
                <div style={{ textAlign:'center', padding:'22px 16px', background:'#FFF8EC', borderRadius:12, border:'1px solid #FFB74D', marginBottom:14, fontSize:13, color:'#8B5A00' }}>
                  No revenue uploaded for {MONTHS.find(m => m.key === monthKey)?.label}.<br/>
                  <button onClick={() => setView('upload')}
                    style={{ marginTop:8, background:'#C1683C', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}>
                    ⬆️ Upload Clover Sales
                  </button>
                </div>
              )}

              {/* KPI cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:14 }}>
                {kpi('Revenue', fmt(d.revenue), '#276749', 'from Clover upload')}
                {kpi('COGS Purchases', fmt(d.cogsCost), '#C53030', `${d.invCount} approved invoice${d.invCount!==1?'s':''}`)}
                {kpi('COGS %', d.revenue > 0 ? `${cogsPct.toFixed(1)}%` : '—', healthColor, health)}
                {kpi('Gross Margin', d.revenue > 0 ? fmt(margin) : '—', marginPct >= 60 ? '#276749' : '#C1683C', d.revenue > 0 ? `${marginPct.toFixed(1)}% of revenue` : '')}
              </div>

              {/* Revenue by category */}
              {Object.keys(d.byCategory).length > 0 && (
                <div style={card}>
                  <div style={cardHead}>Revenue by Category</div>
                  {Object.entries(d.byCategory).sort((a,b) => b[1]-a[1]).map(([cat, v]) => {
                    const g = GROUPS.find(x => x.id === revGroup(cat)) || GROUPS[4]
                    return (
                      <div key={cat} style={{ padding:'8px 16px', borderBottom:'1px solid #EFEBE0' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{cat}</span>
                          <span style={{ fontSize:13, fontWeight:700, color:g.color }}>
                            {fmt(v)} <span style={{ fontSize:10, color:'#6B7F78', fontWeight:400 }}>({(v/d.revenue*100).toFixed(0)}%)</span>
                          </span>
                        </div>
                        <div style={{ background:'#EFEBE0', borderRadius:4, height:6 }}>
                          <div style={{ background:g.color, height:6, borderRadius:4, width:`${(v/maxCatRev*100).toFixed(0)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* COGS by category — purchases vs matching revenue group */}
              {(d.cogsCost > 0 || d.revenue > 0) && (
                <div style={card}>
                  <div style={cardHead}>COGS by Category</div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                      <thead>
                        <tr style={{ background:'#FAFAF8' }}>
                          {['Category','Revenue','Purchases','COGS %'].map(h => (
                            <th key={h} style={{ padding:'9px 14px', textAlign: h==='Category' ? 'left' : 'right', color:'#6B7F78', fontWeight:600, fontSize:12, whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {GROUPS.filter(g => (revByGroup[g.id] || 0) > 0 || (d.purchByCat[g.id] || 0) > 0).map(g => {
                          const rev = revByGroup[g.id] || 0
                          const pur = d.purchByCat[g.id] || 0
                          const pct = rev > 0 ? (pur / rev * 100) : null
                          return (
                            <tr key={g.id} style={{ borderTop:'1px solid var(--border)' }}>
                              <td style={{ padding:'9px 14px' }}>
                                <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:g.color, marginRight:8 }}/>
                                <span style={{ fontWeight:600, color:'var(--dark)' }}>{g.label}</span>
                              </td>
                              <td style={{ padding:'9px 14px', textAlign:'right', color:'#276749' }}>{rev > 0 ? fmt(rev) : '—'}</td>
                              <td style={{ padding:'9px 14px', textAlign:'right', color:'#C53030' }}>{pur > 0 ? fmt(pur) : '—'}</td>
                              <td style={{ padding:'9px 14px', textAlign:'right', fontWeight:700,
                                color: pct == null ? '#aaa' : pct <= 30 ? '#276749' : pct <= 40 ? '#C1683C' : '#C53030' }}>
                                {pct == null ? (pur > 0 ? 'no rev' : '—') : `${pct.toFixed(1)}%`}
                              </td>
                            </tr>
                          )
                        })}
                        {(d.purchByCat['packaging'] || 0) > 0 && (
                          <tr style={{ borderTop:'1px solid var(--border)', background:'#FAFAF8' }}>
                            <td style={{ padding:'9px 14px', color:'#6B7F78' }}>📦 Packaging (all categories)</td>
                            <td style={{ padding:'9px 14px' }}/>
                            <td style={{ padding:'9px 14px', textAlign:'right', color:'#C53030' }}>{fmt(d.purchByCat['packaging'])}</td>
                            <td style={{ padding:'9px 14px', textAlign:'right', color:'#6B7F78', fontWeight:600 }}>
                              {d.revenue > 0 ? `${(d.purchByCat['packaging']/d.revenue*100).toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Vendor spend */}
              {Object.keys(d.vendorSpend).length > 0 && (
                <div style={card}>
                  <div style={cardHead}>Vendor Spend This Month</div>
                  {Object.entries(d.vendorSpend).sort((a,b) => b[1]-a[1]).map(([v, amt]) => (
                    <div key={v} style={{ display:'flex', justifyContent:'space-between', padding:'9px 16px', borderBottom:'1px solid #EFEBE0' }}>
                      <span style={{ fontSize:13, color:'var(--dark)', fontWeight:500 }}>{v}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:'#C53030' }}>{fmt(amt)}</span>
                    </div>
                  ))}
                  {d.opexCost > 0 && (
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'9px 16px', background:'#FAFAF8' }}>
                      <span style={{ fontSize:12, color:'#6B7F78' }}>Operating expenses (excluded from COGS)</span>
                      <span style={{ fontSize:12, fontWeight:600, color:'#6B7F78' }}>{fmt(d.opexCost)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Month-over-month trend */}
              <div style={card}>
                <div style={cardHead}>Month-over-Month</div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#FAFAF8' }}>
                        {['Month','Revenue','Δ vs prev','Purchases','COGS %'].map(h => (
                          <th key={h} style={{ padding:'9px 14px', textAlign: h==='Month' ? 'left' : 'right', color:'#6B7F78', fontWeight:600, fontSize:12, whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map((row, i) => {
                        const prev = trend[i+1]
                        const delta = prev && prev.revenue > 0 && row.revenue > 0
                          ? ((row.revenue - prev.revenue) / prev.revenue * 100) : null
                        const pct = row.revenue > 0 ? (row.cogsCost / row.revenue * 100) : null
                        const sel = row.key === monthKey
                        return (
                          <tr key={row.key} onClick={() => setMonthKey(row.key)}
                            style={{ borderTop:'1px solid var(--border)', cursor:'pointer', background: sel ? '#FFFBF0' : 'transparent' }}>
                            <td style={{ padding:'9px 14px', fontWeight: sel ? 700 : 400, color:'var(--dark)', whiteSpace:'nowrap' }}>
                              {row.label.replace(/ 20\d\d/,'')} {sel && '←'}
                            </td>
                            <td style={{ padding:'9px 14px', textAlign:'right', color:'#276749', fontWeight:600 }}>{row.revenue > 0 ? fmt(row.revenue) : '—'}</td>
                            <td style={{ padding:'9px 14px', textAlign:'right', fontWeight:700,
                              color: delta == null ? '#aaa' : delta >= 0 ? '#276749' : '#C53030' }}>
                              {delta == null ? '—' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}%`}
                            </td>
                            <td style={{ padding:'9px 14px', textAlign:'right', color:'#C53030' }}>{row.cogsCost > 0 ? fmt(row.cogsCost) : '—'}</td>
                            <td style={{ padding:'9px 14px', textAlign:'right', fontWeight:700,
                              color: pct == null ? '#aaa' : pct <= 30 ? '#276749' : pct <= 40 ? '#C1683C' : '#C53030' }}>
                              {pct == null ? '—' : `${pct.toFixed(1)}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ fontSize:11, color:'#aaa', marginTop:4, lineHeight:1.6 }}>
                Revenue = uploaded Clover sales for this store · Purchases = approved invoices for this store dated in the month
                (Operating Expense excluded) · COGS % = Purchases ÷ Revenue. Benchmark for ice cream: ≤30% excellent, 30–40% watch, &gt;40% high.
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ MENU MARGINS ═══════════════════════════════════════════════════ */}
      {view === 'margins' && (
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
            {['all','Ice Cream','Drinks','Coffee'].map(cat => (
              <button key={cat} onClick={() => setMarginCat(cat)} style={{
                padding:'7px 14px', borderRadius:20, cursor:'pointer',
                fontSize:12, fontWeight: marginCat===cat ? 700 : 500, fontFamily:'inherit',
                background: marginCat===cat ? 'var(--dark)' : '#fff',
                color:      marginCat===cat ? '#fff'        : 'var(--text-muted)',
                border:     marginCat===cat ? 'none'        : '1px solid var(--border)',
              }}>
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {(marginCat === 'all' ? MENU_MARGINS : MENU_MARGINS.filter(i => i.cat === marginCat)).map(item => {
              const m       = (item.sell - item.cost) / item.sell * 100
              const cogsP   = item.cost / item.sell * 100
              const color   = cogsP < 20 ? '#276749' : cogsP < 30 ? '#C1683C' : '#C53030'
              return (
                <div key={item.name} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', background:'#fff', border:'1px solid var(--border)', borderRadius:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{item.name}</div>
                    <div style={{ fontSize:11, color:'#6B7F78', marginTop:2 }}>
                      Cost {fmtD(item.cost)} · Sell {fmtD(item.sell)} · COGS {cogsP.toFixed(0)}%
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:18, fontWeight:700, color }}>{m.toFixed(0)}%</div>
                    <div style={{ fontSize:10, color:'#6B7F78' }}>margin</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
