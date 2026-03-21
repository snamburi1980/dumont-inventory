import { useState, useRef } from 'react'

const UNIT_TYPES = ['CASE', 'BAG', 'BOTTLE', 'JAR', 'TUB', 'GALLON', 'PACK', 'UNIT', 'BOX', 'PIECE']

const emptyItem = { name:'', code:'', cat:'', vendor:'', uom:'CASE', cost:0, par:1, order_qty:'1 CASE', active:true, stock:0 }

export default function Inventory({ invHook, viewingStore, showToast, orgItemsHook, viewingOrg }) {
  const { inventory, getStatus, adjustStock, setStock, toggleActive, setPar, saveInventory } = invHook
  const [activeCategory,  setActiveCategory]  = useState('all')
  const [search,          setSearch]          = useState('')
  const [showInactive,    setShowInactive]     = useState(false)
  const [editingPar,      setEditingPar]       = useState(null)
  const [view,            setView]             = useState('list') // list | addItem | addCat
  const [newItem,         setNewItem]          = useState(emptyItem)
  const [newCat,          setNewCat]           = useState('')
  const saveTimer = useRef(null)

  const categories = ['all', ...[...new Set(inventory.map(i => i.cat))].filter(Boolean).sort()]

  const filtered = inventory.filter(i => {
    const catMatch    = activeCategory === 'all' || i.cat === activeCategory
    const searchMatch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.code||'').toLowerCase().includes(search.toLowerCase())
    const activeMatch = showInactive || i.active !== false
    return catMatch && searchMatch && activeMatch
  })

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

  async function handleAddItem() {
    if (!newItem.name.trim()) { showToast('Item name required'); return }
    const cat = newItem.cat || activeCategory !== 'all' ? (newItem.cat || activeCategory) : 'General'
    const item = {
      ...newItem,
      id:    Date.now(),
      cat,
      stock: 0,
      active: true,
    }
    const updated = [...inventory, item]
    await saveInventory(viewingStore, updated)
    invHook.loadInventory(viewingStore)
    showToast(`${item.name} added`)
    setNewItem(emptyItem)
    setView('list')
  }

  async function handleAddCategory() {
    if (!newCat.trim()) { showToast('Category name required'); return }
    // Category is just a property on items - no separate creation needed
    // Add a placeholder so the category appears in filters
    showToast(`Category "${newCat}" ready - now add items to it`)
    setActiveCategory(newCat)
    setNewItem(prev => ({...prev, cat: newCat}))
    setNewCat('')
    setView('addItem')
  }

  function statusPill(status) {
    if (status === 'critical') return <span className="pill pill-critical">Critical</span>
    if (status === 'low')      return <span className="pill pill-low">Low</span>
    return <span className="pill pill-ok">OK</span>
  }

  const input = { width:'100%', padding:'9px 10px', border:'1px solid var(--border)', borderRadius:8, fontFamily:'inherit', fontSize:13, marginBottom:8, boxSizing:'border-box', background:'#FDF6EC' }
  const label = { fontSize:11, fontWeight:600, color:'var(--text-muted)', marginBottom:4, display:'block' }

  // ── ADD ITEM FORM ──
  if (view === 'addItem') {
    return (
      <div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <button onClick={() => setView('list')} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--text-muted)'}}>
            {'<'} Back
          </button>
          <div style={{fontSize:15,fontWeight:700,color:'var(--dark)'}}>Add New Item</div>
        </div>
        <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:12,padding:16}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div style={{gridColumn:'1/-1'}}>
              <label style={label}>Item Name *</label>
              <input value={newItem.name} onChange={e => setNewItem(f=>({...f,name:e.target.value}))} style={input} placeholder="e.g. Chewy Tapioca Pearls"/>
            </div>
            <div>
              <label style={label}>Code</label>
              <input value={newItem.code} onChange={e => setNewItem(f=>({...f,code:e.target.value}))} style={input} placeholder="e.g. A2000"/>
            </div>
            <div>
              <label style={label}>Category</label>
              <select value={newItem.cat} onChange={e => setNewItem(f=>({...f,cat:e.target.value}))} style={input}>
                <option value="">Select category</option>
                {[...new Set(inventory.map(i=>i.cat))].filter(Boolean).sort().map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__new">+ New category...</option>
              </select>
              {newItem.cat === '__new' && (
                <input placeholder="New category name" onBlur={e => setNewItem(f=>({...f,cat:e.target.value}))} style={{...input,marginTop:4}}/>
              )}
            </div>
            <div>
              <label style={label}>Vendor</label>
              <input value={newItem.vendor} onChange={e => setNewItem(f=>({...f,vendor:e.target.value}))} style={input} placeholder="e.g. KARAT"/>
            </div>
            <div>
              <label style={label}>Unit Type</label>
              <select value={newItem.uom} onChange={e => setNewItem(f=>({...f,uom:e.target.value}))} style={input}>
                {UNIT_TYPES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>PAR Level</label>
              <input type="number" value={newItem.par} onChange={e => setNewItem(f=>({...f,par:parseInt(e.target.value)||0}))} style={input} min="0"/>
            </div>
            <div>
              <label style={label}>Cost Price ($)</label>
              <input type="number" value={newItem.cost} onChange={e => setNewItem(f=>({...f,cost:parseFloat(e.target.value)||0}))} style={input} step="0.01" min="0"/>
            </div>
            <div>
              <label style={label}>Order Qty Label</label>
              <input value={newItem.order_qty} onChange={e => setNewItem(f=>({...f,order_qty:e.target.value}))} style={input} placeholder="e.g. 1 CASE"/>
            </div>
            <div>
              <label style={label}>Opening Stock</label>
              <input type="number" value={newItem.stock} onChange={e => setNewItem(f=>({...f,stock:parseFloat(e.target.value)||0}))} style={input} min="0"/>
            </div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button onClick={handleAddItem} style={{flex:1,background:'var(--dark)',color:'#fff',border:'none',borderRadius:8,padding:'12px',cursor:'pointer',fontSize:13,fontWeight:600}}>
              Add Item
            </button>
            <button onClick={() => setView('list')} style={{padding:'12px 20px',background:'#888',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontSize:13}}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── ADD CATEGORY FORM ──
  if (view === 'addCat') {
    return (
      <div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <button onClick={() => setView('list')} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--text-muted)'}}>
            {'<'} Back
          </button>
          <div style={{fontSize:15,fontWeight:700,color:'var(--dark)'}}>Add New Category</div>
        </div>
        <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:12,padding:16}}>
          <label style={label}>Category Name *</label>
          <input value={newCat} onChange={e => setNewCat(e.target.value)} style={input} placeholder="e.g. Bakery, Frozen, Beverages"/>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button onClick={handleAddCategory} style={{flex:1,background:'var(--dark)',color:'#fff',border:'none',borderRadius:8,padding:'12px',cursor:'pointer',fontSize:13,fontWeight:600}}>
              Create Category
            </button>
            <button onClick={() => setView('list')} style={{padding:'12px 20px',background:'#888',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontSize:13}}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── LIST VIEW ──
  return (
    <div>
      {/* Search + actions */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        <input
          className="search-bar"
          placeholder="Search items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{flex:1,minWidth:160,marginBottom:0}}
        />
        <button onClick={() => setView('addItem')} style={{background:'var(--dark)',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>
          + Item
        </button>
        <button onClick={() => setView('addCat')} style={{background:'var(--caramel)',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>
          + Category
        </button>
      </div>

      {/* Category filter */}
      <div className="filter-bar" style={{marginBottom:12}}>
        {categories.map(cat => (
          <button key={cat} className={`cat-btn ${activeCategory===cat?'active':''}`} onClick={() => setActiveCategory(cat)}>
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Ice Cream banner */}
      {activeCategory === 'Ice Cream' && (
        <div>
          <div style={{background:'var(--dark)',borderRadius:12,padding:'12px 16px',marginBottom:10,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,textAlign:'center'}}>
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
              {iceCreamItems.length} active{inactiveIceCream.length>0?` · ${inactiveIceCream.length} inactive`:''}
            </div>
            {inactiveIceCream.length > 0 && (
              <button onClick={() => setShowInactive(!showInactive)} style={{fontSize:11,padding:'4px 10px',border:'1px solid var(--border)',borderRadius:6,background:'none',cursor:'pointer',color:'var(--text-muted)'}}>
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
          const pct     = Math.min(100, ((item.stock||0) / ((item.par||1) * 2)) * 100)
          const barCls  = s === 'ok' ? 'fill-green' : s === 'low' ? 'fill-amber' : 'fill-red'
          const inactive = item.active === false

          return (
            <div key={item.id} className="item-card" style={{opacity:inactive?0.5:1}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <span style={{fontSize:14,fontWeight:600,color:'var(--dark)'}}>{item.name}</span>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  {inactive && <span style={{fontSize:10,background:'#8B7355',color:'#fff',padding:'2px 6px',borderRadius:10}}>Inactive</span>}
                  {!inactive && statusPill(s)}
                </div>
              </div>

              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <div className="stock-bar">
                  <div className={`stock-bar-fill ${barCls}`} style={{width:`${pct}%`}}/>
                </div>
                <span className="vendor-tag">{item.vendor}</span>
              </div>

              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <button className="btn-adj" onClick={() => handleAdjust(item.id,-1)}>-</button>
                  <input
                    type="number"
                    value={item.stock}
                    onChange={e => handleSetStock(item.id, e.target.value)}
                    style={{width:52,textAlign:'center',fontWeight:700,fontSize:16,padding:'4px 6px',border:'1px solid var(--border)',borderRadius:8,background:'var(--cream)'}}
                  />
                  <button className="btn-adj" onClick={() => handleAdjust(item.id,1)}>+</button>
                </div>
                <div style={{textAlign:'right'}}>
                  {editingPar === item.id ? (
                    <input
                      type="number"
                      defaultValue={item.par}
                      autoFocus
                      onBlur={e => handleSetPar(item.id, e.target.value)}
                      onKeyDown={e => e.key==='Enter' && handleSetPar(item.id, e.target.value)}
                      style={{width:60,padding:'2px 6px',fontSize:11,textAlign:'center'}}
                    />
                  ) : (
                    <div style={{fontSize:11,color:'var(--text-muted)',cursor:'pointer'}} onClick={() => setEditingPar(item.id)} title="Tap to edit PAR">
                      Par: {item.par} {item.uom}
                    </div>
                  )}
                  <div style={{fontSize:10,color:'#aaa'}}>{item.code}</div>
                  <button
                    onClick={() => handleToggleActive(item.id)}
                    style={{fontSize:10,color:inactive?'var(--green-ok)':'var(--red-alert)',background:'none',border:'none',cursor:'pointer',padding:0,marginTop:2}}
                  >
                    {inactive ? 'Activate' : 'Set Inactive'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>
          No items found
        </div>
      )}
    </div>
  )
}
