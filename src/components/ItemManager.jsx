import { useState, useEffect } from 'react'
import { exportInventoryToCSV } from '../utils/exportInventory'

const CATEGORIES = [
  'Boba & Tea', 'Sugars', 'Syrups', 'Purees', 'Monin Syrups',
  'Sauces', 'Powders', 'Boba & Jelly', 'Coffee', 'Dry Stock',
  'Ice Cream', 'Bakery', 'Other'
]

const VENDORS = ['KARAT', 'HYPERPACK', 'LOCAL', 'Brand', 'Other']
const UOMS    = ['CASE', 'BAG', 'BOTTLE', 'JAR', 'TUB', 'GALLON', 'PACK', 'UNIT']

const emptyItem = {
  name:'', code:'', cat:'Boba & Tea', vendor:'KARAT',
  uom:'CASE', cost_price:0, sell_price:0, par:1,
  case_size:1, order_qty:'1 CASE', active:true
}

export default function ItemManager({ orgId, orgItemsHook, showToast }) {
  const { items, loading, loadItems, addItem, updateItem, deleteItem } = orgItemsHook

  const [view,       setView]       = useState('list') // list | add | edit
  const [editItem,   setEditItem]   = useState(null)
  const [form,       setForm]       = useState(emptyItem)
  const [filterCat,  setFilterCat]  = useState('all')
  const [search,     setSearch]     = useState('')
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    if (orgId) loadItems(orgId)
  }, [orgId])

  const filtered = items.filter(i => {
    const catMatch    = filterCat === 'all' || i.cat === filterCat
    const searchMatch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.code||'').toLowerCase().includes(search.toLowerCase())
    return catMatch && searchMatch
  })

  // Derive categories from actual items (not hardcoded list)
  const categories = ['all', ...[...new Set(items.map(i => i.cat).filter(Boolean))].sort()]

  function openAdd() {
    setForm(emptyItem)
    setView('add')
  }

  function openEdit(item) {
    setEditItem(item)
    setForm({
      name:       item.name,
      code:       item.code || '',
      cat:        item.cat || 'Boba & Tea',
      vendor:     item.vendor || 'KARAT',
      uom:        item.uom || 'CASE',
      cost_price: item.cost_price || item.cost || 0,
      sell_price: item.sell_price || 0,
      par:        item.par || 1,
      case_size:  item.case_size || 1,
      order_qty:  item.order_qty || '1',
      active:     item.active !== false,
    })
    setView('edit')
  }

  async function handleSave() {
    if (!form.name.trim()) { showToast('Name required'); return }
    setSaving(true)
    try {
      if (view === 'add') {
        await addItem(orgId, form)
        showToast(`${form.name} added`)
      } else {
        await updateItem(orgId, editItem.id, form)
        showToast(`${form.name} updated`)
      }
      setView('list')
    } catch(e) {
      showToast('Error saving')
    }
    setSaving(false)
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    await deleteItem(orgId, item.id)
    showToast(`${item.name} deleted`)
  }

  const input = {
    width:'100%', padding:'9px 10px', border:'1px solid #EDE0CC',
    borderRadius:8, fontFamily:'inherit', fontSize:13,
    marginBottom:10, boxSizing:'border-box', background:'#FDF6EC'
  }
  const label = { fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4, display:'block' }

  // ── FORM (add/edit) ──
  if (view === 'add' || view === 'edit') {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <button
            onClick={() => setView('list')}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#8B7355' }}
          >
            {'<'} Back
          </button>
          <div style={{ fontSize:15, fontWeight:700, color:'#2C1810' }}>
            {view === 'add' ? 'Add New Item' : `Edit: ${editItem?.name}`}
          </div>
        </div>

        <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:16 }}>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={label}>Item Name *</label>
              <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} style={input} placeholder="e.g. Chewy Tapioca Pearls" />
            </div>

            <div>
              <label style={label}>Item Code</label>
              <input value={form.code} onChange={e => setForm(f=>({...f,code:e.target.value}))} style={input} placeholder="e.g. A2000" />
            </div>

            <div>
              <label style={label}>Category</label>
              <select value={form.cat} onChange={e => setForm(f=>({...f,cat:e.target.value}))} style={input}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={label}>Vendor</label>
              <select value={form.vendor} onChange={e => setForm(f=>({...f,vendor:e.target.value}))} style={input}>
                {VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div>
              <label style={label}>Unit of Measure</label>
              <select value={form.uom} onChange={e => setForm(f=>({...f,uom:e.target.value}))} style={input}>
                {UOMS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div>
              <label style={label}>Cost Price ($) — what you pay</label>
              <input type="number" value={form.cost_price} onChange={e => setForm(f=>({...f,cost_price:parseFloat(e.target.value)||0}))} style={input} step="0.01" min="0" />
            </div>

            <div>
              <label style={label}>Sell Price ($) — what customer pays</label>
              <input type="number" value={form.sell_price} onChange={e => setForm(f=>({...f,sell_price:parseFloat(e.target.value)||0}))} style={input} step="0.01" min="0" />
            </div>

            <div>
              <label style={label}>PAR Level (default)</label>
              <input type="number" value={form.par} onChange={e => setForm(f=>({...f,par:parseInt(e.target.value)||1}))} style={input} min="0" />
            </div>

            <div>
              <label style={label}>Case Size (units per case)</label>
              <input type="number" value={form.case_size} onChange={e => setForm(f=>({...f,case_size:parseInt(e.target.value)||1}))} style={input} min="1" />
            </div>

            <div style={{ gridColumn:'1/-1' }}>
              <label style={label}>Order Quantity Label</label>
              <input value={form.order_qty} onChange={e => setForm(f=>({...f,order_qty:e.target.value}))} style={input} placeholder="e.g. 1 CASE" />
            </div>

            <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:8 }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setForm(f=>({...f,active:e.target.checked}))}
                style={{ width:16, height:16, cursor:'pointer' }}
              />
              <label style={{ fontSize:13, color:'#2C1810', cursor:'pointer' }}>Active</label>
            </div>
          </div>

          {/* COGS preview */}
          {form.cost_price > 0 && form.sell_price > 0 && (
            <div style={{
              marginTop:8, padding:'10px 12px',
              background:'#F0F9F0', borderRadius:8,
              display:'flex', justifyContent:'space-between', alignItems:'center'
            }}>
              <span style={{ fontSize:12, color:'#27AE60', fontWeight:600 }}>
                COGS: {((form.cost_price / form.sell_price) * 100).toFixed(1)}%
              </span>
              <span style={{ fontSize:12, color:'#27AE60' }}>
                Margin: {(((form.sell_price - form.cost_price) / form.sell_price) * 100).toFixed(1)}%
              </span>
              <span style={{ fontSize:12, color:'#27AE60' }}>
                Profit: ${(form.sell_price - form.cost_price).toFixed(2)}
              </span>
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex:1, background: saving ? '#aaa' : '#2C1810',
                color:'#fff', border:'none', borderRadius:8,
                padding:'12px', fontSize:13, fontWeight:600, cursor:'pointer'
              }}
            >
              {saving ? 'Saving...' : view === 'add' ? 'Add Item' : 'Save Changes'}
            </button>
            <button
              onClick={() => setView('list')}
              style={{ padding:'12px 20px', background:'#888', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13 }}
            >
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
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:13, color:'#8B7355' }}>
          {filtered.length} items
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button
            onClick={() => exportInventoryToCSV(items, {}, `inventory_${orgId}_${new Date().toISOString().split('T')[0]}.csv`)}
            style={{
              background:'#27AE60', color:'#fff', border:'none',
              borderRadius:8, padding:'8px 14px', cursor:'pointer',
              fontSize:12, fontWeight:600
            }}
          >
            Download Excel
          </button>
          <button
            onClick={openAdd}
            style={{
              background:'#2C1810', color:'#fff', border:'none',
              borderRadius:8, padding:'8px 14px', cursor:'pointer',
              fontSize:13, fontWeight:600
            }}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        placeholder="Search items..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ ...input, marginBottom:10 }}
      />

      {/* Category filter */}
      <div style={{ display:'flex', gap:6, overflowX:'auto', marginBottom:12, paddingBottom:4 }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            style={{
              padding:'5px 12px', borderRadius:20, border:'1px solid #EDE0CC',
              background: filterCat===cat ? '#2C1810' : '#fff',
              color: filterCat===cat ? '#fff' : '#8B7355',
              fontSize:11, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit'
            }}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {loading && <div style={{textAlign:'center',padding:24,color:'#8B7355'}}>Loading...</div>}

      {/* Items list */}
      {filtered.map(item => {
        const cogs   = item.cost_price > 0 && item.sell_price > 0
          ? ((item.cost_price / item.sell_price) * 100).toFixed(1) + '%'
          : null
        const margin = item.cost_price > 0 && item.sell_price > 0
          ? (((item.sell_price - item.cost_price) / item.sell_price) * 100).toFixed(1) + '%'
          : null

        return (
          <div key={item.id} style={{
            background:'#fff', border:'1px solid #EDE0CC',
            borderRadius:10, padding:'12px 14px', marginBottom:8,
            opacity: item.active === false ? 0.5 : 1
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'#2C1810' }}>{item.name}</span>
                  <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'#EDE0CC', color:'#8B7355' }}>
                    {item.code}
                  </span>
                  {item.active === false && (
                    <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'#f5f5f5', color:'#999' }}>
                      Inactive
                    </span>
                  )}
                </div>
                <div style={{ fontSize:11, color:'#8B7355', display:'flex', gap:12, flexWrap:'wrap' }}>
                  <span>{item.cat}</span>
                  <span>{item.vendor}</span>
                  <span>PAR: {item.par} {item.uom}</span>
                  <span style={{ color:'#E74C3C' }}>Cost: ${(item.cost_price||0).toFixed(2)}</span>
                  {item.sell_price > 0 && <span style={{ color:'#27AE60' }}>Sell: ${item.sell_price.toFixed(2)}</span>}
                  {cogs && <span style={{ color:'#C8843A', fontWeight:600 }}>COGS: {cogs}</span>}
                  {margin && <span style={{ color:'#27AE60', fontWeight:600 }}>Margin: {margin}</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:6, marginLeft:8 }}>
                <button
                  onClick={() => openEdit(item)}
                  style={{ fontSize:11, padding:'5px 10px', background:'#FDF6EC', border:'1px solid #EDE0CC', borderRadius:6, cursor:'pointer', color:'#2C1810' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  style={{ fontSize:11, padding:'5px 10px', background:'#FFF0F0', border:'1px solid #FFDDD D', borderRadius:6, cursor:'pointer', color:'#E74C3C' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:32, color:'#8B7355' }}>
          No items found
        </div>
      )}
    </div>
  )
}
