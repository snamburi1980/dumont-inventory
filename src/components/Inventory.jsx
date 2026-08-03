import { useState, useRef } from 'react'
import TipBanner from './TipBanner'

export default function Inventory({ invHook, viewingStore, showToast, auth }) {
  const { inventory, getStatus, adjustStock, setStock, toggleActive, setPar, saveInventory } = invHook

  const [activeCategory, setActiveCategory] = useState('all')
  const [search,         setSearch]         = useState('')
  const [showInactive,   setShowInactive]   = useState(false)
  const [editingPar,        setEditingPar]        = useState(null)
  const [editingStock,      setEditingStock]      = useState(null)
  const [locked,            setLocked]            = useState(true)
  const [saveStatus,        setSaveStatus]        = useState(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(null)
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
    if (locked) { showToast('Tap Unlock to make changes'); return }
    const updated = inventory.map(i => i.id === id ? {...i, active: i.active === false ? true : false} : i)
    toggleActive(id)
    await saveInventory(viewingStore, updated)
    showToast('Updated')
    setConfirmDeactivate(null)
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
        <span style={{ width:8, height:8, borderRadius:'50%', background: colors[status], display:'inline-block' }}/>
        {labels[status]}
      </span>
    )
  }

  return (
    <div>
      <TipBanner message="Update stock counts after receiving deliveries or doing a stock count. Tap a number to edit directly. Tap PAR to update minimum level." />

      {/* Lock / Unlock bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background: locked ? '#FFF3E0' : '#E8F5E9', border:`1px solid ${locked ? '#FFB74D' : '#81C784'}`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:20 }}>{locked ? '🔒' : '🔓'}</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color: locked ? '#E65100' : '#2E7D32' }}>
              {locked ? 'Inventory Locked' : 'Inventory Unlocked'}
            </div>
            <div style={{ fontSize:11, color:'#6B7F78' }}>
              {locked ? 'Tap Unlock to make changes' : 'Auto-locks after 5 mins of inactivity'}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {saveStatus === 'saving' && <span style={{ fontSize:11, color:'#6B7F78' }}>Saving…</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize:11, color:'#27AE60' }}>✓ Saved</span>}
          {saveStatus === 'error'  && <span style={{ fontSize:11, color:'#E74C3C' }}>⚠ Save failed</span>}
          <button onClick={locked ? unlock : () => { setLocked(true); showToast('Inventory locked') }}
            style={{ background: locked ? '#E65100' : '#2E7D32', color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit' }}>
            {locked ? 'Unlock' : 'Lock'}
          </button>
        </div>
      </div>

      {/* Category summary + filter pills */}
      {(() => {
        const cats     = [...new Set(activeItems.map(i => i.cat))].filter(Boolean).sort()
        const selItems = activeCategory === 'all' ? activeItems : activeItems.filter(i => i.cat === activeCategory)
        const selVal   = selItems.reduce((s,i) => s + (i.stock||0) * (i.cost||i.cost_price||0), 0)
        const selLow   = selItems.filter(i => getStatus(i) !== 'ok').length
        return (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
              <div style={{ background:'rgba(200,132,58,0.08)', border:'1px solid var(--caramel)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--caramel)' }}>${selVal.toFixed(0)}</div>
                <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>
                  {activeCategory === 'all' ? 'Total Value' : activeCategory}
                </div>
              </div>
              <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:700, color: selLow > 0 ? '#E74C3C' : '#27AE60' }}>{selLow}</div>
                <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>Low / Critical</div>
              </div>
              <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--dark)' }}>{selItems.length}</div>
                <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', marginTop:2 }}>Items</div>
              </div>
            </div>

            {/* Category pill tabs */}
            <div style={{ display:'flex', gap:6, overflowX:'auto', marginBottom:12, paddingBottom:2, scrollbarWidth:'none' }}>
              <button onClick={() => setActiveCategory('all')} style={{
                flexShrink:0, padding:'6px 14px', borderRadius:20,
                border:'1px solid var(--border)', cursor:'pointer', fontFamily:'inherit',
                background: activeCategory==='all' ? 'var(--dark)' : '#fff',
                color: activeCategory==='all' ? '#fff' : 'var(--text-muted)', fontSize:12,
                fontWeight: activeCategory==='all' ? 700 : 400,
              }}>All · ${totalVal.toFixed(0)}</button>
              {cats.map(cat => {
                const items = activeItems.filter(i => i.cat === cat)
                const val   = items.reduce((s,i) => s + (i.stock||0) * (i.cost||i.cost_price||0), 0)
                const low   = items.filter(i => getStatus(i) !== 'ok').length
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                    flexShrink:0, padding:'6px 14px', borderRadius:20,
                    border: low > 0 ? '1px solid #E74C3C' : '1px solid var(--border)',
                    cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap',
                    background: activeCategory===cat ? 'var(--dark)' : '#fff',
                    color: activeCategory===cat ? '#fff' : low > 0 ? '#E74C3C' : 'var(--text-muted)',
                    fontSize:12, fontWeight: activeCategory===cat ? 700 : 400,
                  }}>
                    {cat} · ${val.toFixed(0)}{low > 0 ? ` ⚠${low}` : ''}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Search + inactive toggle */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input className="search-bar" placeholder="🔍 Search items…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex:1, padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, fontFamily:'inherit', fontSize:13, background:'#F6F4ED', marginBottom:0 }}/>
        <button onClick={() => setShowInactive(!showInactive)}
          style={{ padding:'9px 14px', border:'1px solid var(--border)', borderRadius:8, background: showInactive ? 'var(--dark)' : '#fff', color: showInactive ? '#fff' : 'var(--text-muted)', cursor:'pointer', fontSize:12, fontFamily:'inherit', whiteSpace:'nowrap' }}>
          {showInactive ? 'Hide Inactive' : 'Show Inactive'}
        </button>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        {/* Table header */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 70px 90px 80px', gap:0, background:'var(--dark)', padding:'10px 14px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase' }}>Item</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>Stock ✏</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>PAR ✏</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>Status</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', textAlign:'center' }}>Adjust</div>
        </div>

        {/* Table rows */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:13 }}>No items found</div>
        ) : filtered.map((item, idx) => {
          const s       = getStatus(item)
          const inactive = item.active === false
          return (
            <div key={item.id} style={{
              display:'grid', gridTemplateColumns:'1fr 80px 70px 90px 80px',
              gap:0, padding:'10px 14px', alignItems:'center',
              borderBottom: idx < filtered.length-1 ? '1px solid var(--border)' : 'none',
              background: inactive ? '#FAFAFA' : s === 'critical' ? '#FFF5F5' : s === 'low' ? '#FFFBF0' : '#fff',
              opacity: inactive ? 0.6 : 1,
            }}>
              {/* Name + meta */}
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{item.name}</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                  {item.cat && <span style={{ fontSize:10, color:'var(--text-muted)' }}>{item.cat}</span>}
                  {item.code && <span style={{ fontSize:10, color:'var(--text-muted)' }}>· {item.code}</span>}
                  {inactive && (
                    <button onClick={() => handleToggleActive(item.id)}
                      style={{ fontSize:9, background:'#FFEBEE', color:'#E74C3C', border:'none', borderRadius:4, padding:'1px 6px', cursor:'pointer', fontFamily:'inherit' }}>
                      Inactive · Activate
                    </button>
                  )}
                  {!inactive && auth?.userConfig?.role !== 'staff' && confirmDeactivate !== item.id && (
                    <button onClick={() => { if(locked){ showToast('Tap Unlock to make changes'); return; } setConfirmDeactivate(item.id) }}
                      style={{ fontSize:9, background:'#F5F5F5', color:'#999', border:'none', borderRadius:4, padding:'1px 6px', cursor:'pointer', fontFamily:'inherit', opacity:0.6 }}>
                      Deactivate
                    </button>
                  )}
                  {!inactive && confirmDeactivate === item.id && (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                      <span style={{ fontSize:9, color:'#E74C3C', fontWeight:600 }}>Sure?</span>
                      <button onClick={() => handleToggleActive(item.id)}
                        style={{ fontSize:9, background:'#E74C3C', color:'#fff', border:'none', borderRadius:4, padding:'1px 6px', cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>
                        Yes
                      </button>
                      <button onClick={() => setConfirmDeactivate(null)}
                        style={{ fontSize:9, background:'#eee', color:'#666', border:'none', borderRadius:4, padding:'1px 6px', cursor:'pointer', fontFamily:'inherit' }}>
                        No
                      </button>
                    </span>
                  )}
                </div>
              </div>

              {/* Stock — tap to edit */}
              <div style={{ textAlign:'center' }}>
                {editingStock === item.id ? (
                  <input type="number" defaultValue={item.stock} autoFocus
                    onBlur={e => { handleSetStock(item.id, e.target.value); setEditingStock(null) }}
                    onKeyDown={e => { if(e.key==='Enter') { handleSetStock(item.id, e.target.value); setEditingStock(null) }}}
                    style={{ width:52, textAlign:'center', fontWeight:700, fontSize:14, padding:'3px 4px', border:'2px solid var(--caramel)', borderRadius:6, fontFamily:'inherit' }}/>
                ) : (
                  <div onClick={() => { if(!locked) setEditingStock(item.id); else showToast('Tap Unlock to make changes') }}
                    title="Tap to edit stock"
                    style={{ fontSize:16, fontWeight:700, color:'var(--dark)', cursor: locked ? 'default' : 'pointer', padding:'4px 8px', borderRadius:6, display:'inline-block',
                      border: locked ? 'none' : '1px dashed var(--caramel)', background: locked ? 'transparent' : 'rgba(200,132,58,0.05)' }}>
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
                    style={{ width:44, textAlign:'center', fontSize:13, padding:'3px 4px', border:'2px solid var(--caramel)', borderRadius:6, fontFamily:'inherit' }}/>
                ) : (
                  <div onClick={() => { if(!locked) setEditingPar(item.id); else showToast('Tap Unlock to make changes') }}
                    title="Tap to edit PAR level"
                    style={{ fontSize:13, color:'var(--text-muted)', cursor: locked ? 'default' : 'pointer', padding:'4px 6px', borderRadius:6, display:'inline-block',
                      border: locked ? 'none' : '1px dashed #ccc', background: locked ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                    {item.par}
                  </div>
                )}
              </div>

              {/* Status */}
              <div style={{ textAlign:'center' }}>
                {statusDot(s)}
              </div>

              {/* +/- buttons — bigger for touch */}
              <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                <button onClick={() => handleAdjust(item.id, -1)}
                  style={{ width:34, height:34, borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:16, fontWeight:700, color:'#E74C3C', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                  −
                </button>
                <button onClick={() => handleAdjust(item.id, 1)}
                  style={{ width:34, height:34, borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:16, fontWeight:700, color:'#27AE60', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop:8, fontSize:11, color:'var(--text-muted)', textAlign:'right' }}>
        Tap ✏ columns to edit inline · Deactivate hides items from staff views
      </div>
    </div>
  )
}
