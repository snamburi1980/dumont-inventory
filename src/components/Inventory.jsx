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
            className={`cat-btn ${activeCategory === cat ? 'active' : ''}`}
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
              <div style={{fontSize:18,fontWeight:700,color:'var(--green-ok)'}}>${totalValue.toFixed(0)}</div>
              <div style={{fontSize:10,color:'#aaa',textTransform:'uppercase'}}>Stock Value</div>
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:12,color:'var(--text-muted)'}}>
              {iceCreamItems.length} active flavors{inactiveIceCream.length > 0 ? ` · ${inactiveIceCream.length} inactive` : ''}
            </div>
            {inactiveIceCream.length > 0 && (
              <button
                onClick={() => setShowInactive(!showInactive)}
                style={{fontSize:11,padding:'4px 10px',border:'1px solid var(--border)',borderRadius:6,background:'none',cursor:'pointer',color:'var(--text-muted)'}}
              >
                {showInactive ? 'Hide Inactive' : `Show Inactive (${inactiveIceCream.length})`}
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
                  <div className={`stock-bar-fill ${barCls}`} style={{ width:`${pct}%` }} />
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
