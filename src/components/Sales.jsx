import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { logAudit, AUDIT_ACTIONS } from '../utils/auditLogger'
import { db } from '../firebase/config'
import { matchCloverItem, ITEM_SIZES } from '../data/recipes'

export default function Sales({ invHook, viewingStore, showToast }) {
  const { inventory, saveInventory } = invHook
  const [loading,  setLoading]  = useState(false)
  const [queue,    setQueue]    = useState([]) // pending uploads
  const [history,  setHistory]  = useState([])
  const [applying, setApplying] = useState(null) // id of item being applied

  useEffect(() => { loadHistory() }, [viewingStore])

  async function loadHistory() {
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'salesLedger'),
        orderBy('appliedAt', 'desc')
      )
      const snap = await getDocs(q)
      setHistory(snap.docs.map(d => d.data()))
    } catch(e) {}
  }

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
    const ingredientTotals = {}
    matched.forEach(({ name, sold, recipe }) => {
      recipe.forEach(({ item, qty, unit }) => {
        if (!ingredientTotals[item]) ingredientTotals[item] = { qty: 0, unit }
        ingredientTotals[item].qty += qty * sold
      })
    })
    const deductions = []
    Object.entries(ingredientTotals).forEach(([itemName, data]) => {
      const invItem = inventory.find(i => i.name === itemName)
      let deductUnits = 0, deductDisplay = ''
      if (data.unit === 'scoop') {
        const spb = invItem?.scoops_per_bucket || 60
        deductUnits = data.qty / spb
        deductDisplay = `${data.qty.toFixed(0)} scoops = ${deductUnits.toFixed(2)} tubs`
      } else if (data.unit === 'g' && ITEM_SIZES[itemName]) {
        deductUnits = data.qty / ITEM_SIZES[itemName]
        deductDisplay = `${data.qty.toFixed(0)}g = ${deductUnits.toFixed(2)} bags/bottles`
      } else if (data.unit === 'ml' && itemName === 'Milk') {
        deductUnits = data.qty / 3785
        deductDisplay = `${(data.qty/1000).toFixed(1)}L = ${deductUnits.toFixed(2)} gallons`
      } else {
        deductUnits = data.qty
        deductDisplay = `${data.qty.toFixed(2)} ${data.unit}`
      }
      deductions.push({
        itemName, invItem, deductUnits, deductDisplay,
        currentStock: invItem ? invItem.stock : null,
        newStock: invItem ? Math.max(0, invItem.stock - deductUnits) : null,
        belowPar: invItem ? (invItem.stock - deductUnits) < invItem.par : false,
      })
    })
    return { matched, unmatched, deductions, totalSales }
  }

  function handleFile(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setLoading(true)
    const newItems = []
    let processed = 0
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const { salesData, periodLabel } = parseCloverCSV(ev.target.result)
        if (salesData.length) {
          const { matched, unmatched, deductions, totalSales } = calculateDeductions(salesData)
          newItems.push({
            id: Date.now() + Math.random(),
            fileName: file.name,
            periodLabel,
            matched,
            unmatched,
            deductions,
            totalSales,
            itemsSold: matched.reduce((s,r) => s+r.sold, 0),
          })
        }
        processed++
        if (processed === files.length) {
          setQueue(prev => [...prev, ...newItems])
          setLoading(false)
        }
      }
      reader.readAsText(file)
    })
    e.target.value = ''
  }

  function removeFromQueue(id) {
    setQueue(prev => prev.filter(q => q.id !== id))
  }

  async function applySingle(id) {
    const item = queue.find(q => q.id === id)
    if (!item) return
    setApplying(id)

    // Apply deductions
    const updatedInventory = inventory.map(inv => {
      const ded = item.deductions.find(d => d.itemName === inv.name)
      if (!ded) return inv
      return { ...inv, stock: Math.max(0, Math.round((inv.stock - ded.deductUnits) * 100) / 100) }
    })
    await saveInventory(viewingStore, updatedInventory)
    invHook.loadInventory(viewingStore)

    // Save to ledger
    try {
      await addDoc(collection(db, 'stores', viewingStore, 'salesLedger'), {
        period:         item.periodLabel,
        revenue:        item.totalSales,
        itemsSold:      item.itemsSold,
        matchedItems:   item.matched.length,
        unmatchedItems: item.unmatched.length,
        fileName:       item.fileName,
        appliedAt:      Date.now(),
        dateTs:         Date.now(),
      })
    } catch(e) {}

    await loadHistory()
    setQueue(prev => prev.filter(q => q.id !== id))
    setApplying(null)
    showToast(`Applied: ${item.periodLabel || item.fileName}`)
  }

  async function applyAll() {
    for (const item of queue) {
      await applySingle(item.id)
    }
  }

  const totalRevenue = queue.reduce((s,q) => s + q.totalSales, 0)
  const totalItems   = queue.reduce((s,q) => s + q.itemsSold, 0)

  return (
    <div>

      {/* Upload zone — supports multiple files */}
      <label style={{ display:'block', cursor:'pointer', marginBottom:16 }}>
        <div style={{
          border:'2px dashed var(--border)', borderRadius:16,
          padding:'28px 20px', textAlign:'center',
          transition:'border-color 0.2s'
        }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
          <div style={{ fontSize:15, fontWeight:600, color:'var(--dark)' }}>Upload Clover Sales Reports</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
            Select one or multiple CSV files
          </div>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            onChange={handleFile}
            style={{ display:'none' }}
          />
        </div>
      </label>

      {loading && (
        <div style={{ textAlign:'center', padding:16, color:'var(--text-muted)' }}>
          Reading files...
        </div>
      )}

      {/* Queue */}
      {queue.length > 0 && (
        <div style={{ marginBottom:16 }}>

          {/* Queue summary */}
          <div style={{
            background:'var(--dark)', borderRadius:12, padding:'12px 16px',
            marginBottom:12, display:'grid', gridTemplateColumns:'repeat(3,1fr)',
            gap:8, textAlign:'center'
          }}>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:'#D4A843' }}>{queue.length}</div>
              <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase' }}>Files</div>
            </div>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:'#27AE60' }}>
                ${totalRevenue.toLocaleString('en-US',{maximumFractionDigits:0})}
              </div>
              <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase' }}>Total Revenue</div>
            </div>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:'var(--caramel)' }}>{totalItems}</div>
              <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase' }}>Items Sold</div>
            </div>
          </div>

          {/* Individual files in queue */}
          {queue.map(item => (
            <div key={item.id} style={{
              background:'var(--cream)', border:'1px solid var(--border)',
              borderRadius:10, padding:'12px 14px', marginBottom:8
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>
                    {item.periodLabel || item.fileName}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                    ${item.totalSales.toLocaleString('en-US',{maximumFractionDigits:0})} revenue
                    · {item.itemsSold} items sold
                    · {item.matched.length} matched
                  </div>
                  {/* Deductions preview */}
                  <div style={{ marginTop:8 }}>
                    {item.deductions.filter(d => d.invItem).slice(0,4).map(d => (
                      <div key={d.itemName} style={{
                        display:'flex', justifyContent:'space-between',
                        fontSize:11, color:'var(--text-muted)', padding:'2px 0'
                      }}>
                        <span>{d.itemName}</span>
                        <span style={{ color: d.belowPar ? 'var(--red-alert)' : 'var(--dark)', fontWeight:600 }}>
                          -{d.deductUnits.toFixed(2)} {d.invItem?.uom}
                        </span>
                      </div>
                    ))}
                    {item.deductions.filter(d => d.invItem).length > 4 && (
                      <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                        +{item.deductions.filter(d => d.invItem).length - 4} more items...
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeFromQueue(item.id)}
                  style={{ background:'none', border:'none', color:'var(--red-alert)', cursor:'pointer', fontSize:18, marginLeft:8 }}
                >
                  x
                </button>
              </div>
              {/* Apply button per file */}
              <div style={{ display:'flex', gap:8, marginTop:10 }}>
                <button
                  onClick={() => applySingle(item.id)}
                  disabled={applying === item.id}
                  style={{
                    flex:1, background: applying === item.id ? '#aaa' : '#27AE60',
                    color:'#fff', border:'none', borderRadius:8,
                    padding:'10px', fontSize:13, fontWeight:600,
                    cursor: applying === item.id ? 'not-allowed' : 'pointer'
                  }}
                >
                  {applying === item.id ? 'Applying...' : 'Apply to Inventory'}
                </button>
              </div>
            </div>
          ))}

          {/* Apply all button - only show if more than 1 file */}
          {queue.length > 1 && (
            <button
              onClick={applyAll}
              disabled={!!applying}
              style={{
                width:'100%', background: applying ? '#aaa' : 'var(--dark)',
                color:'#fff', border:'none', borderRadius:10,
                padding:'14px', fontSize:14, fontWeight:700,
                cursor: applying ? 'not-allowed' : 'pointer',
                marginTop:4
              }}
            >
              {applying ? 'Applying...' : `Apply All ${queue.length} Reports`}
            </button>
          )}
        </div>
      )}

      {/* Upload History */}
      {history.length > 0 && (
        <div style={{ marginTop:8 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--dark)', marginBottom:10 }}>
            Upload History
          </div>
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{
              display:'grid', gridTemplateColumns:'1fr auto auto',
              padding:'10px 14px', background:'var(--dark)',
              fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)',
              textTransform:'uppercase', letterSpacing:'0.5px', gap:16
            }}>
              <div>Period</div>
              <div style={{ textAlign:'right' }}>Revenue</div>
              <div style={{ textAlign:'right' }}>Status</div>
            </div>
            {history.map((h, idx) => (
              <div key={idx} style={{
                display:'grid', gridTemplateColumns:'1fr auto auto',
                padding:'12px 14px', gap:16,
                borderBottom: idx < history.length-1 ? '1px solid var(--border)' : 'none',
                background: idx % 2 === 0 ? '#fff' : 'var(--cream)'
              }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>
                    {h.period || h.fileName || 'Upload'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                    {h.itemsSold || 0} items
                    · {new Date(h.appliedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                  </div>
                </div>
                <div style={{ alignSelf:'center', textAlign:'right' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#27AE60' }}>
                    ${(h.revenue||0).toLocaleString('en-US',{maximumFractionDigits:0})}
                  </div>
                </div>
                <div style={{ alignSelf:'center' }}>
                  <span style={{
                    fontSize:11, fontWeight:600, padding:'3px 10px',
                    borderRadius:20, background:'#E8F5E9', color:'#27AE60',
                    whiteSpace:'nowrap'
                  }}>
                    Applied
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
