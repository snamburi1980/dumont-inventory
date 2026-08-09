import { useState, useMemo, Fragment } from 'react'

const INIT_PRODUCTS = [
  { id:1,  cat:'Ice Cream', name:'Kids Scoop',              price:4.95,  cost:1.20, unitsDay:40 },
  { id:2,  cat:'Ice Cream', name:'Medium Scoop',             price:7.25,  cost:1.40, unitsDay:40 },
  { id:3,  cat:'Ice Cream', name:'Large Scoop',              price:6.25,  cost:2.10, unitsDay:20 },
  { id:4,  cat:'Ice Cream', name:'Hand Packed',              price:13.95, cost:4.00, unitsDay:10 },
  { id:5,  cat:'Ice Cream', name:'Sampler',                  price:10.45, cost:3.00, unitsDay:10 },
  { id:6,  cat:'Drinks',    name:'Drinks (Tea/Slush)',        price:6.25,  cost:0.67, unitsDay:30 },
  { id:7,  cat:'Drinks',    name:'Falooda',                  price:9.99,  cost:4.00, unitsDay:0  },
  { id:8,  cat:'Drinks',    name:'Milk Shake',               price:9.99,  cost:4.00, unitsDay:0  },
  { id:9,  cat:'Coffee',    name:'Americano (Hot)',           price:3.75,  cost:0.94, unitsDay:0  },
  { id:10, cat:'Coffee',    name:'Americano (Cold)',          price:4.25,  cost:0.94, unitsDay:0  },
  { id:11, cat:'Coffee',    name:'Espresso',                 price:3.25,  cost:0.94, unitsDay:0  },
  { id:12, cat:'Coffee',    name:'Cappuccino / Latte (Hot)',  price:4.75,  cost:1.31, unitsDay:5  },
  { id:13, cat:'Coffee',    name:'Cappuccino / Latte (Cold)', price:5.45,  cost:1.31, unitsDay:5  },
  { id:14, cat:'Coffee',    name:'Mocha',                    price:5.45,  cost:1.59, unitsDay:5  },
  { id:15, cat:'Coffee',    name:'Specialty Coffee',          price:6.25,  cost:1.84, unitsDay:25 },
]

const INIT_OPEX = [
  { name:'Staffing & Wages',       monthly:8500  },
  { name:'Rent & Occupancy',       monthly:3500  },
  { name:'Utilities',              monthly:800   },
  { name:'Supplies & Packaging',   monthly:600   },
  { name:'Marketing & Promotions', monthly:500   },
  { name:'Equipment Maintenance',  monthly:300   },
  { name:'Insurance',              monthly:250   },
  { name:'POS / Software / Misc',  monthly:200   },
]

const CATS = ['Ice Cream', 'Drinks', 'Coffee']

function ld(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def } }
function sv(key, val) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

const fmt  = n => `$${Number(n||0).toLocaleString('en-US', { maximumFractionDigits:0 })}`
const fmtD = n => `$${Number(n||0).toFixed(2)}`
const pp   = n => `${(Number(n||0)*100).toFixed(1)}%`
const sum  = a => a.reduce((x,y) => x+y, 0)

