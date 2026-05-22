import { useState, useMemo } from 'react'

const INIT_PRODUCTS = [
  { id:1,  cat:'Ice Cream', name:'Kids Scoop',         price:4.95,  cost:1.20, unitsDay:40 },
  { id:2,  cat:'Ice Cream', name:'Medium Scoop',        price:7.25,  cost:1.40, unitsDay:40 },
  { id:3,  cat:'Ice Cream', name:'Large Scoop',         price:6.25,  cost:2.10, unitsDay:20 },
  { id:4,  cat:'Ice Cream', name:'Hand Packed',         price:13.95, cost:4.00, unitsDay:10 },
  { id:5,  cat:'Ice Cream', name:'Sampler',             price:10.45, cost:3.00, unitsDay:10 },
  { id:6,  cat:'Drinks',    name:'Drinks (Tea/Slush)',   price:6.25,  cost:0.67, unitsDay:30 },
  { id:7,  cat:'Drinks',    name:'Falooda',              price:9.99,  cost:4.00, unitsDay:0  },
  { id:8,  cat:'Drinks',    name:'Milk Shake',           price:9.99,  cost:4.00, unitsDay:0  },
  { id:9,  cat:'Coffee',    name:'Americano (Hot)',      price:3.75,  cost:0.94, unitsDay:0  },
  { id:10, cat:'Coffee',    name:'Americano (Cold)',     price:4.25,  cost:0.94, unitsDay:0  },
  { id:11, cat:'Coffee',    name:'Espresso',             price:3.25,  cost:0.94, unitsDay:0  },
  { id:12, cat:'Coffee',    name:'Cappuccino / Latte (Hot)',  price:4.75,  cost:1.31, unitsDay:5  },
  { id:13, cat:'Coffee',    name:'Cappuccino / Latte (Cold)', price:5.45,  cost:1.31, unitsDay:5  },
  { id:14, cat:'Coffee',    name:'Mocha',                price:5.45,  cost:1.59, unitsDay:5  },
  { id:15, cat:'Coffee',    name:'Specialty Coffee',     price:6.25,  cost:1.84, unitsDay:25 },
]

const INIT_OPEX = [
  { name:'Staffing & Wages',       monthly:8500, benchmark:'30–35% of revenue' },
  { name:'Rent & Occupancy',       monthly:3500, benchmark:'10–15% of revenue' },
  { name:'Utilities',              monthly:800,  benchmark:'3–5%' },
  { name:'Supplies & Packaging',   monthly:600,  benchmark:'2–3%' },
  { name:'Marketing & Promotions', monthly:500,  benchmark:'2–4%' },
  { name:'Equipment Maintenance',  monthly:300,  benchmark:'1–2%' },
  { name:'Insurance',              monthly:250,  benchmark:'1%' },
  { name:'POS / Software / Misc',  monthly:200,  benchmark:'0.5–1%' },
]

const CATS = ['Ice Cream', 'Drinks', 'Coffee']
const cat_color = { 'Ice Cream':'#FFF0F0', Drinks:'#F0F4FF', Coffee:'#F5F0E8' }

