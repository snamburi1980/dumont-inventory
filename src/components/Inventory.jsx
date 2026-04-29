import { useState, useRef, useEffect } from 'react'
import TipBanner from './TipBanner'

export default function Inventory({ invHook, viewingStore, showToast, auth }) {
  const { inventory, getStatus, adjustStock, setStock, toggleActive, setPar, saveInventory } = invHook

  const [activeCategory, setActiveCategory] = useState('all')
  const [search,         setSearch]         = useState('')
  const [showInactive,   setShowInactive]   = useState(false)
  const [editingPar,     setEditingPar]     = useState(null)
  const [editingStock,   setEditingStock]   = useState(null)
  const [locked,         setLocked]         = useState(true)
  const [saveStatus,     setSaveStatus]     = useState(null) // null | 'saving' | 'saved' | 'error'
  const saveTimer = useRef(null)
  const lockTimer = useRef(null)
  const LOCK_TIMEOUT = 5 * 60 * 1000

  function resetLockTimer() {
    clearTimeout(lockTimer.current)
    lockTimer.current = setTimeout(() => {
      setLocked(true)
      showToast('Inventory locked after inactivity')
    }, LOCK_TIMEOUT)
  }

  function unlock() {
    setLocked(false)
    resetLockTimer()
    showToast('Inventory unlocked — auto-locks in 5 mins')
  }

  const categories = ['all', ...[...new Set(inventory.map(i => i.cat))].filter(Boolean).sort()]

  const filtered = inventory.filter(i => {
    const catMatch    = activeCategory === 'all' || i.cat === activeCategory
    const searchMatch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.code||'').toLowerCase().includes(search.toLowerCase())
    const activeMatch = showInactive || i.active !== false
    return catMatch && searchMatch && activeMatch
  })

  // Stats
  const activeItems = inventory.filter(i => i.active !== false)
  const totalVal    = activeItems.reduce((s,i) => s + (i.stock||0) * (i.cost||i.cost_price||0), 0)
  const lowCount    = activeItems.filter(i => getStatus(i) !== 'ok').length

  function handleAdjust(id, delta) {
    if (locked) { showToast('Tap Unlock to make changes'); return }
    adjustStock(id, delta)
    scheduleSave()
    resetLockTimer()
  }

  function handleSetStock(id, value) {
    if (locked) { showToast('Tap Unlock to make changes'); return }
    setStock(id, value)
    scheduleSave()
    resetLockTimer()
  }

  function scheduleSave() {
    setSaveStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await saveInventory(viewingStore, inventory)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus(null), 2000)
      } catch(e) {
        setSaveStatus('error')
        showToast('Save failed — check your connection')
      }
    }, 1200)
  }

  async function handleToggleActive(id) {
    const updated = inventory.map(i => i.id === id ? {...i, active: i.active === false ? true : false} : i)
    toggleActive(id)
    await saveInventory(viewingStore, updated)
    showToast('Updated')
  }

  async function handleSetPar(id, value) {
    setPar(id, value)
    setEditingPar(null)
    await saveInventory(viewingStore, inventory.map(i => i.id === id ? {...i, par: parseInt(value)||0} : i))
    showToast('PAR updated')
  }

  function statusDot(status) {
    const colors = { ok:'#27AE60', low:'#E67E22', critical:'#E74C3C' }
    const labels = { ok:'OK', low:'Low', critical:'Critical' }
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600, color: colors[status] }}>
        <span style={{ width:7, height:7, borderRadius:'50%', background: colors[status], display:'inline-block' }}/>
        {labels[status]}
      </span>
    )
  }

  return (
    <div>
      <TipBanner message="Update stock counts after receiving deliveries or doing a stock count. Use +/- or tap the number to edit directly. Tap PAR to update minimum level." />

      {/* Lock / Unlock bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background: locked ? '#FFF3E0' : '#E8F5E9', border:`1px solid ${locked ? '#FFB74D' : '#81C784'}`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18 }}>{locked ? '🔒' : '🔓'}</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color: locked ? '#E65100' : '#2E7D32' }}>
              {locked ? 'Inventory Locked' : 'Inventory Unlocked'}
            </div>
            <div style={{ fontSize:11, color:'#8B7355' }}>
              {locked ? 'Tap Unlock to make changes' : 'Auto-locks in 5 mins of inactivity'}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {saveStatus === 'saving' && <span style={{ fontSize:11, color:'#8B7355' }}>Saving...</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize:11, color:'#27AE60' }}>✓ Saved</span>}
          {saveStatus === 'error'  && <span style={{ fontSize:11, color:'#E74C3C' }}>⚠ Save failed</span>}
          <button onClick={locked ? unlock : () => { setLocked(true); showToast('Inventory locked') }}
            style={{ background: locked ? '#E65100' : '#2E7D32', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit' }}>
            {locked ? 'Unlock' : 'Lock'}
          </button>
        </div>
      </div>

      {/* Category summary */}
      {(() => {
        const cats    = [...new Set(activeItems.map(i => i.cat))].filter(Boolean).sort()
        const selItems = activeCategory === 'all' ? activeItems : activeItems.filter(i => i.cat === activeCategory)
        const selVal   = selItems.reduce((s,i) => s + (i.stock||0) * (i.cost||i.cost_price||0), 0)
        const selLow   = selItems.filter(i => getStatus(i) !== 'ok').length
        return (
          <div>
            {/* 3 stat cards for selected category */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
              <div style={{ background:'rgba(200,132,58,0.08)', border:'1px solid var(--caramel)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--caramel)' }}>${selVal.toFixed(0)}</div>
                <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>
                  {activeCategory === 'all' ? 'Total Value' : `${activeCategory}`}
                </div>
              </div>
              <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:700, color: selLow > 0 ? '#E74C3C' : '#27AE60' }}>{selLow}</div>
                <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>Low/Critical</div>
              </div>
              <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--dark)' }}>{selItems.length}</div>
                <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>Items</div>
              </div>
            </div>
            {/* Category pill tabs with value */}
            <div style={{ display:'flex', gap:6, overflowX:'auto', marginBottom:12, paddingBottom:2 }}>
              <button onClick={() => setActiveCategory('all')} style={{
                flexShrink:0, padding:'5px 12px', borderRadius:20,
                border:'1px solid var(--border)', cursor:'pointer', fontFamily:'inherit',
                background: activeCategory==='all' ? 'var(--dark)' : '#fff',
                color: activeCategory==='all' ? '#fff' : 'var(--text-muted)', fontSize:11,
                fontWeight: activeCategory==='all' ? 700 : 400
              }}>All · ${totalVal.toFixed(0)}</button>
              {cats.map(cat => {
                const items = activeItems.filter(i => i.cat === cat)
                const val   = items.reduce((s,i) => s + (i.stock||0) * (i.cost||i.cost_price||0), 0)
                const low   = items.filter(i => getStatus(i) !== 'ok').length
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                    flexShrink:0, padding:'5px 12px', borderRadius:20,
                    border: low > 0 ? '1px solid #E74C3C' : '1px solid var(--border)',
                    cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap',
                    background: activeCategory===cat ? 'var(--dark)' : '#fff',
                    color: activeCategory===cat ? '#fff' : low > 0 ? '#E74C3C' : 'var(--text-muted)',
                    fontSize:11, fontWeight: activeCategory===cat ? 700 : 400
                  }}>
                    {cat} · ${val.toFixed(0)}{low > 0 ? ` ⚠${low}` : ''}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Search + filters */}
      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
        <input className="search-bar" placeholder="Search items..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex:1, marginBottom:0 }}/>
        <button onClick={() => setShowInactive(!showInactive)}
          style={{ padding:'8px 12px', border:'1px solid var(--border)', borderRadius:8, background: showInactive ? 'var(--dark)' : '#fff', color: showInactive ? '#fff' : 'var(--text-muted)', cursor:'pointer', fontSize:11, fontFamily:'inherit', whiteSpace:'nowrap' }}>
          {showInactive ? 'Hide Inactive' : 'Show Inactive'}
        </button>
      </div>

      {/* Category tabs */}
      <div className="filter-bar" style={{ marginBottom:12 }}>
        {categories.map(cat => (
          <button key={cat} className={`cat-btn ${activeCategory===cat?'active':''}`} onClick={() => setActiveCategory(cat)}>
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        {/* Table header */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px 60px', gap:0, background:'var(--dark)', padding:'10px 14px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase' }}>Item</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>Stock</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>PAR</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>Status</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>Adj</div>
        </div>

        {/* Table rows */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:13 }}>No items found</div>
        ) : filtered.map((item, idx) => {
          const s       = getStatus(item)
          const inactive = item.active === false
          return (
            <div key={item.id} style={{
              display:'grid', gridTemplateColumns:'1fr 80px 80px 100px 60px',
              gap:0, padding:'10px 14px', alignItems:'center',
              borderBottom: idx < filtered.length-1 ? '1px solid var(--border)' : 'none',
              background: inactive ? '#FAFAFA' : s === 'critical' ? '#FFF5F5' : s === 'low' ? '#FFFBF0' : '#fff',
              opacity: inactive ? 0.6 : 1,
            }}>
              {/* Name + meta */}
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{item.name}</div>
                <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:1 }}>
                  {item.vendor && <span>{item.vendor}</span>}
                  {item.code && <span> · {item.code}</span>}
                  {inactive && <span style={{ color:'#E74C3C' }}> · Inactive</span>}
                </div>
              </div>

              {/* Stock — tap to edit */}
              <div style={{ textAlign:'center' }}>
                {editingStock === item.id ? (
                  <input type="number" defaultValue={item.stock} autoFocus
                    onBlur={e => { handleSetStock(item.id, e.target.value); setEditingStock(null) }}
                    onKeyDown={e => { if(e.key==='Enter') { handleSetStock(item.id, e.target.value); setEditingStock(null) }}}
                    style={{ width:52, textAlign:'center', fontWeight:700, fontSize:14, padding:'3px 4px', border:'1px solid var(--caramel)', borderRadius:6 }}/>
                ) : (
                  <div onClick={() => setEditingStock(item.id)}
                    style={{ fontSize:16, fontWeight:700, color:'var(--dark)', cursor:'pointer', padding:'2px 6px', borderRadius:6, display:'inline-block' }}
                    title="Tap to edit">
                    {item.stock}
                    <div style={{ fontSize:9, color:'var(--text-muted)', fontWeight:400 }}>{item.uom}</div>
                  </div>
                )}
              </div>

              {/* PAR — tap to edit */}
              <div style={{ textAlign:'center' }}>
                {editingPar === item.id ? (
                  <input type="number" defaultValue={item.par} autoFocus
                    onBlur={e => handleSetPar(item.id, e.target.value)}
                    onKeyDown={e => e.key==='Enter' && handleSetPar(item.id, e.target.value)}
                    style={{ width:52, textAlign:'center', fontSize:13, padding:'3px 4px', border:'1px solid var(--caramel)', borderRadius:6 }}/>
                ) : (
                  <div onClick={() => setEditingPar(item.id)}
                    style={{ fontSize:13, color:'var(--text-muted)', cursor:'pointer', padding:'2px 6px', borderRadius:6, display:'inline-block' }}
                    title="Tap to edit PAR">
                    {item.par}
                  </div>
                )}
              </div>

              {/* Status */}
              <div style={{ textAlign:'center' }}>
                {statusDot(s)}
              </div>

              {/* +/- buttons */}
              <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                <button onClick={() => handleAdjust(item.id, -1)}
                  style={{ width:24, height:24, borderRadius:6, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:14, fontWeight:700, color:'#E74C3C', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                  −
                </button>
                <button onClick={() => handleAdjust(item.id, 1)}
                  style={{ width:24, height:24, borderRadius:6, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:14, fontWeight:700, color:'#27AE60', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Activate/Deactivate — small link below table */}
      <div style={{ marginTop:8, fontSize:11, color:'var(--text-muted)', textAlign:'right' }}>
        Tap item name to activate/deactivate ·
        <button onClick={() => setShowInactive(!showInactive)}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'var(--caramel)', fontFamily:'inherit', marginLeft:4 }}>
          {showInactive ? 'hide inactive' : 'show inactive'}
        </button>
      </div>
    </div>
  )
}