export default function PLSimulator() {
  const [tab,      setTab]      = useState('inputs')
  const [products, setProducts] = useState(() => ld('pls5_products', INIT_PRODUCTS))
  const [opex,     setOpex]     = useState(() => ld('pls5_opex',     INIT_OPEX))
  const [settings, setSettings] = useState(() => ld('pls5_settings', { daysPerYear:360, taxRate:0.08, targetMargin:0.15 }))
  const [mixTotal, setMixTotal] = useState(() => ld('pls5_mixTotal', 185))
  const [mixPct,   setMixPct]   = useState(() => ld('pls5_mixPct',   { 'Ice Cream':0.65, Drinks:0.16, Coffee:0.19 }))

  function setP(id, field, val) {
    const u = products.map(p => p.id === id ? { ...p, [field]: Number(val)||0 } : p)
    setProducts(u); sv('pls5_products', u)
  }
  function setO(i, val) {
    const u = opex.map((e,j) => j===i ? { ...e, monthly: Number(val)||0 } : e)
    setOpex(u); sv('pls5_opex', u)
  }
  function setSt(k, v) {
    const u = { ...settings, [k]: Number(v)||0 }
    setSettings(u); sv('pls5_settings', u)
  }
  function setMix(cat, val) {
    const u = { ...mixPct, [cat]: Number(val)||0 }
    setMixPct(u); sv('pls5_mixPct', u)
  }

  const c = useMemo(() => {
    const days = settings.daysPerYear
    const tax  = settings.taxRate
    const tgt  = settings.targetMargin
    const annOpex = sum(opex.map(e => e.monthly * 12))

    // ── Actual P&L from product units/day ─────────────────────────────────
    const prods = products.map(p => ({
      ...p,
      rev:    p.price * p.unitsDay * days,
      cogs:   p.cost  * p.unitsDay * days,
      gp:     (p.price - p.cost) * p.unitsDay * days,
      gpPct:  p.price > 0 ? (p.price - p.cost) / p.price : 0,
      gpUnit: p.price - p.cost,
    }))
    const totRev   = sum(prods.map(p => p.rev))
    const totCogs  = sum(prods.map(p => p.cogs))
    const totGP    = sum(prods.map(p => p.gp))
    const gpRate   = totRev > 0 ? totGP / totRev : 0
    const ebitda   = totGP - annOpex
    const netInc   = ebitda * (1 - tax)
    const netMgn   = totRev > 0 ? netInc / totRev : 0
    const totUnits = sum(products.map(p => p.unitsDay))

    const catData = {}
    CATS.forEach(cat => {
      const cp = prods.filter(p => p.cat === cat)
      const r = sum(cp.map(p=>p.rev)), g = sum(cp.map(p=>p.gp)), co = sum(cp.map(p=>p.cogs))
      catData[cat] = { rev:r, cogs:co, gp:g, gpPct: r>0?g/r:0, units:sum(cp.map(p=>p.unitsDay)) }
    })

    // ── Scenario (mix planner) ─────────────────────────────────────────────
    // Weighted avg price/cost per category from actual product data
    const avgP = {}, avgC = {}
    CATS.forEach(cat => {
      const cp = products.filter(p => p.cat === cat)
      const u  = sum(cp.map(p=>p.unitsDay))
      avgP[cat] = u > 0
        ? sum(cp.map(p => p.price * p.unitsDay)) / u
        : (cp.length ? sum(cp.map(p=>p.price))/cp.length : 0)
      avgC[cat] = u > 0
        ? sum(cp.map(p => p.cost * p.unitsDay)) / u
        : (cp.length ? sum(cp.map(p=>p.cost))/cp.length : 0)
    })
    const mixOk    = Math.abs(sum(CATS.map(c => mixPct[c]||0)) - 1) < 0.001
    const scRows   = CATS.map(cat => {
      const units = Math.round(mixTotal * (mixPct[cat]||0))
      const rev   = avgP[cat] * units * days
      const cogs  = avgC[cat] * units * days
      const gp    = rev - cogs
      return { cat, units, rev, cogs, gp, gpPct: rev>0?gp/rev:0 }
    })
    const scRev    = sum(scRows.map(r=>r.rev))
    const scGP     = sum(scRows.map(r=>r.gp))
    const scGPrate = scRev > 0 ? scGP/scRev : 0
    const scEBITDA = scGP - annOpex
    const scNet    = scEBITDA * (1 - tax)
    const scMgn    = scRev > 0 ? scNet/scRev : 0

    // ── Target analysis — always based on ACTUAL P&L (same as P&L tab) ────
    const onTarget = netMgn >= tgt

    const tgtDenom     = gpRate * (1 - tax) - tgt
    const tgtRevNeeded = tgtDenom > 0 && totRev > 0 && !onTarget
      ? (annOpex * (1-tax)) / tgtDenom - totRev
      : null

    // Best category to push (highest GP%)
    const bestCat    = [...CATS].sort((a,b) => (catData[b]?.gpPct||0) - (catData[a]?.gpPct||0))[0]
    const bestGPunit = avgP[bestCat] - avgC[bestCat]
    const extraUnits = bestGPunit > 0 && tgtRevNeeded != null
      ? Math.ceil(tgtRevNeeded / (bestGPunit * days))
      : null

    // Revenue per extra unit/day by category
    const catGPperUnit = {}
    CATS.forEach(cat => { catGPperUnit[cat] = (avgP[cat] - avgC[cat]) * days })

    // Ranked by GP per unit (for "what to push" tab)
    const ranked = [...prods].sort((a,b) => b.gpUnit - a.gpUnit)

    return {
      prods, catData, totRev, totCogs, totGP, gpRate,
      ebitda, netInc, netMgn, annOpex, totUnits,
      scRows, scRev, scGP, scGPrate, scEBITDA, scNet, scMgn, onTarget, mixOk,
      tgtRevNeeded, bestCat, extraUnits, catGPperUnit, ranked,
      avgP, avgC,
    }
  }, [products, opex, settings, mixTotal, mixPct])

  const {
    prods, catData, totRev, totCogs, totGP, gpRate,
    ebitda, netInc, netMgn, annOpex, totUnits,
    scRows, scRev, scGP, scGPrate, scEBITDA, scNet, scMgn, onTarget, mixOk,
    tgtRevNeeded, bestCat, extraUnits, catGPperUnit, ranked,
  } = c

  const mc = m => m >= 0.20 ? '#276749' : m >= 0.15 ? '#C1683C' : '#C53030'

  const tabBtn = id => ({
    padding:'9px 16px', borderRadius:20, cursor:'pointer', whiteSpace:'nowrap',
    fontSize:13, fontWeight: tab===id ? 700 : 500, fontFamily:'inherit',
    background: tab===id ? '#1A4C48' : '#fff',
    color:      tab===id ? '#fff'    : '#6B7F78',
    border:     tab===id ? 'none'    : '1px solid #E3DDD0',
  })
  const th = { padding:'10px 14px', fontSize:11, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.04em', background:'#FAFAF8', whiteSpace:'nowrap' }
  const td = { padding:'10px 14px', fontSize:13, borderTop:'1px solid #E3DDD0' }
  const inp = { padding:'6px 8px', border:'1px solid #E3DDD0', borderRadius:6, fontSize:13, fontFamily:'inherit', background:'#fff', textAlign:'right' }

  return (
    <div style={{ maxWidth:860 }}>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
        <button style={tabBtn('inputs')} onClick={()=>setTab('inputs')}>① Inputs</button>
        <button style={tabBtn('pl')}     onClick={()=>setTab('pl')}>② P&amp;L</button>
        <button style={tabBtn('target')} onClick={()=>setTab('target')}>③ Am I on Target?</button>
        <button style={tabBtn('push')}   onClick={()=>setTab('push')}>④ What to Sell</button>
      </div>

      {/* ── 🎯 Am I on Target? ──────────────────────────────────────────────── */}
      {tab === 'target' && (
        <div>

          {/* Big status — uses actual P&L values, same as P&L tab */}
          <div style={{
            background: onTarget ? '#F0FFF4' : '#FFF5F5',
            border:`2px solid ${onTarget ? '#9AE6B4' : '#FC8181'}`,
            borderRadius:16, padding:'20px 24px', marginBottom:20,
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
              <div>
                <div style={{ fontSize:28, fontWeight:800, color: mc(netMgn), lineHeight:1 }}>
                  {onTarget ? '✅ YES — You\'re on target' : '⚠️ NOT YET — Below target'}
                </div>
                <div style={{ fontSize:14, color:'#555', marginTop:8, lineHeight:1.6 }}>
                  Net margin: <strong style={{ color: mc(netMgn) }}>{pp(netMgn)}</strong>
                  {' '}vs target <strong>{pp(settings.targetMargin)}</strong>
                  {' — '}
                  {onTarget
                    ? <span style={{ color:'#276749' }}>+{((netMgn-settings.targetMargin)*100).toFixed(1)}pp above target</span>
                    : <span style={{ color:'#C53030' }}>{((settings.targetMargin-netMgn)*100).toFixed(1)}pp to close</span>
                  }
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:36, fontWeight:800, color: mc(netMgn), lineHeight:1 }}>{pp(netMgn)}</div>
                <div style={{ fontSize:12, color:'#6B7F78', marginTop:4 }}>net margin</div>
              </div>
            </div>

            {/* KPI row — same numbers as P&L tab */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10, marginTop:16 }}>
              {[
                ['Annual Revenue',  fmt(totRev),  '#276749'],
                ['EBITDA',          fmt(ebitda),   ebitda>0?'#276749':'#C53030'],
                ['Net Income/Year', fmt(netInc),   netInc>0?'#276749':'#C53030'],
              ].map(([label,val,col])=>(
                <div key={label} style={{ background:'rgba(255,255,255,0.7)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:700, color:col }}>{val}</div>
                  <div style={{ fontSize:11, color:'#6B7F78', marginTop:3 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* What to do (only if not on target) */}
          {!onTarget && (
            <div style={{ background:'#FFFBF0', border:'1px solid #F5D78A', borderRadius:12, padding:16, marginBottom:20 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:10 }}>
                To hit {pp(settings.targetMargin)} target, do one of these:
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {extraUnits != null && extraUnits > 0 && (
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <span style={{ fontSize:18, flexShrink:0 }}>1️⃣</span>
                    <div style={{ fontSize:13, color:'#555', lineHeight:1.5 }}>
                      Sell <strong style={{ color:'#1A4C48' }}>{extraUnits} more {bestCat} units/day</strong>
                      {' '}({bestCat} has your best margin at {pp(catData[bestCat]?.gpPct||0)})
                      {' → '}<strong style={{ color:'#276749' }}>adds {fmt(extraUnits * (c.avgP[bestCat]-c.avgC[bestCat]) * settings.daysPerYear)}/year to profit</strong>
                    </div>
                  </div>
                )}
                {tgtRevNeeded != null && (
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <span style={{ fontSize:18, flexShrink:0 }}>2️⃣</span>
                    <div style={{ fontSize:13, color:'#555', lineHeight:1.5 }}>
                      Grow total revenue by <strong style={{ color:'#1A4C48' }}>{fmt(tgtRevNeeded)}/year</strong>
                      {' '}({fmt(tgtRevNeeded/settings.daysPerYear)}/day) while keeping the same mix
                    </div>
                  </div>
                )}
                <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                  <span style={{ fontSize:18, flexShrink:0 }}>3️⃣</span>
                  <div style={{ fontSize:13, color:'#555', lineHeight:1.5 }}>
                    Reduce annual OPEX by <strong style={{ color:'#1A4C48' }}>
                      {fmt(Math.max(0, annOpex - (totGP - settings.targetMargin * totRev / (1-settings.taxRate))))}
                    </strong>
                    {' '}(OPEX is currently {pp(totRev>0?annOpex/totRev:0)} of revenue)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mix sliders — what-if simulator */}
          <div style={{ fontSize:11, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:8 }}>
            Simulate a Different Mix — What If?
          </div>
          <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
              <div style={{ fontSize:13, color:'#555' }}>Drag sliders to model a different sales mix and see what happens</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:12, color:'#6B7F78' }}>Total units/day:</span>
                <input type="number" min={0} value={mixTotal} style={{ ...inp, width:70, fontSize:14 }}
                  onChange={e => { const v=Number(e.target.value)||0; setMixTotal(v); sv('pls5_mixTotal',v) }} />
              </div>
            </div>

            {CATS.map(cat => {
              const units = Math.round(mixTotal * (mixPct[cat]||0))
              const gpPct = catData[cat]?.gpPct || 0
              return (
                <div key={cat} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'#1A4C48' }}>{cat}</span>
                    <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                      <span style={{ fontSize:12, color:'#6B7F78' }}>{units} units/day</span>
                      <span style={{ fontSize:12, fontWeight:700,
                        color: gpPct>=0.75?'#276749':gpPct>=0.65?'#C1683C':'#C53030' }}>
                        GP {pp(gpPct)}
                      </span>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <input className="pl-slider" type="range" min={0} max={1} step={0.01} value={mixPct[cat]||0}
                      onChange={e => setMix(cat, e.target.value)}
                      style={{ flex:1 }} />
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <input type="number" min={0} max={100} step={1}
                        value={Math.round((mixPct[cat]||0)*100)}
                        onChange={e => setMix(cat, (Number(e.target.value)||0)/100)}
                        style={{ ...inp, width:52 }} />
                      <span style={{ fontSize:13, color:'#6B7F78' }}>%</span>
                    </div>
                  </div>
                </div>
              )
            })}

            {!mixOk && (
              <div style={{ fontSize:12, color:'#C53030', fontWeight:600, padding:'6px 10px', background:'#FFF5F5', borderRadius:6 }}>
                ⚠️ Mix adds to {(sum(CATS.map(c=>mixPct[c]||0))*100).toFixed(0)}% — adjust so it equals 100%
              </div>
            )}
          </div>

          {/* Scenario results table */}
          <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign:'left' }}>Category</th>
                  <th style={{ ...th, textAlign:'right' }}>Units/Day</th>
                  <th style={{ ...th, textAlign:'right' }}>Annual Revenue</th>
                  <th style={{ ...th, textAlign:'right' }}>Gross Profit</th>
                  <th style={{ ...th, textAlign:'right' }}>GP %</th>
                </tr>
              </thead>
              <tbody>
                {scRows.map(r => (
                  <tr key={r.cat}>
                    <td style={td}>{r.cat}</td>
                    <td style={{ ...td, textAlign:'right' }}>{r.units}</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmt(r.rev)}</td>
                    <td style={{ ...td, textAlign:'right', color:'#276749', fontWeight:600 }}>{fmt(r.gp)}</td>
                    <td style={{ ...td, textAlign:'right', fontWeight:700,
                      color:r.gpPct>=0.75?'#276749':r.gpPct>=0.65?'#C1683C':'#C53030' }}>
                      {pp(r.gpPct)}
                    </td>
                  </tr>
                ))}
                <tr style={{ background:'#F5F0E8', borderTop:'2px solid #E3DDD0' }}>
                  <td style={{ ...td, fontWeight:700, color:'#1A4C48' }}>Total</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700 }}>{mixTotal}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{fmt(scRev)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{fmt(scGP)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color: mc(scGPrate) }}>{pp(scGPrate)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ background: scMgn>=settings.targetMargin?'#F0FFF4':'#FFF5F5', border:`1px solid ${scMgn>=settings.targetMargin?'#9AE6B4':'#FC8181'}`, borderRadius:10, padding:'12px 16px' }}>
            <div style={{ fontSize:13, fontWeight:700, color: mc(scMgn), marginBottom:4 }}>
              {scMgn>=settings.targetMargin ? `✅ This mix hits target — ${pp(scMgn)} net margin` : `⚠️ This mix misses — ${pp(scMgn)} vs ${pp(settings.targetMargin)} target`}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, fontSize:12, color:'#555' }}>
              <div>Revenue: <strong>{fmt(scRev)}</strong></div>
              <div>EBITDA: <strong style={{ color: scEBITDA>0?'#276749':'#C53030' }}>{fmt(scEBITDA)}</strong></div>
              <div>Net Income: <strong style={{ color: scNet>0?'#276749':'#C53030' }}>{fmt(scNet)}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* ── 📊 Full P&L ─────────────────────────────────────────────────────── */}
      {tab === 'pl' && (
        <div>
          <div style={{ fontSize:12, color:'#6B7F78', marginBottom:14 }}>
            Based on units/day set in ⚙️ Inputs. Adjust the mix in 🎯 Am I on Target? to model scenarios.
          </div>
          <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign:'left' }}>Line Item</th>
                  <th style={{ ...th, textAlign:'right' }}>Annual ($)</th>
                  <th style={{ ...th, textAlign:'right' }}>% Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background:'#F0FFF4' }}>
                  <td style={{ ...td, fontWeight:700, color:'#276749', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em' }} colSpan={3}>Revenue</td>
                </tr>
                {CATS.map(cat => (
                  <tr key={cat}>
                    <td style={{ ...td, paddingLeft:24, color:'#555' }}>{cat}</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmt(catData[cat]?.rev)}</td>
                    <td style={{ ...td, textAlign:'right', color:'#6B7F78' }}>{totRev>0?pp((catData[cat]?.rev||0)/totRev):'—'}</td>
                  </tr>
                ))}
                <tr style={{ background:'#E8F5E9' }}>
                  <td style={{ ...td, fontWeight:700, color:'#276749' }}>Total Revenue</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{fmt(totRev)}</td>
                  <td style={{ ...td, textAlign:'right', color:'#6B7F78' }}>100%</td>
                </tr>
                <tr style={{ background:'#FFF5F5' }}>
                  <td style={{ ...td, fontWeight:700, color:'#C53030', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em' }} colSpan={3}>Cost of Goods Sold</td>
                </tr>
                {CATS.map(cat => (
                  <tr key={cat}>
                    <td style={{ ...td, paddingLeft:24, color:'#555' }}>{cat} COGS</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmt(catData[cat]?.cogs)}</td>
                    <td style={{ ...td, textAlign:'right', color:'#6B7F78' }}>{totRev>0?pp((catData[cat]?.cogs||0)/totRev):'—'}</td>
                  </tr>
                ))}
                <tr style={{ background:'#FFF0F0' }}>
                  <td style={{ ...td, fontWeight:700, color:'#C53030' }}>Total COGS</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#C53030' }}>{fmt(totCogs)}</td>
                  <td style={{ ...td, textAlign:'right', color:'#C53030', fontWeight:600 }}>{totRev>0?pp(totCogs/totRev):'—'}</td>
                </tr>
                <tr style={{ background:'#E8F5E9' }}>
                  <td style={{ ...td, fontWeight:700, color:'#276749' }}>Gross Profit</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{fmt(totGP)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#276749' }}>{pp(gpRate)}</td>
                </tr>
                <tr style={{ background:'#FFF8F0' }}>
                  <td style={{ ...td, fontWeight:700, color:'#C1683C', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em' }} colSpan={3}>Operating Expenses</td>
                </tr>
                {opex.map(e => (
                  <tr key={e.name}>
                    <td style={{ ...td, paddingLeft:24, color:'#555' }}>{e.name}</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmt(e.monthly*12)}</td>
                    <td style={{ ...td, textAlign:'right', color:'#6B7F78' }}>{totRev>0?pp(e.monthly*12/totRev):'—'}</td>
                  </tr>
                ))}
                <tr style={{ background:'#FFF0DC' }}>
                  <td style={{ ...td, fontWeight:700, color:'#C1683C' }}>Total OPEX</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#C1683C' }}>{fmt(annOpex)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#C1683C' }}>{totRev>0?pp(annOpex/totRev):'—'}</td>
                </tr>
                <tr style={{ background: ebitda>0?'#E8F5E9':'#FFF5F5' }}>
                  <td style={{ ...td, fontWeight:700, color: ebitda>0?'#276749':'#C53030' }}>EBITDA</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color: ebitda>0?'#276749':'#C53030' }}>{fmt(ebitda)}</td>
                  <td style={{ ...td, textAlign:'right', color:'#6B7F78' }}>{totRev>0?pp(ebitda/totRev):'—'}</td>
                </tr>
                <tr style={{ background: netInc>0?'#C6F6D5':'#FED7D7' }}>
                  <td style={{ ...td, fontWeight:700, fontSize:14, color: mc(netMgn) }}>
                    Net Income <span style={{ fontSize:11, fontWeight:400 }}>({pp(settings.taxRate)} tax)</span>
                  </td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, fontSize:14, color: mc(netMgn) }}>{fmt(netInc)}</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, fontSize:14, color: mc(netMgn) }}>{pp(netMgn)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12 }}>
            <div style={{ fontSize:11, color:'#aaa' }}>Based on {settings.daysPerYear} days/year · units set in ① Inputs.</div>
            <button onClick={()=>setTab('target')} style={{
              background:'#1A4C48', color:'#fff', border:'none', borderRadius:8,
              padding:'10px 20px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit',
            }}>
              Am I on Target? →
            </button>
          </div>
        </div>
      )}

      {/* ── 📣 What to Sell ─────────────────────────────────────────────────── */}
      {tab === 'push' && (
        <div>
          <div style={{ fontSize:12, color:'#6B7F78', marginBottom:14 }}>
            Products ranked by <strong>profit per unit</strong> — push the top ones hardest.
            The number shows how much each extra unit/day adds to annual profit.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
            {ranked.map((p, i) => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12,
                padding:'12px 14px', background:'#fff', border:'1px solid #E3DDD0', borderRadius:10 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#aaa', width:22, textAlign:'center' }}>#{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#1A4C48' }}>{p.name}</div>
                  <div style={{ fontSize:11, color:'#6B7F78', marginTop:2 }}>
                    Sell {fmtD(p.price)} · Cost {fmtD(p.cost)} · Profit/unit {fmtD(p.gpUnit)}
                    {p.unitsDay === 0 && <span style={{ color:'#C53030', marginLeft:8, fontWeight:600 }}>⚠ not being sold</span>}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'#276749' }}>
                    +{fmt(p.gpUnit * settings.daysPerYear)}/yr
                  </div>
                  <div style={{ fontSize:10, color:'#6B7F78' }}>per extra unit/day</div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0, minWidth:48 }}>
                  <div style={{ fontSize:16, fontWeight:700,
                    color:p.gpPct>=0.75?'#276749':p.gpPct>=0.65?'#C1683C':'#C53030' }}>
                    {pp(p.gpPct)}
                  </div>
                  <div style={{ fontSize:10, color:'#6B7F78' }}>margin</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize:12, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Strategic Tips</div>
          {[
            ['☕', 'Push Coffee', 'Highest margin category. Upsell a coffee with every ice cream order — each extra sale is nearly pure profit.'],
            ['🍹', 'Falooda & Milk Shake', 'High sell price with solid margin. These elevate your average transaction value — promote them at the counter.'],
            ['🍦', 'Ice Cream volume is critical', 'Good margins but you need HIGH volume to cover OPEX. Don\'t let daily units fall below 100.'],
            ['🧋', 'Drinks are your floor', 'Consistent 89% gross margin. Add a drink to every combo deal.'],
            ['📦', 'Hand Packed & Sampler', 'Premium items with strong margins. Great for gifting — push during weekends and events.'],
          ].map(([icon, tip, body]) => (
            <div key={tip} style={{ display:'flex', gap:12, padding:'12px 14px', background:'#fff',
              border:'1px solid #E3DDD0', borderRadius:10, marginBottom:8 }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{icon}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:2 }}>{tip}</div>
                <div style={{ fontSize:12, color:'#555', lineHeight:1.5 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ⚙️ Inputs ───────────────────────────────────────────────────────── */}
      {tab === 'inputs' && (
        <div>
          {/* Business settings */}
          <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:12 }}>Business Settings</div>
            <div className="pl-settings" style={{ display:'grid', gap:12 }}>
              <div>
                <div style={{ fontSize:12, color:'#6B7F78', marginBottom:4 }}>Days Open / Year</div>
                <input type="number" min={1} max={365} value={settings.daysPerYear} style={{ ...inp, width:'100%' }}
                  onChange={e => setSt('daysPerYear', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize:12, color:'#6B7F78', marginBottom:4 }}>Tax Rate</div>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input type="number" min={0} max={100} step={0.1}
                    value={+(settings.taxRate * 100).toFixed(1)}
                    style={{ ...inp, flex:1 }}
                    onChange={e => setSt('taxRate', (Number(e.target.value)||0) / 100)} />
                  <span style={{ fontSize:13, color:'#6B7F78' }}>%</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize:12, color:'#6B7F78', marginBottom:4 }}>Target Net Margin</div>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input type="number" min={0} max={100} step={0.5}
                    value={+(settings.targetMargin * 100).toFixed(1)}
                    style={{ ...inp, flex:1 }}
                    onChange={e => setSt('targetMargin', (Number(e.target.value)||0) / 100)} />
                  <span style={{ fontSize:13, color:'#6B7F78' }}>%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Units/day */}
          <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #E3DDD0', fontSize:13, fontWeight:700, color:'#1A4C48' }}>
              Daily Units Sold per Item
              <span style={{ fontSize:11, fontWeight:400, color:'#6B7F78', marginLeft:8 }}>
                (total: {sum(products.map(p=>p.unitsDay))}/day)
              </span>
            </div>
            <div className="pl-scroll">
            <table style={{ width:'100%', minWidth:560, borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign:'left' }}>Item</th>
                  <th style={{ ...th, textAlign:'center' }}>Units/Day</th>
                  <th style={{ ...th, textAlign:'right' }}>Sell Price</th>
                  <th style={{ ...th, textAlign:'right' }}>Cost</th>
                  <th style={{ ...th, textAlign:'right' }}>COGS %</th>
                  <th style={{ ...th, textAlign:'right' }}>GP %</th>
                </tr>
              </thead>
              <tbody>
                {CATS.map(cat => (
                  <Fragment key={cat}>
                    <tr style={{ background:'#FAFAF8' }}>
                      <td colSpan={6} style={{ ...td, fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em', color:'#6B7F78', padding:'7px 14px' }}>{cat}</td>
                    </tr>
                    {prods.filter(p=>p.cat===cat).map(p=>(
                      <tr key={p.id}>
                        <td style={{ ...td, paddingLeft:20 }}>{p.name}</td>
                        <td style={{ ...td, textAlign:'center' }}>
                          <input type="number" min={0} value={p.unitsDay} style={{ ...inp, width:65 }}
                            onChange={e=>setP(p.id,'unitsDay',e.target.value)} />
                        </td>
                        <td style={{ ...td, textAlign:'right' }}>
                          <input type="number" step="0.01" min={0} value={p.price} style={{ ...inp, width:65 }}
                            onChange={e=>setP(p.id,'price',e.target.value)} />
                        </td>
                        <td style={{ ...td, textAlign:'right' }}>
                          <input type="number" step="0.01" min={0} value={p.cost} style={{ ...inp, width:65 }}
                            onChange={e=>setP(p.id,'cost',e.target.value)} />
                        </td>
                        <td style={{ ...td, textAlign:'right', fontWeight:600,
                          color: p.price>0 && p.cost/p.price<0.30 ? '#276749' : p.price>0 && p.cost/p.price<0.40 ? '#C1683C' : '#C53030' }}>
                          {p.price > 0 ? pp(p.cost/p.price) : '—'}
                        </td>
                        <td style={{ ...td, textAlign:'right', fontWeight:700,
                          color:p.gpPct>=0.75?'#276749':p.gpPct>=0.65?'#C1683C':'#C53030' }}>
                          {pp(p.gpPct)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* OPEX */}
          <div style={{ background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #E3DDD0', fontSize:13, fontWeight:700, color:'#1A4C48' }}>
              Monthly Operating Expenses
            </div>
            <div className="pl-scroll">
            <table style={{ width:'100%', minWidth:380, borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign:'left' }}>Expense</th>
                  <th style={{ ...th, textAlign:'center' }}>Monthly $</th>
                  <th style={{ ...th, textAlign:'right' }}>Annual</th>
                </tr>
              </thead>
              <tbody>
                {opex.map((e,i)=>(
                  <tr key={e.name}>
                    <td style={td}>{e.name}</td>
                    <td style={{ ...td, textAlign:'center' }}>
                      <input type="number" min={0} value={e.monthly} style={{ ...inp, width:80 }}
                        onChange={ev=>setO(i,ev.target.value)} />
                    </td>
                    <td style={{ ...td, textAlign:'right', color:'#C1683C', fontWeight:600 }}>{fmt(e.monthly*12)}</td>
                  </tr>
                ))}
                <tr style={{ background:'#FFF0DC' }}>
                  <td style={{ ...td, fontWeight:700, color:'#C1683C' }}>Total</td>
                  <td style={{ ...td, textAlign:'center', fontWeight:700 }}>{fmt(annOpex/12)}/mo</td>
                  <td style={{ ...td, textAlign:'right', fontWeight:700, color:'#C1683C' }}>{fmt(annOpex)}/yr</td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginTop:12, flexWrap:'wrap' }}>
            <div style={{ fontSize:11, color:'#aaa' }}>All inputs auto-save to this device.</div>
            <button onClick={()=>setTab('pl')} style={{
              background:'#1A4C48', color:'#fff', border:'none', borderRadius:8,
              padding:'10px 20px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit',
            }}>
              View P&amp;L →
            </button>
          </div>
        </div>
      )}

      <style>{`
        /* Business settings: three inputs side by side is too tight on a phone */
        .pl-settings { grid-template-columns: 1fr 1fr 1fr; }
        @media (max-width: 560px) {
          .pl-settings { grid-template-columns: 1fr 1fr; }
        }
        /* Wide input tables scroll horizontally instead of clipping the last columns */
        .pl-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .pl-scroll::-webkit-scrollbar { height: 6px; }
        .pl-scroll::-webkit-scrollbar-thumb { background: #DCD5C7; border-radius: 3px; }
        /* Native range inputs render inconsistently — style the track and thumb */
        .pl-slider {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 6px; padding: 0; min-height: 0;
          border: none; border-radius: 3px;
          background: #EEE3D3; cursor: pointer;
        }
        .pl-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 24px; height: 24px; border-radius: 50%;
          background: #C1683C; border: 3px solid #fff;
          box-shadow: 0 1px 5px rgba(0,0,0,0.28); cursor: grab;
        }
        .pl-slider::-moz-range-thumb {
          width: 22px; height: 22px; border-radius: 50%;
          background: #C1683C; border: 3px solid #fff;
          box-shadow: 0 1px 5px rgba(0,0,0,0.28); cursor: grab;
        }
      `}</style>
    </div>
  )
}