function load(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

const fmt  = n  => `$${Number(n||0).toLocaleString('en-US',{maximumFractionDigits:0})}`
const fmtD = n  => `$${Number(n||0).toFixed(2)}`
const pct  = n  => `${(Number(n||0)*100).toFixed(1)}%`
const sum  = arr => arr.reduce((a,b) => a+b, 0)

export default function PLSimulator() {
  const [view,     setView]     = useState('pl')
  const [products, setProducts] = useState(() => load('pls4_products', INIT_PRODUCTS))
  const [opex,     setOpex]     = useState(() => load('pls4_opex',     INIT_OPEX))
  const [settings, setSettings] = useState(() => load('pls4_settings', { daysPerYear:360, taxRate:0.08, targetMargin:0.15 }))
  const [mixTotal, setMixTotal] = useState(() => load('pls4_mixTotal', 190))
  const [mixPct,   setMixPct]   = useState(() => load('pls4_mixPct',   { 'Ice Cream':0.40, Drinks:0.30, Coffee:0.30 }))

  function updateProduct(id, field, val) {
    const updated = products.map(p => p.id === id ? { ...p, [field]: Number(val)||0 } : p)
    setProducts(updated); save('pls4_products', updated)
  }
  function updateOpex(i, val) {
    const updated = opex.map((e,idx) => idx === i ? { ...e, monthly: Number(val)||0 } : e)
    setOpex(updated); save('pls4_opex', updated)
  }
  function updateSetting(k, v) {
    const updated = { ...settings, [k]: Number(v)||0 }
    setSettings(updated); save('pls4_settings', updated)
  }
  function updateMixPct(cat, val) {
    const updated = { ...mixPct, [cat]: Number(val)||0 }
    setMixPct(updated); save('pls4_mixPct', updated)
  }

  const calc = useMemo(() => {
    const days = settings.daysPerYear
    const tax  = settings.taxRate
    const tgt  = settings.targetMargin

    const prods = products.map(p => ({
      ...p,
      annualUnits: p.unitsDay * days,
      rev:    p.price * p.unitsDay * days,
      cogs:   p.cost  * p.unitsDay * days,
      gp:     (p.price - p.cost) * p.unitsDay * days,
      gpPct:  p.price > 0 ? (p.price - p.cost) / p.price : 0,
      gpUnit: p.price - p.cost,
    }))

    const annualOpex  = sum(opex.map(e => e.monthly * 12))
    const totalUnits  = sum(products.map(p => p.unitsDay))

    const catTotals = {}
    CATS.forEach(cat => {
      const cp = prods.filter(p => p.cat === cat)
      const catRev  = sum(cp.map(p => p.rev))
      const catCogs = sum(cp.map(p => p.cogs))
      const catGP   = sum(cp.map(p => p.gp))
      const catUnits = sum(cp.map(p => p.unitsDay))
      catTotals[cat] = {
        rev: catRev, cogs: catCogs, gp: catGP, units: catUnits,
        gpPct: catRev > 0 ? catGP / catRev : 0,
      }
    })

    const totRev    = sum(prods.map(p => p.rev))
    const totCogs   = sum(prods.map(p => p.cogs))
    const totGP     = sum(prods.map(p => p.gp))
    const gpRate    = totRev > 0 ? totGP / totRev : 0
    const ebitda    = totGP - annualOpex
    const netIncome = ebitda * (1 - tax)
    const netMargin = totRev > 0 ? netIncome / totRev : 0

    // Break-even: (R * gpRate - OPEX) * (1-tax) = 0  →  R = OPEX / gpRate
    const beRevenue   = gpRate > 0 ? annualOpex / gpRate : null
    const beGap       = beRevenue != null ? beRevenue - totRev : null
    const beUnitsDay  = (beRevenue != null && totRev > 0 && totalUnits > 0)
      ? Math.ceil(beRevenue / totRev * totalUnits)
      : null

    // Target revenue: (R*gpRate - OPEX)*(1-tax) = R*tgt
    // R*(gpRate*(1-tax) - tgt) = OPEX*(1-tax)
    const tgtDenom    = gpRate * (1 - tax) - tgt
    const tgtRevenue  = tgtDenom > 0 ? annualOpex * (1 - tax) / tgtDenom : null
    const tgtGap      = tgtRevenue != null ? tgtRevenue - totRev : null
    const tgtUnitsDay = (tgtGap != null && totRev > 0 && totalUnits > 0)
      ? Math.ceil(tgtGap / (totRev / totalUnits))
      : null

    // Required blended GP% at current revenue to hit target
    const reqGPrate = tgt > 0 && totRev > 0
      ? (tgt / (1 - tax) + annualOpex / totRev)
      : null

    // Category GP% sorted best → worst
    const catRanked = [...CATS].sort((a,b) => (catTotals[b]?.gpPct||0) - (catTotals[a]?.gpPct||0))
    const bestCat   = catRanked[0]
    const worstCat  = catRanked[catRanked.length-1]
    const bestGP    = catTotals[bestCat]?.gpPct || 0
    const worstGP   = catTotals[worstCat]?.gpPct || 0
    const mixShiftGain = (bestGP - worstGP) * 0.10  // gain in blended GP% from shifting 10% of sales

    // If current worst-cat units/day shifted to best-cat: units to shift for 1pp GP improvement
    const ppNeededFromMix = reqGPrate != null ? Math.max(0, reqGPrate - gpRate) : 0
    const unitsToShift    = mixShiftGain > 0 ? Math.ceil(ppNeededFromMix / mixShiftGain * totalUnits * 0.10) : null

    // Top products to push (by GP per unit — absolute $ contribution)
    const rankedByGPUnit = [...prods].sort((a,b) => b.gpUnit - a.gpUnit)

    // Scenario mix
    const mixPctTotal = sum(CATS.map(c => mixPct[c]))
    const avgPrice = {}, avgCost = {}
    CATS.forEach(cat => {
      const cp = products.filter(p => p.cat === cat)
      avgPrice[cat] = cp.length ? sum(cp.map(p=>p.price))/cp.length : 0
      avgCost[cat]  = cp.length ? sum(cp.map(p=>p.cost))/cp.length  : 0
    })
    const scenarioRows = CATS.map(cat => {
      const units = Math.round(mixTotal * (mixPct[cat]||0))
      const annU  = units * days
      const rev   = avgPrice[cat] * annU
      const cogs  = avgCost[cat]  * annU
      const gp    = rev - cogs
      return { cat, units, annU, rev, cogs, gp, gpPct: rev > 0 ? gp/rev : 0 }
    })
    const scRev    = sum(scenarioRows.map(r=>r.rev))
    const scGP     = sum(scenarioRows.map(r=>r.gp))
    const scEBITDA = scGP - annualOpex
    const scNet    = scEBITDA * (1 - tax)
    const scMargin = scRev > 0 ? scNet / scRev : 0

    return {
      prods, catTotals, totRev, totCogs, totGP, gpRate,
      annualOpex, ebitda, netIncome, netMargin, totalUnits,
      beRevenue, beGap, beUnitsDay,
      tgtRevenue, tgtGap, tgtUnitsDay, reqGPrate,
      catRanked, bestCat, worstCat, mixShiftGain, ppNeededFromMix, unitsToShift,
      rankedByGPUnit,
      scenarioRows, scRev, scGP, scEBITDA, scNet, scMargin, mixPctTotal,
    }
  }, [products, opex, settings, mixTotal, mixPct])

  const tabBtn = id => ({
    padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
    fontSize: 12, fontWeight: view === id ? 700 : 500, fontFamily: 'inherit',
    background: view === id ? 'var(--dark)' : '#fff',
    color:      view === id ? '#fff'        : 'var(--text-muted)',
    border:     view === id ? 'none'        : '1px solid var(--border)',
    whiteSpace: 'nowrap',
  })
  const inp = { padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13, fontFamily:'inherit', background:'#fff', width:72, textAlign:'right' }
  const th  = { padding:'9px 12px', fontSize:11, fontWeight:700, color:'#8B7355', textTransform:'uppercase', letterSpacing:'0.04em', background:'#FAFAF8', whiteSpace:'nowrap' }
  const td  = { padding:'9px 12px', fontSize:13, borderTop:'1px solid var(--border)' }

  const kpi = (label, val, color, sub) => (
    <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
      <div style={{ fontSize:20, fontWeight:700, color, lineHeight:1 }}>{val}</div>
      <div style={{ fontSize:11, fontWeight:600, color:'var(--dark)', marginTop:5 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:'#8B7355', marginTop:2 }}>{sub}</div>}
    </div>
  )

  const mc = m => m >= 0.25 ? '#276749' : m >= 0.15 ? '#C8843A' : m >= 0 ? '#C53030' : '#8B7355'

  const { prods, catTotals, totRev, totCogs, totGP, gpRate,
          annualOpex, ebitda, netIncome, netMargin, totalUnits,
          beRevenue, beGap, beUnitsDay,
          tgtRevenue, tgtGap, tgtUnitsDay, reqGPrate,
          catRanked, bestCat, worstCat, mixShiftGain, ppNeededFromMix, unitsToShift,
          rankedByGPUnit,
          scenarioRows, scRev, scGP, scEBITDA, scNet, scMargin, mixPctTotal } = calc

  const onTarget = netMargin >= settings.targetMargin

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display:'flex', gap:6, marginBottom:18, flexWrap:'wrap' }}>
        {[['pl','📊 P&L'],['mix','🔀 Sales Mix'],['scenario','🎯 Scenarios'],['intel','💡 Intelligence'],['inputs','⚙️ Inputs']].map(([id,label]) => (
          <button key={id} style={tabBtn(id)} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {/* ── P&L ───────────────────────────────────────────────────────────── */}
      {view === 'pl' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
            {kpi('Annual Revenue',  fmt(totRev),           '#276749',  `${totalUnits} units/day`)}
            {kpi('Total OPEX',      fmt(annualOpex),        '#C53030',  'annual operating expenses')}
            {kpi('Net Income',      fmt(netIncome),         mc(netMargin), ebitda > 0 ? 'after tax' : 'loss')}
            {kpi('Net Margin',      pct(netMargin),         mc(netMargin), settings.targetMargin ? `target ${pct(settings.targetMargin)}` : '')}
          </div>

          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign:'left' }}>Line Item</th>
                  <th style={{ ...th, textAlign:'right' }}>Annual</th>
                  <th style={{ ...th, textAlign:'right' }}>% of Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background:'#F0FFF4' }}>
                  <td style={{ ...td, fontWeight:700, color:'#276749', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em' }} colSpan={3}>Revenue</td>
                </tr>
                {CATS.map(cat => (
                  <tr key={cat}>
                    <td style={{ ...td, paddingLeft:24, color:'#555' }}>{cat}</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmt(catTotals[cat]?.rev)}</td>
                    <td style={{ ...td, textAlign:'right', color:'#8B7355' }}>
                      {totRev > 0 ? pct((catTotals[cat]?.rev||0)/totRev) : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ background:'#E8F5E9' }}>
                  <td style={{ ...td, fontWeight:700, color:'#276749' }}>Total Revenue</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{fmt(totRev)}</td>
                  <td style={{ ...td, textAlign:'right', color:'#8B7355' }}>100%</td>
                </tr>

                <tr style={{ background:'#FFF5F5' }}>
                  <td style={{ ...td, fontWeight:700, color:'#C53030', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em' }} colSpan={3}>Cost of Goods Sold</td>
                </tr>
                {CATS.map(cat => (
                  <tr key={cat}>
                    <td style={{ ...td, paddingLeft:24, color:'#555' }}>{cat} COGS</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmt(catTotals[cat]?.cogs)}</td>
                    <td style={{ ...td, textAlign:'right', color:'#8B7355' }}>
                      {totRev > 0 ? pct((catTotals[cat]?.cogs||0)/totRev) : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ background:'#FFF0F0' }}>
                  <td style={{ ...td, fontWeight:700, color:'#C53030' }}>Total COGS</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#C53030' }}>{fmt(totCogs)}</td>
                  <td style={{ ...td, textAlign:'right', color:'#C53030', fontWeight:600 }}>
                    {totRev > 0 ? pct(totCogs/totRev) : '—'}
                  </td>
                </tr>

                <tr style={{ background:'#E8F5E9' }}>
                  <td style={{ ...td, fontWeight:700, color:'#276749' }}>Gross Profit</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{fmt(totGP)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{pct(gpRate)}</td>
                </tr>

                <tr style={{ background:'#FFF8F0' }}>
                  <td style={{ ...td, fontWeight:700, color:'#C8843A', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em' }} colSpan={3}>Operating Expenses</td>
                </tr>
                {opex.map(e => (
                  <tr key={e.name}>
                    <td style={{ ...td, paddingLeft:24, color:'#555' }}>{e.name}</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmt(e.monthly*12)}</td>
                    <td style={{ ...td, textAlign:'right', color:'#8B7355' }}>
                      {totRev > 0 ? pct(e.monthly*12/totRev) : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ background:'#FFF0DC' }}>
                  <td style={{ ...td, fontWeight:700, color:'#C8843A' }}>Total OPEX</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#C8843A' }}>{fmt(annualOpex)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#C8843A' }}>
                    {totRev > 0 ? pct(annualOpex/totRev) : '—'}
                  </td>
                </tr>

                <tr style={{ background: ebitda > 0 ? '#E8F5E9' : '#FFF5F5' }}>
                  <td style={{ ...td, fontWeight:700, color: ebitda > 0 ? '#276749' : '#C53030' }}>EBITDA</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color: ebitda > 0 ? '#276749' : '#C53030' }}>{fmt(ebitda)}</td>
                  <td style={{ ...td, textAlign:'right', color:'#8B7355' }}>{totRev > 0 ? pct(ebitda/totRev) : '—'}</td>
                </tr>

                <tr style={{ background: netIncome > 0 ? '#C6F6D5' : '#FED7D7' }}>
                  <td style={{ ...td, fontWeight:700, fontSize:14, color: mc(netMargin) }}>
                    Net Income <span style={{ fontSize:11, fontWeight:400 }}>({pct(settings.taxRate)} tax)</span>
                  </td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, fontSize:14, color: mc(netMargin) }}>{fmt(netIncome)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, fontSize:14, color: mc(netMargin) }}>{pct(netMargin)}</td>
                </tr>

                {settings.targetMargin > 0 && (
                  <tr style={{ background:'#FFFBF0' }}>
                    <td style={{ ...td, color:'#8B7355' }} colSpan={2}>
                      vs Target ({pct(settings.targetMargin)})
                    </td>
                    <td style={{ ...td, textAlign:'right', fontWeight:700, color: onTarget ? '#276749' : '#C53030' }}>
                      {onTarget
                        ? `✓ +${((netMargin - settings.targetMargin)*100).toFixed(1)}pp above`
                        : `${((settings.targetMargin - netMargin)*100).toFixed(1)}pp below`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize:11, color:'#aaa', marginTop:8 }}>
            Annual figures based on {settings.daysPerYear} operating days. Edit in ⚙️ Inputs.
          </div>
        </div>
      )}

      {/* ── Sales Mix ─────────────────────────────────────────────────────── */}
      {view === 'mix' && (
        <div>
          <div style={{ fontSize:12, color:'#8B7355', marginBottom:12 }}>
            Set daily units per item. Revenue and profit recalculate automatically.
          </div>
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign:'left' }}>Item</th>
                  <th style={{ ...th, textAlign:'center' }}>Units/Day</th>
                  <th style={{ ...th, textAlign:'right' }}>Annual Rev</th>
                  <th style={{ ...th, textAlign:'right' }}>Gross Profit</th>
                  <th style={{ ...th, textAlign:'right' }}>GP %</th>
                </tr>
              </thead>
              <tbody>
                {CATS.map(cat => (
                  <>
                    <tr key={`cat-${cat}`} style={{ background: cat_color[cat] }}>
                      <td colSpan={5} style={{ ...td, fontWeight:700, fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'0.05em', padding:'7px 12px' }}>{cat}</td>
                    </tr>
                    {prods.filter(p => p.cat === cat).map(p => (
                      <tr key={p.id}>
                        <td style={{ ...td, paddingLeft:20 }}>{p.name}</td>
                        <td style={{ ...td, textAlign:'center' }}>
                          <input type="number" min={0} value={p.unitsDay} style={inp}
                            onChange={e => updateProduct(p.id,'unitsDay',e.target.value)} />
                        </td>
                        <td style={{ ...td, textAlign:'right' }}>{fmt(p.rev)}</td>
                        <td style={{ ...td, textAlign:'right', color:'#276749', fontWeight:600 }}>{fmt(p.gp)}</td>
                        <td style={{ ...td, textAlign:'right', fontWeight:600,
                          color: p.gpPct>=0.75?'#276749':p.gpPct>=0.65?'#C8843A':'#C53030' }}>
                          {pct(p.gpPct)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: cat_color[cat] }}>
                      <td style={{ ...td, paddingLeft:20, fontWeight:700, fontSize:12 }}>{cat} Total</td>
                      <td style={{ ...td, textAlign:'center', fontWeight:700 }}>{catTotals[cat]?.units}/day</td>
                      <td style={{ ...td, textAlign:'right', fontWeight:700 }}>{fmt(catTotals[cat]?.rev)}</td>
                      <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{fmt(catTotals[cat]?.gp)}</td>
                      <td style={{ ...td, textAlign:'right', fontWeight:700 }}>
                        {pct(catTotals[cat]?.gpPct||0)}
                      </td>
                    </tr>
                  </>
                ))}
                <tr style={{ background:'#E8F5E9' }}>
                  <td style={{ ...td, fontWeight:700, color:'#276749' }}>TOTAL</td>
                  <td style={{ ...td, textAlign:'center', fontWeight:700, color:'#276749' }}>{totalUnits}/day</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{fmt(totRev)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{fmt(totGP)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{pct(gpRate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Scenarios ─────────────────────────────────────────────────────── */}
      {view === 'scenario' && (
        <div>
          <div style={{ fontSize:12, color:'#8B7355', marginBottom:14 }}>
            Set total daily units and category mix to see if you can hit your target margin.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:14 }}>
              <div style={{ fontSize:12, color:'#8B7355', fontWeight:600, marginBottom:8 }}>Total Daily Units</div>
              <input type="number" min={0} value={mixTotal} style={{ ...inp, width:'100%', fontSize:16, padding:'8px 12px' }}
                onChange={e => { const v=Number(e.target.value)||0; setMixTotal(v); save('pls4_mixTotal',v) }} />
            </div>
            <div style={{
              background: Math.abs(mixPctTotal-1)<0.001 ? '#F0FFF4' : '#FFF5F5',
              border:`1px solid ${Math.abs(mixPctTotal-1)<0.001 ? '#9AE6B4' : '#FC8181'}`,
              borderRadius:10, padding:14, display:'flex', flexDirection:'column', justifyContent:'center'
            }}>
              <div style={{ fontSize:13, fontWeight:700, color: Math.abs(mixPctTotal-1)<0.001 ? '#276749' : '#C53030' }}>
                {Math.abs(mixPctTotal-1)<0.001 ? '✅ Mix = 100%' : `⚠️ Mix = ${(mixPctTotal*100).toFixed(0)}% (needs 100%)`}
              </div>
            </div>
          </div>

          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:14, marginBottom:14 }}>
            {CATS.map(cat => (
              <div key={cat} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{cat}</span>
                  <span style={{ fontSize:13, color:'#8B7355' }}>{Math.round(mixTotal*(mixPct[cat]||0))} units/day</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <input type="range" min={0} max={1} step={0.05} value={mixPct[cat]||0}
                    onChange={e => updateMixPct(cat, e.target.value)}
                    style={{ flex:1 }} />
                  <input type="number" min={0} max={100} step={5} value={Math.round((mixPct[cat]||0)*100)}
                    onChange={e => updateMixPct(cat, (Number(e.target.value)||0)/100)}
                    style={{ ...inp, width:55 }} />
                  <span style={{ fontSize:13, color:'#8B7355', width:16 }}>%</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign:'left' }}>Category</th>
                  <th style={{ ...th, textAlign:'right' }}>Units/Day</th>
                  <th style={{ ...th, textAlign:'right' }}>Annual Rev</th>
                  <th style={{ ...th, textAlign:'right' }}>Gross Profit</th>
                  <th style={{ ...th, textAlign:'right' }}>GP %</th>
                </tr>
              </thead>
              <tbody>
                {scenarioRows.map(r => (
                  <tr key={r.cat}>
                    <td style={td}>{r.cat}</td>
                    <td style={{ ...td, textAlign:'right' }}>{r.units}</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmt(r.rev)}</td>
                    <td style={{ ...td, textAlign:'right', color:'#276749', fontWeight:600 }}>{fmt(r.gp)}</td>
                    <td style={{ ...td, textAlign:'right', fontWeight:600,
                      color: r.gpPct>=0.75?'#276749':r.gpPct>=0.65?'#C8843A':'#C53030' }}>
                      {pct(r.gpPct)}
                    </td>
                  </tr>
                ))}
                <tr style={{ background:'#E8F5E9', borderTop:'2px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight:700 }}>Total</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700 }}>{mixTotal}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700 }}>{fmt(scRev)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{fmt(scGP)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700 }}>{pct(scRev>0?scGP/scRev:0)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{
            background: scMargin >= settings.targetMargin ? '#F0FFF4' : '#FFF5F5',
            border:`1px solid ${scMargin >= settings.targetMargin ? '#9AE6B4' : '#FC8181'}`,
            borderRadius:12, padding:16
          }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:6,
              color: scMargin >= settings.targetMargin ? '#276749' : '#C53030' }}>
              {scMargin >= settings.targetMargin
                ? `✅ Hits target — ${pct(scMargin)} net margin`
                : `⚠️ Misses target — ${pct(scMargin)} vs ${pct(settings.targetMargin)} target`}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, fontSize:12, color:'#555' }}>
              <div>EBITDA: <strong>{fmt(scEBITDA)}</strong></div>
              <div>Net Income: <strong style={{ color: scNet>0?'#276749':'#C53030' }}>{fmt(scNet)}</strong></div>
              <div>Gap: <strong style={{ color: scMargin>=settings.targetMargin?'#276749':'#C53030' }}>
                {scMargin>=settings.targetMargin ? '+' : ''}{((scMargin-settings.targetMargin)*100).toFixed(1)}pp
              </strong></div>
            </div>
          </div>
        </div>
      )}

      {/* ── Intelligence ──────────────────────────────────────────────────── */}
      {view === 'intel' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* 1. Margin Health */}
          <div style={{
            background: onTarget ? '#F0FFF4' : '#FFF5F5',
            border:`1px solid ${onTarget ? '#9AE6B4' : '#FC8181'}`,
            borderRadius:12, padding:16
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color: mc(netMargin) }}>
                  {onTarget ? '✅ On Target' : '⚠️ Below Target'}
                </div>
                <div style={{ fontSize:13, color:'#555', marginTop:4 }}>
                  Net margin <strong>{pct(netMargin)}</strong> vs target <strong>{pct(settings.targetMargin)}</strong>
                  {' — '}{onTarget
                    ? `${((netMargin - settings.targetMargin)*100).toFixed(1)}pp above`
                    : `${((settings.targetMargin - netMargin)*100).toFixed(1)}pp to close`}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:22, fontWeight:700, color: mc(netMargin) }}>{pct(netMargin)}</div>
                <div style={{ fontSize:11, color:'#8B7355' }}>net margin</div>
              </div>
            </div>
          </div>

          {/* 2. Break-Even */}
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#8B7355', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Break-Even Analysis</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
              <div style={{ background:'#FAFAF8', borderRadius:8, padding:12 }}>
                <div style={{ fontSize:18, fontWeight:700, color: beGap != null && beGap <= 0 ? '#276749' : '#C8843A' }}>
                  {beRevenue != null ? fmt(beRevenue) : '—'}
                </div>
                <div style={{ fontSize:11, color:'#8B7355', marginTop:3 }}>Break-even revenue / year</div>
              </div>
              <div style={{ background:'#FAFAF8', borderRadius:8, padding:12 }}>
                <div style={{ fontSize:18, fontWeight:700, color: beGap != null && beGap <= 0 ? '#276749' : '#C8843A' }}>
                  {beUnitsDay != null ? `${beUnitsDay} units/day` : '—'}
                </div>
                <div style={{ fontSize:11, color:'#8B7355', marginTop:3 }}>
                  {beGap != null && beGap <= 0
                    ? `✓ Already above break-even by ${fmt(Math.abs(beGap))}`
                    : beGap != null ? `Need ${fmt(beGap)} more revenue` : ''}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Path to Target */}
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#8B7355', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>
              Path to {pct(settings.targetMargin)} Target Margin
            </div>
            {onTarget ? (
              <div style={{ fontSize:13, color:'#276749', fontWeight:600 }}>
                ✅ Already hitting target. Current net income: {fmt(netIncome)}/year.
              </div>
            ) : tgtRevenue != null ? (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  <div style={{ background:'#FFF8F0', borderRadius:8, padding:10 }}>
                    <div style={{ fontSize:16, fontWeight:700, color:'#C8843A' }}>{fmt(tgtRevenue)}</div>
                    <div style={{ fontSize:11, color:'#8B7355', marginTop:2 }}>revenue needed</div>
                  </div>
                  <div style={{ background:'#FFF8F0', borderRadius:8, padding:10 }}>
                    <div style={{ fontSize:16, fontWeight:700, color:'#C8843A' }}>{fmt(tgtGap)}</div>
                    <div style={{ fontSize:11, color:'#8B7355', marginTop:2 }}>additional revenue gap</div>
                  </div>
                  <div style={{ background:'#FFF8F0', borderRadius:8, padding:10 }}>
                    <div style={{ fontSize:16, fontWeight:700, color:'#C8843A' }}>
                      {tgtUnitsDay != null && tgtUnitsDay > 0 ? `+${tgtUnitsDay}` : '0'} units/day
                    </div>
                    <div style={{ fontSize:11, color:'#8B7355', marginTop:2 }}>extra sales needed</div>
                  </div>
                </div>
                {reqGPrate != null && (
                  <div style={{ fontSize:12, color:'#555', padding:'8px 12px', background:'#FFFBF0', borderRadius:8 }}>
                    At current volume, you need a blended gross margin of{' '}
                    <strong>{pct(reqGPrate)}</strong> (currently {pct(gpRate)}).
                    Gap: <strong style={{ color:'#C53030' }}>{((reqGPrate - gpRate)*100).toFixed(1)}pp</strong>.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize:13, color:'#C53030' }}>
                Target unreachable at current gross margin — OPEX is too high relative to revenue. Raise prices, cut costs, or reduce OPEX.
              </div>
            )}
          </div>

          {/* 4. Top Items to Push */}
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#8B7355', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>
              Top Items by Profit Contribution
            </div>
            <div style={{ fontSize:11, color:'#8B7355', marginBottom:10 }}>
              Each additional unit/day sold adds this much to annual profit:
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {rankedByGPUnit.slice(0, 6).map((p, i) => (
                <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'#FAFAF8', borderRadius:8 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#aaa', width:20, textAlign:'center' }}>#{i+1}</div>
                  <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:10,
                    background: cat_color[p.cat], color:'#555', flexShrink:0 }}>{p.cat}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{p.name}</div>
                    <div style={{ fontSize:11, color:'#8B7355' }}>
                      Sell {fmtD(p.price)} · Cost {fmtD(p.cost)} · GP {fmtD(p.gpUnit)}/unit
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:'#276749' }}>
                      +{fmt(p.gpUnit * settings.daysPerYear)}/yr
                    </div>
                    <div style={{ fontSize:10, color:'#8B7355' }}>per extra unit/day</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. Mix Recommendation */}
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#8B7355', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>
              Category Mix Strategy
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
              {CATS.map(cat => {
                const share = totRev > 0 ? (catTotals[cat]?.rev || 0) / totRev : 0
                const gpP   = catTotals[cat]?.gpPct || 0
                return (
                  <div key={cat} style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:12, fontWeight:600, width:90, color:'var(--dark)' }}>{cat}</span>
                    <div style={{ flex:1, background:'#EDE0CC', borderRadius:4, height:8, overflow:'hidden' }}>
                      <div style={{ height:'100%', background: gpP>=0.75?'#276749':gpP>=0.65?'#C8843A':'#C53030', width:`${share*100}%`, transition:'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize:12, color:'#555', width:36, textAlign:'right' }}>{pct(share)}</span>
                    <span style={{ fontSize:11, fontWeight:600, width:44, textAlign:'right',
                      color: gpP>=0.75?'#276749':gpP>=0.65?'#C8843A':'#C53030' }}>GP {pct(gpP)}</span>
                  </div>
                )
              })}
            </div>
            {bestCat !== worstCat && (
              <div style={{ fontSize:12, color:'#555', lineHeight:1.6, background:'#FFFBF0', padding:'10px 12px', borderRadius:8 }}>
                <strong>{bestCat}</strong> has the highest margin at {pct(catTotals[bestCat]?.gpPct||0)}.{' '}
                <strong>{worstCat}</strong> has the lowest at {pct(catTotals[worstCat]?.gpPct||0)}.
                {mixShiftGain > 0 && (
                  <> Shifting <strong>10%</strong> of sales from {worstCat} to {bestCat} improves blended GP% by{' '}
                  <strong style={{ color:'#276749' }}>{(mixShiftGain*100).toFixed(1)}pp</strong>.
                  {ppNeededFromMix > 0.001 && unitsToShift != null && (
                    <> To close the {(ppNeededFromMix*100).toFixed(1)}pp GP gap, shift roughly{' '}
                    <strong style={{ color:'#C8843A' }}>{unitsToShift} units/day</strong> from {worstCat} to {bestCat}.</>
                  )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* 6. Quick Wins */}
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#8B7355', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>
              Quick Wins
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {prods.filter(p => p.unitsDay === 0 && p.gpUnit > 3).slice(0,3).map(p => (
                <div key={p.id} style={{ display:'flex', gap:10, padding:'10px 12px', background:'#FFF8F0', border:'1px solid #FFD580', borderRadius:8 }}>
                  <span style={{ fontSize:16 }}>💡</span>
                  <div style={{ fontSize:12, color:'#555', lineHeight:1.5 }}>
                    <strong>{p.name}</strong> is not being sold (0 units/day) but has a {pct(p.gpPct)} margin.
                    Even 5 units/day adds <strong style={{ color:'#276749' }}>{fmt(p.gpUnit * 5 * settings.daysPerYear)}/year</strong> to profit.
                  </div>
                </div>
              ))}
              {annualOpex / totRev > 0.50 && totRev > 0 && (
                <div style={{ display:'flex', gap:10, padding:'10px 12px', background:'#FFF5F5', border:'1px solid #FC8181', borderRadius:8 }}>
                  <span style={{ fontSize:16 }}>⚠️</span>
                  <div style={{ fontSize:12, color:'#555', lineHeight:1.5 }}>
                    OPEX is <strong style={{ color:'#C53030' }}>{pct(annualOpex/totRev)}</strong> of revenue (benchmark: 40–50%).
                    Consider reducing staffing or fixed costs to improve margin.
                  </div>
                </div>
              )}
              {catTotals['Coffee']?.units > 0 && (catTotals['Coffee']?.rev || 0) / totRev < 0.15 && (
                <div style={{ display:'flex', gap:10, padding:'10px 12px', background:'#F5F0E8', border:'1px solid #D4A96A', borderRadius:8 }}>
                  <span style={{ fontSize:16 }}>☕</span>
                  <div style={{ fontSize:12, color:'#555', lineHeight:1.5 }}>
                    Coffee is only <strong>{pct((catTotals['Coffee']?.rev||0)/totRev)}</strong> of sales.
                    It has the best margin — upsell coffee with every ice cream order to boost profit.
                  </div>
                </div>
              )}
              {prods.filter(p => p.unitsDay === 0 && p.gpUnit > 3).length === 0 &&
               annualOpex / totRev <= 0.50 &&
               (catTotals['Coffee']?.rev||0) / totRev >= 0.15 && (
                <div style={{ fontSize:12, color:'#276749' }}>
                  ✅ No obvious quick wins — business looks well-optimized at current settings.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Inputs ────────────────────────────────────────────────────────── */}
      {view === 'inputs' && (
        <div>
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--dark)', marginBottom:12 }}>Business Settings</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              {[['daysPerYear','Days Open / Year'],['taxRate','Tax Rate'],['targetMargin','Target Net Margin']].map(([k,label]) => (
                <div key={k}>
                  <div style={{ fontSize:12, color:'#8B7355', marginBottom:4 }}>{label}</div>
                  <input type="number" step="any" value={settings[k]} style={{ ...inp, width:'100%' }}
                    onChange={e => updateSetting(k, e.target.value)} />
                  {(k==='taxRate'||k==='targetMargin') && <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>e.g. 0.15 = 15%</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, color:'var(--dark)' }}>
              Product Prices &amp; Costs
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign:'left' }}>Item</th>
                    <th style={{ ...th, textAlign:'center' }}>Sell Price</th>
                    <th style={{ ...th, textAlign:'center' }}>Cost/Unit</th>
                    <th style={{ ...th, textAlign:'center' }}>GP %</th>
                  </tr>
                </thead>
                <tbody>
                  {CATS.map(cat => (
                    <>
                      <tr key={`h-${cat}`} style={{ background: cat_color[cat] }}>
                        <td colSpan={4} style={{ ...td, fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em', color:'#555', padding:'6px 12px' }}>{cat}</td>
                      </tr>
                      {prods.filter(p => p.cat===cat).map(p => (
                        <tr key={p.id}>
                          <td style={{ ...td, paddingLeft:20 }}>{p.name}</td>
                          <td style={{ ...td, textAlign:'center' }}>
                            <input type="number" step="0.01" min={0} value={p.price} style={inp}
                              onChange={e => updateProduct(p.id,'price',e.target.value)} />
                          </td>
                          <td style={{ ...td, textAlign:'center' }}>
                            <input type="number" step="0.01" min={0} value={p.cost} style={inp}
                              onChange={e => updateProduct(p.id,'cost',e.target.value)} />
                          </td>
                          <td style={{ ...td, textAlign:'center', fontWeight:700,
                            color: p.gpPct>=0.75?'#276749':p.gpPct>=0.65?'#C8843A':'#C53030' }}>
                            {pct(p.gpPct)}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, color:'var(--dark)' }}>
              Operating Expenses (Monthly)
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign:'left' }}>Expense</th>
                  <th style={{ ...th, textAlign:'center' }}>Monthly $</th>
                  <th style={{ ...th, textAlign:'right' }}>Annual</th>
                  <th style={{ ...th }}>Benchmark</th>
                </tr>
              </thead>
              <tbody>
                {opex.map((e,i) => (
                  <tr key={e.name}>
                    <td style={td}>{e.name}</td>
                    <td style={{ ...td, textAlign:'center' }}>
                      <input type="number" min={0} value={e.monthly} style={inp}
                        onChange={ev => updateOpex(i, ev.target.value)} />
                    </td>
                    <td style={{ ...td, textAlign:'right', color:'#C8843A', fontWeight:600 }}>{fmt(e.monthly*12)}</td>
                    <td style={{ ...td, fontSize:11, color:'#8B7355' }}>{e.benchmark}</td>
                  </tr>
                ))}
                <tr style={{ background:'#FFF0DC' }}>
                  <td style={{ ...td, fontWeight:700, color:'#C8843A' }}>Total OPEX</td>
                  <td style={{ ...td, textAlign:'center', fontWeight:700 }}>{fmt(annualOpex/12)}/mo</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#C8843A' }}>{fmt(annualOpex)}</td>
                  <td style={td} />
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ fontSize:11, color:'#aaa', marginTop:8 }}>All inputs auto-save to this device.</div>
        </div>
      )}
    </div>
  )
}
