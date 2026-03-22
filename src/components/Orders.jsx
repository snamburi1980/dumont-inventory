import { useState } from 'react'

export default function Orders({ invHook, showToast }) {
  const { inventory, getStatus } = invHook
  const [copied, setCopied] = useState(null)

  const activeInventory = inventory.filter(i => i.active !== false)
  const lowItems = activeInventory.filter(i => getStatus(i) !== 'ok')

  // Group by vendor dynamically
  const vendors = [...new Set(lowItems.map(i => i.vendor || 'Other'))].sort()

  function copyOrder(items, title) {
    const text = `${title} — ${new Date().toLocaleDateString()}\n\n` +
      items.map(i => `• ${i.name} (${i.code || ''}) — ${i.order_qty || i.uom}`).join('\n')
    navigator.clipboard.writeText(text)
      .then(() => { showToast('Copied to clipboard!'); setCopied(title) })
      .catch(() => showToast('Copy failed'))
  }

  if (!lowItems.length) {
    return (
      <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-muted)' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>OK</div>
        <div style={{ fontSize:16, fontWeight:600, color:'var(--dark)' }}>All stocked up!</div>
        <div style={{ fontSize:13, marginTop:6 }}>Nothing to order right now.</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16 }}>
        {lowItems.length} items below PAR level — tap Copy to send order
      </div>

      {vendors.map(vendor => {
        const items = lowItems.filter(i => (i.vendor || 'Other') === vendor)
        if (!items.length) return null
        return (
          <div key={vendor} style={{ marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--dark)' }}>
                {vendor} <span style={{ fontSize:12, color:'var(--text-muted)', fontWeight:400 }}>({items.length} items)</span>
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
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                      {item.code} {item.cat ? `· ${item.cat}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--caramel)' }}>{item.order_qty || `1 ${item.uom}`}</div>
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
              onClick={() => copyOrder(items, `${vendor} Order`)}
              style={{ fontSize:13, background: copied === `${vendor} Order` ? 'var(--green-ok)' : 'var(--dark)' }}
            >
              {copied === `${vendor} Order` ? 'Copied!' : `Copy ${vendor} Order`}
            </button>
          </div>
        )
      })}
    </div>
  )
}
