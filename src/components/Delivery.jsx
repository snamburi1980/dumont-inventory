import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'

export default function Delivery({ invHook, viewingStore, showToast }) {
  const { inventory, adjustStock, saveInventory } = invHook
  const [deliveries, setDeliveries] = useState([])
  const [search,     setSearch]     = useState('')
  const [form,       setForm]       = useState({ itemId:'', qty:'', cost:'', note:'' })

  useEffect(() => { loadDeliveries() }, [viewingStore])

  async function loadDeliveries() {
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'deliveries'),
        orderBy('dateTs', 'desc')
      )
      const snap = await getDocs(q)
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {}
  }

  async function logDelivery() {
    const item = inventory.find(i => i.id === parseInt(form.itemId))
    if (!item || !form.qty) { showToast(' Select item and quantity'); return }

    const qty  = parseFloat(form.qty)
    const cost = parseFloat(form.cost) || 0

    // Update stock
    const updated = inventory.map(i =>
      i.id === item.id ? { ...i, stock: Math.round((i.stock + qty) * 100) / 100 } : i
    )
    await saveInventory(viewingStore, updated)
    invHook.loadInventory(viewingStore)

    // Log delivery
    const entry = {
      itemId:   item.id,
      itemName: item.name,
      qty, cost,
      note:     form.note,
      dateTs:   Date.now(),
      date:     new Date().toLocaleDateString(),
    }
    await addDoc(collection(db, 'stores', viewingStore, 'deliveries'), entry)
    setDeliveries(prev => [entry, ...prev])
    setForm({ itemId:'', qty:'', cost:'', note:'' })
    showToast(` +${qty} ${item.uom} ${item.name} logged`)
  }

  const filtered = deliveries.filter(d =>
    !search || d.itemName?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Manual entry form */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="section-title">Log Delivery</div>

        <select
          value={form.itemId}
          onChange={e => setForm(f => ({...f, itemId: e.target.value}))}
          style={{ marginBottom:8 }}
        >
          <option value="">— Select item —</option>
          {inventory.filter(i => i.active !== false).map(i => (
            <option key={i.id} value={i.id}>{i.name} ({i.uom})</option>
          ))}
        </select>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
          <input
            type="number"
            placeholder="Quantity received"
            value={form.qty}
            onChange={e => setForm(f => ({...f, qty: e.target.value}))}
          />
          <input
            type="number"
            placeholder="Unit cost $"
            value={form.cost}
            onChange={e => setForm(f => ({...f, cost: e.target.value}))}
          />
        </div>
        <input
          type="text"
          placeholder="Note (optional)"
          value={form.note}
          onChange={e => setForm(f => ({...f, note: e.target.value}))}
          style={{ marginBottom:12 }}
        />
        <button className="btn-primary" onClick={logDelivery}>
          + Log Delivery
        </button>
      </div>

      {/* Delivery history */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <div className="section-title" style={{ margin:0 }}>Delivery Log</div>
          <input
            className="search-bar"
            placeholder="🔍 Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex:1 }}
          />
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
            No deliveries logged yet
          </div>
        ) : (
          filtered.map((d, idx) => (
            <div key={d.id || idx} className="card" style={{ marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{d.itemName}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{d.date} {d.note ? `· ${d.note}` : ''}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--green-ok)' }}>+{d.qty}</div>
                  {d.cost > 0 && <div style={{ fontSize:11, color:'var(--text-muted)' }}>${d.cost}/unit</div>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
