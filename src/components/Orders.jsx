export default function Orders({ invHook, showToast }) {
  const { inventory, getStatus } = invHook

  const activeInventory = inventory.filter(i => i.active !== false)
  const karat     = activeInventory.filter(i => getStatus(i) !== 'ok' && i.vendor === 'KARAT')
  const hyperpack = activeInventory.filter(i => getStatus(i) !== 'ok' && i.vendor === 'HYPERPACK')
  const local     = activeInventory.filter(i => getStatus(i) !== 'ok' && i.vendor === 'LOCAL')
  const brand     = activeInventory.filter(i => getStatus(i) !== 'ok' && i.vendor === 'Brand')

  function copyOrder(items, title) {
    const text = `${title} — ${new Date().toLocaleDateString()}\n\n` +
      items.map(i => `• ${i.name} (${i.code}) — ${i.order_qty}`).join('\n')
    navigator.clipboard.writeText(text)
      .then(() => showToast(' Copied to clipboard!'))
      .catch(() => showToast(' Copy failed'))
  }

  if (!karat.length && !hyperpack.length && !local.length && !brand.length) {
    return (
      <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-muted)' }}>
        <div style={{ fontSize:40, marginBottom:12 }}></div>
        <div style={{ fontSize:16, fontWeight:600, color:'var(--dark)' }}>All stocked up!</div>
        <div style={{ fontSize:13, marginTop:6 }}>Nothing to order right now.</div>
      </div>
    )
  }

  function Section({ title, items, emoji }) {
    if (!items.length) return null
    return (
      <div style={{ marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--dark)' }}>
            {emoji} {title} <span style={{ fontSize:12, color:'var(--text-muted)', fontWeight:400 }}>({items.length} items)</span>
          </div>
        </div>
        <div className="card" style={{ marginBottom:8 }}>
          {items.map((item, idx) => (
            <div key={item.id} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'10px 0',
              borderBottom: idx < items.length-1 ? '1px solid var(--border)' : 'none'
            }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{item.name}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{item.code}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--caramel)' }}>{item.order_qty}</div>
                <div style={{
                  fontSize:10,
                  color: getStatus(item) === 'critical' ? 'var(--red-alert)' : 'var(--amber)'
                }}>
                  Stock: {item.stock} {item.uom}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          className="btn-primary"
          onClick={() => copyOrder(items, title)}
          style={{ fontSize:13 }}
        >
           Copy {title} Order
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16 }}>
        Items below PAR level — tap Copy to send order
      </div>
      <Section title="Karat Order"      items={karat}     emoji="" />
      <Section title="Hyperpack Order"  items={hyperpack} emoji="" />
      <Section title="Local / Grocery"  items={local}     emoji="" />
      <Section title="Brand Ice Cream"  items={brand}     emoji="" />
    </div>
  )
}
