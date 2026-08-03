import { useState, useEffect } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'

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

function monthOptions() {
  const opts = []
  const now  = new Date()
  for (let i = 0; i < 12; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toISOString().slice(0, 7)
    const lbl = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    opts.push({ key, label: lbl })
  }
  return opts
}

const fmt  = n  => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtD = n  => `$${Number(n || 0).toFixed(2)}`
const MONTHS = monthOptions()

async function fetchMonthData(storeId, monthKey) {
  const [crSnap, invSnap] = await Promise.all([
    getDocs(query(collection(db, 'stores', storeId, 'cashRegister'), where('monthKey', '==', monthKey))),
    getDocs(query(collection(db, 'invoices'), where('orgId', '==', 'dumont'), where('approved', '==', true))),
  ])
  const revenue = crSnap.docs.reduce((s, d) => s + (Number(d.data().difference) || 0), 0)
  const cost    = invSnap.docs
    .filter(d => (d.data().invoiceDate || '').startsWith(monthKey))
    .reduce((s, d) => s + (Number(d.data().total) || 0), 0)
  return { revenue, cost }
}

export default function COGS({ viewingStore }) {
  const [view,         setView]         = useState('report')
  const [monthKey,     setMonthKey]     = useState(MONTHS[0].key)
  const [data,         setData]         = useState(null)
  const [trend,        setTrend]        = useState([])
  const [loading,      setLoading]      = useState(false)
  const [trendLoading, setTrendLoading] = useState(false)
  const [marginCat,    setMarginCat]    = useState('all')

  useEffect(() => {
    if (view === 'report' && viewingStore) {
      loadMonth()
      loadTrend()
    }
  }, [view, viewingStore, monthKey])

  async function loadMonth() {
    setLoading(true)
    try {
      const d = await fetchMonthData(viewingStore, monthKey)
      setData(d)
    } catch (e) { console.error('COGS load:', e) }
    setLoading(false)
  }

  async function loadTrend() {
    setTrendLoading(true)
    try {
      const results = await Promise.all(
        MONTHS.slice(0, 6).map(async m => {
          const d = await fetchMonthData(viewingStore, m.key)
          return { ...d, monthKey: m.key, label: m.label }
        })
      )
      setTrend(results)
    } catch (e) { console.error('COGS trend:', e) }
    setTrendLoading(false)
  }

  const revenue     = data?.revenue     || 0
  const cost        = data?.cost        || 0
  const margin      = revenue - cost
  const marginPct   = revenue > 0 ? (margin / revenue * 100)   : 0
  const cogsPct     = revenue > 0 ? (cost   / revenue * 100)   : 0
  const health      = marginPct >= 65 ? 'Excellent' : marginPct >= 50 ? 'Good' : marginPct > 0 ? 'Low' : '—'
  const healthColor = marginPct >= 65 ? '#276749'   : marginPct >= 50 ? '#C1683C' : marginPct > 0 ? '#E53E3E' : '#6B7F78'

  const btn = id => ({
    flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: view === id ? 700 : 500, fontFamily: 'inherit',
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

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={btn('report')}  onClick={() => setView('report')}>📊 COGS Report</button>
        <button style={btn('margins')} onClick={() => setView('margins')}>💰 Menu Margins</button>
      </div>

      {/* ── COGS Report ──────────────────────────────────────────────────── */}
      {view === 'report' && (
        <div>
          {!viewingStore && (
            <div style={{ textAlign: 'center', padding: 32, color: '#6B7F78', fontSize: 13 }}>
              Select a store to view the COGS report.
            </div>
          )}

          {viewingStore && (
            <>
              {/* Month picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: '#6B7F78', fontWeight: 600 }}>Month</label>
                <select value={monthKey} onChange={e => setMonthKey(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
                  {MONTHS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#6B7F78', fontSize: 13 }}>Loading…</div>
              ) : (
                <>
                  {/* KPI cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
                    {kpi('Revenue',      fmt(revenue), '#276749',   'from Cash Register')}
                    {kpi('Invoice Cost', fmt(cost),    '#C53030',   'approved invoices')}
                    {kpi('Gross Margin', fmt(margin),  healthColor, `${marginPct.toFixed(1)}% margin`)}
                    {kpi('COGS %',       `${cogsPct.toFixed(1)}%`, cogsPct < 35 ? '#276749' : cogsPct < 50 ? '#C1683C' : '#C53030', health)}
                  </div>

                  {/* Health bar */}
                  {revenue > 0 && (
                    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: healthColor, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: healthColor }}>{health}</div>
                        <div style={{ fontSize: 11, color: '#6B7F78' }}>
                          {marginPct >= 65 ? 'Strong margin — great cost control'
                           : marginPct >= 50 ? 'Healthy margin — within target range'
                           : marginPct > 0  ? 'Below target — review invoice costs vs revenue'
                           : 'No revenue logged for this month'}
                        </div>
                      </div>
                    </div>
                  )}

                  {revenue === 0 && cost === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 16px', background: '#FAFAF8', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 14, color: '#6B7F78', fontSize: 13 }}>
                      No Cash Register or Invoice data for {MONTHS.find(m => m.key === monthKey)?.label}.<br />
                      <span style={{ fontSize: 12 }}>Log daily cash entries in Records → Cash Register and approved invoices in Records → Invoices.</span>
                    </div>
                  )}

                  {/* 6-month trend */}
                  <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: '#6B7F78', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      6-Month Trend
                    </div>
                    {trendLoading ? (
                      <div style={{ padding: 16, color: '#6B7F78', fontSize: 13 }}>Loading trend…</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: '#FAFAF8' }}>
                              {['Month', 'Revenue', 'Costs', 'Margin', 'Margin %'].map(h => (
                                <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Month' ? 'left' : 'right', color: '#6B7F78', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {trend.map(row => {
                              const m   = row.revenue - row.cost
                              const pct = row.revenue > 0 ? (m / row.revenue * 100) : 0
                              const col = pct >= 65 ? '#276749' : pct >= 50 ? '#C1683C' : pct > 0 ? '#C53030' : '#aaa'
                              const isSelected = row.monthKey === monthKey
                              return (
                                <tr key={row.monthKey}
                                  onClick={() => setMonthKey(row.monthKey)}
                                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: isSelected ? '#FFFBF0' : 'transparent' }}>
                                  <td style={{ padding: '10px 14px', fontWeight: isSelected ? 700 : 400, color: 'var(--dark)', whiteSpace: 'nowrap' }}>
                                    {row.label.replace(/ 20\d\d/, '')} {isSelected && '←'}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#276749', fontWeight: 600 }}>{row.revenue > 0 ? fmt(row.revenue) : '—'}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#C53030' }}>{row.cost > 0 ? fmt(row.cost) : '—'}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: col, fontWeight: 600 }}>{row.revenue > 0 ? fmt(m) : '—'}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: col, fontWeight: 700 }}>{pct > 0 ? `${pct.toFixed(1)}%` : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                    Revenue = sum of daily cash differences. Costs = approved invoices dated in this month (org-wide).
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Menu Margins ─────────────────────────────────────────────────── */}
      {view === 'margins' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {['all', 'Ice Cream', 'Drinks', 'Coffee'].map(cat => (
              <button key={cat} onClick={() => setMarginCat(cat)} style={{
                padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                fontSize: 12, fontWeight: marginCat === cat ? 700 : 500, fontFamily: 'inherit',
                background: marginCat === cat ? 'var(--dark)' : '#fff',
                color:      marginCat === cat ? '#fff'        : 'var(--text-muted)',
                border:     marginCat === cat ? 'none'        : '1px solid var(--border)',
              }}>
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(marginCat === 'all' ? MENU_MARGINS : MENU_MARGINS.filter(i => i.cat === marginCat)).map(item => {
              const margin  = (item.sell - item.cost) / item.sell * 100
              const cogsPct = item.cost / item.sell * 100
              const color   = cogsPct < 20 ? '#276749' : cogsPct < 30 ? '#C1683C' : '#C53030'
              return (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: '#6B7F78', marginTop: 2 }}>
                      Cost {fmtD(item.cost)} · Sell {fmtD(item.sell)} · COGS {cogsPct.toFixed(0)}%
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color }}>{margin.toFixed(0)}%</div>
                    <div style={{ fontSize: 10, color: '#6B7F78' }}>margin</div>
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
