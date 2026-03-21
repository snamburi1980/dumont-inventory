import { useState, useEffect } from 'react'

export default function Pricing({ orgItemsHook, viewingStore, viewingOrg, showToast }) {
  const { items, loadItems, loadSellPrices, saveSellPrice } = orgItemsHook
  const [sellPrices, setSellPrices] = useState({})
  const [filterCat,  setFilterCat]  = useState('all')
  const [search,     setSearch]     = useState('')
  const [saving,     setSaving]     = useState({})
  const [edited,     setEdited]     = useState({})

  useEffect(() => {
    if (viewingOrg) loadItems(viewingOrg)
    if (viewingStore) loadPrices()
  }, [viewingOrg, viewingStore])

  async function loadPrices() {
    const prices = await loadSellPrices(viewingStore)
    setSellPrices(prices)
  }

  async function handlePriceChange(itemId, value) {
    setEdited(prev => ({ ...prev, [itemId]: parseFloat(value) || 0 }))
  }

  async function savePrice(itemId) {
    const price = edited[itemId]
    if (price === undefined) return
    setSaving(prev => ({ ...prev, [itemId]: true }))
    await saveSellPrice(viewingStore, itemId, price)
    setSellPrices(prev => ({ ...prev, [itemId]: price }))
    setEdited(prev => { const n = {...prev}; delete n[itemId]; return n })
    setSaving(prev => ({ ...prev, [itemId]: false }))
    showToast('Price saved')
  }

  const categories = ['all', ...[...new Set(items.map(i => i.cat))].sort()]
  const filtered = items.filter(i => {
    const catMatch    = filterCat === 'all' || i.cat === filterCat
    const searchMatch = !search || i.name.toLowerCase().includes(search.toLowerCase())
    return catMatch && searchMatch && i.active !== false
  })

  const input = {
    padding:'7px 10px', border:'1px solid #EDE0CC', borderRadius:8,
    fontFamily:'inherit', fontSize:13, background:'#FDF6EC',
    width:90, textAlign:'right'
  }

  return (
    <div>
      <div style={{ fontSize:13, color:'#8B7355', marginBottom:12 }}>
        Set sell prices for each item at this store. Cost prices are set at the org level.
      </div>

      <input
        placeholder="Search items..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width:'100%', padding:'9px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, marginBottom:10, boxSizing:'border-box', background:'#FDF6EC' }}
      />

      <div style={{ display:'flex', gap:6, overflowX:'auto', marginBottom:12, paddingBottom:4 }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)} style={{
            padding:'5px 12px', borderRadius:20, border:'1px solid #EDE0CC',
            background: filterCat===cat ? '#2C1810' : '#fff',
            color: filterCat===cat ? '#fff' : '#8B7355',
            fontSize:11, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit'
          }}>
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Header */}
      <div style={{
        display:'grid', gridTemplateColumns:'1fr 90px 90px 80px 60px',
        padding:'8px 12px', background:'#2C1810', borderRadius:'10px 10px 0 0',
        fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)',
        textTransform:'uppercase', gap:8
      }}>
        <div>Item</div>
        <div style={{textAlign:'right'}}>Cost</div>
        <div style={{textAlign:'right'}}>Sell Price</div>
        <div style={{textAlign:'right'}}>COGS%</div>
        <div></div>
      </div>

      <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:'0 0 10px 10px', overflow:'hidden' }}>
        {filtered.map((item, idx) => {
          const sellPrice  = edited[item.id] !== undefined ? edited[item.id] : (sellPrices[item.id] || item.sell_price || 0)
          const costPrice  = item.cost_price || 0
          const cogs       = sellPrice > 0 && costPrice > 0 ? (costPrice / sellPrice * 100) : null
          const isEdited   = edited[item.id] !== undefined
          const isSaving   = saving[item.id]

          return (
            <div key={item.id} style={{
              display:'grid', gridTemplateColumns:'1fr 90px 90px 80px 60px',
              padding:'10px 12px', gap:8, alignItems:'center',
              borderBottom: idx < filtered.length-1 ? '1px solid #EDE0CC' : 'none',
              background: idx % 2 === 0 ? '#fff' : '#FAFAFA',
            }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#2C1810' }}>{item.name}</div>
                <div style={{ fontSize:10, color:'#8B7355' }}>{item.code} · {item.cat}</div>
              </div>
              <div style={{ textAlign:'right', fontSize:12, color:'#E74C3C', fontWeight:600 }}>
                ${costPrice.toFixed(2)}
              </div>
              <div style={{ textAlign:'right' }}>
                <input
                  type="number"
                  value={sellPrice || ''}
                  onChange={e => handlePriceChange(item.id, e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && savePrice(item.id)}
                  style={{ ...input, borderColor: isEdited ? '#C8843A' : '#EDE0CC' }}
                  step="0.01" min="0"
                  placeholder="0.00"
                />
              </div>
              <div style={{ textAlign:'right' }}>
                {cogs !== null ? (
                  <span style={{
                    fontSize:12, fontWeight:700,
                    color: cogs < 25 ? '#27AE60' : cogs < 32 ? '#C8843A' : '#E74C3C'
                  }}>
                    {cogs.toFixed(1)}%
                  </span>
                ) : <span style={{ fontSize:11, color:'#ccc' }}>--</span>}
              </div>
              <div>
                {isEdited && (
                  <button
                    onClick={() => savePrice(item.id)}
                    disabled={isSaving}
                    style={{
                      fontSize:11, padding:'4px 8px',
                      background: isSaving ? '#aaa' : '#27AE60',
                      color:'#fff', border:'none', borderRadius:6,
                      cursor:'pointer', fontFamily:'inherit'
                    }}
                  >
                    {isSaving ? '...' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:32, color:'#8B7355' }}>No items found</div>
      )}
    </div>
  )
}
