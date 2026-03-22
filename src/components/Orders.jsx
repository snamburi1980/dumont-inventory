import { useState } from 'react'

export default function Orders({ invHook, showToast }) {
  const { inventory, getStatus } = invHook
  const [copied, setCopied] = useState(null)

  const activeInventory = inventory.filter(i => i.active !== false)
  const lowItems = activeInventory.filter(i => getStatus(i) !== 'ok')
  const categories = [...new Set(lowItems.map(i => i.cat || 'Other'))].sort()

  function copyOrder(items, title) {
    const text = `${title} — ${new Date().toLocaleDateString()}\n\n` +
      items.map(i => `• ${i.name} (${i.code || ''}) — ${i.order_qty || `1 ${i.uom || ''}`}`).join('\n')
    navigator.clipboard.writeText(text)
      .then(() => { showToast('Copied!'); setCopied(title); setTimeout(() => setCopied(null), 3000) })
      .catch(() => showToast('Copy failed'))
  }

  if (!lowItems.length) {
    return (
      <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-muted)' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>✓</div>
        <div style={{ fontSize:16, fontWeight:600, color:'var(--dark)' }}>All stocked up!</div>
        <div style={{ fontSize:13, marginTop:6 }}>Nothing to order right now.</div>
      </div>
    )
  }

  function CategoryCard({ cat }) {
    const items = lowItems.filter(i => (i.cat || 'Other') === cat)
    if (!items.length) return null
    const label = `${cat} Order`
    return (
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:12, display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--dark)' }}>{cat}</div>
          <span style={{ fontSize:11, background:'var(--cream)', color:'var(--text-muted)', borderRadius:10, padding:'2px 8px' }}>{items.length}</span>
        </div>
        <div style={{ flex:1, marginBottom:8 }}>
          {items.map((item, idx) => (
            <div key={item.id} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'6px 0',
              borderBottom: idx < items.length-1 ? '1px solid var(--border)' : 'none'
            }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--dark)' }}>{item.name}</div>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>
                  Stock: {item.stock} / PAR: {item.par}
                </div>
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--caramel)', textAlign:'right' }}>
                {item.order_qty || `1 ${item.uom || ''}`}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => copyOrder(items, label)}
          style={{
            width:'100%', padding:'8px', border:'none', borderRadius:8, cursor:'pointer',
            fontSize:12, fontWeight:600, fontFamily:'inherit',
            background: copied === label ? 'var(--green-ok)' : 'var(--dark)',
            color:'#fff'
          }}
        >
          {copied === label ? 'Copied!' : 'Copy Order'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>
        {lowItems.length} items below PAR level
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:10 }}>
        {categories.map(cat => <CategoryCard key={cat} cat={cat} />)}
      </div>
    </div>
  )
}
