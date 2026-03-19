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

    showToast(` Inventory updated — ${results.deductions.filter(d=>d.invItem).length} items deducted`)
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
                      {d.currentStock?.toFixed(1)} &rarr; <strong style={{color: d.belowPar ? 'var(--red-alert)' : 'var(--green-ok)'}}>
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
