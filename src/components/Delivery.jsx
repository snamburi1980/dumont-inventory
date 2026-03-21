import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { logAudit, AUDIT_ACTIONS } from '../utils/auditLogger'

export default function Delivery({ invHook, viewingStore, showToast }) {
  const { inventory, saveInventory } = invHook
  const [deliveries, setDeliveries] = useState([])
  const [search,     setSearch]     = useState('')
  const [form,       setForm]       = useState({ itemId:'', qty:'', cost:'', note:'' })
  const [receipt,    setReceipt]    = useState(null)
  const [receiptName,setReceiptName]= useState('')
  const [parsing,    setParsing]    = useState(false)
  const [parsed,     setParsed]     = useState(null) // parsed receipt items

  useEffect(() => { loadDeliveries() }, [viewingStore])

  async function loadDeliveries() {
    try {
      const q = query(collection(db, 'stores', viewingStore, 'deliveries'), orderBy('dateTs','desc'))
      const snap = await getDocs(q)
      setDeliveries(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    } catch(e) {}
  }

  function handleReceiptUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setParsing(true)
    const reader = new FileReader()
    reader.onload = ev => {
      const data = ev.target.result
      setReceipt(data)
      setReceiptName(file.name)
      // Simple CSV parsing for receipt
      if (file.name.endsWith('.csv')) {
        const lines = data.split('\n').map(l => l.trim()).filter(Boolean)
        const items = []
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.replace(/"/g,'').trim())
          if (cols.length >= 3 && cols[0]) {
            items.push({
              name: cols[0],
              qty:  parseFloat(cols[1]) || 1,
              cost: parseFloat(cols[2]) || 0,
            })
          }
        }
        if (items.length > 0) setParsed(items)
      }
      setParsing(false)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function approveReceipt() {
    if (!parsed || !parsed.length) return
    // Match parsed items to inventory and update stock
    const updates = {}
    const matched = []
    const unmatched = []

    parsed.forEach(p => {
      const invItem = inventory.find(i =>
        i.name.toLowerCase().includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(i.name.toLowerCase())
      )
      if (invItem) {
        updates[invItem.id] = (updates[invItem.id] || 0) + p.qty
        matched.push({ ...p, invName: invItem.name, invId: invItem.id })
      } else {
        unmatched.push(p)
      }
    })

    const updatedInventory = inventory.map(item => {
      if (updates[item.id]) {
        return { ...item, stock: Math.round((item.stock + updates[item.id]) * 100) / 100 }
      }
      return item
    })

    await saveInventory(viewingStore, updatedInventory)
    invHook.loadInventory(viewingStore)

    // Log each matched item
    for (const item of matched) {
      const entry = {
        itemName: item.invName,
        qty:      item.qty,
        cost:     item.cost,
        note:     `Receipt: ${receiptName}`,
        receiptData: receipt,
        receiptName,
        dateTs:   Date.now(),
        date:     new Date().toLocaleDateString(),
      }
      await addDoc(collection(db, 'stores', viewingStore, 'deliveries'), entry)
    }

    await logAudit({ action: AUDIT_ACTIONS.DELIVERY_LOGGED, storeId: viewingStore, details: { receipt: receiptName, matched: matched.length } })
    await loadDeliveries()

    showToast(`Receipt applied: ${matched.length} items updated`)
    if (unmatched.length > 0) showToast(`${unmatched.length} items not matched`)

    setReceipt(null)
    setReceiptName('')
    setParsed(null)
  }

  async function logDelivery() {
    const item = inventory.find(i => i.id === parseInt(form.itemId))
    if (!item || !form.qty) { showToast('Select item and quantity'); return }
    const qty  = parseFloat(form.qty)
    const cost = parseFloat(form.cost) || 0
    const updated = inventory.map(i => i.id === item.id ? { ...i, stock: Math.round((i.stock + qty)*100)/100 } : i)
    await saveInventory(viewingStore, updated)
    invHook.loadInventory(viewingStore)
    const entry = {
      itemName: item.name,
      qty, cost,
      note:    form.note,
      dateTs:  Date.now(),
      date:    new Date().toLocaleDateString(),
    }
    await addDoc(collection(db, 'stores', viewingStore, 'deliveries'), entry)
    await logAudit({ action: AUDIT_ACTIONS.DELIVERY_LOGGED, storeId: viewingStore, details: { itemName: item.name, qty, cost } })
    setDeliveries(prev => [entry, ...prev])
    setForm({ itemId:'', qty:'', cost:'', note:'' })
    showToast(`+${qty} ${item.uom} ${item.name} logged`)
  }

  const filtered = deliveries.filter(d => !search || d.itemName?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      {/* Receipt upload */}
      <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700,color:'var(--dark)',marginBottom:10}}>Upload Delivery Receipt</div>
        <label style={{display:'block',border:'2px dashed var(--border)',borderRadius:10,padding:'16px',textAlign:'center',cursor:'pointer',marginBottom:10}}>
          <div style={{fontSize:13,color:'var(--text-muted)'}}>
            {parsing ? 'Reading receipt...' : receiptName || 'Tap to upload receipt (CSV or image)'}
          </div>
          <div style={{fontSize:11,color:'#aaa',marginTop:4}}>Supported: .csv, .jpg, .png, .pdf</div>
          <input type="file" accept=".csv,.jpg,.jpeg,.png,.pdf" onChange={handleReceiptUpload} style={{display:'none'}}/>
        </label>

        {parsed && parsed.length > 0 && (
          <div>
            <div style={{fontSize:12,fontWeight:600,color:'var(--dark)',marginBottom:8}}>
              {parsed.length} items found in receipt:
            </div>
            {parsed.map((p,i) => {
              const invItem = inventory.find(inv => inv.name.toLowerCase().includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(inv.name.toLowerCase()))
              return (
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 8px',borderRadius:6,marginBottom:4,background:invItem?'#E8F5E9':'#FFF3E0'}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600}}>{p.name}</div>
                    {invItem && <div style={{fontSize:10,color:'var(--green-ok)'}}>Matches: {invItem.name}</div>}
                    {!invItem && <div style={{fontSize:10,color:'var(--amber)'}}>No match found</div>}
                  </div>
                  <div style={{textAlign:'right',fontSize:12}}>
                    <div style={{fontWeight:600}}>{p.qty} units</div>
                    {p.cost > 0 && <div style={{color:'var(--text-muted)'}}>${p.cost}</div>}
                  </div>
                </div>
              )
            })}
            <div style={{display:'flex',gap:8,marginTop:10}}>
              <button onClick={approveReceipt} style={{flex:1,background:'var(--green-ok)',color:'#fff',border:'none',borderRadius:8,padding:'11px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                Approve and Update Inventory
              </button>
              <button onClick={() => { setReceipt(null); setReceiptName(''); setParsed(null) }}
                style={{padding:'11px 16px',background:'#888',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontSize:13}}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual entry */}
      <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:'var(--dark)',marginBottom:10}}>Manual Entry</div>
        <select value={form.itemId} onChange={e => setForm(f=>({...f,itemId:e.target.value}))} style={{marginBottom:8,width:'100%',padding:'8px 10px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit',fontSize:13,background:'#FDF6EC'}}>
          <option value="">Select item</option>
          {inventory.filter(i => i.active !== false).map(i => (
            <option key={i.id} value={i.id}>{i.name} ({i.uom})</option>
          ))}
        </select>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
          <input type="number" placeholder="Quantity received" value={form.qty} onChange={e => setForm(f=>({...f,qty:e.target.value}))} style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit',fontSize:13,background:'#FDF6EC'}}/>
          <input type="number" placeholder="Unit cost $" value={form.cost} onChange={e => setForm(f=>({...f,cost:e.target.value}))} style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit',fontSize:13,background:'#FDF6EC'}}/>
        </div>
        <input type="text" placeholder="Note (optional)" value={form.note} onChange={e => setForm(f=>({...f,note:e.target.value}))} style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit',fontSize:13,marginBottom:12,background:'#FDF6EC'}}/>
        <button className="btn-primary" onClick={logDelivery}>+ Log Delivery</button>
      </div>

      {/* History */}
      <div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--dark)'}}>Delivery Log</div>
          <input className="search-bar" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{flex:1}}/>
        </div>
        {filtered.length === 0 ? (
          <div style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>No deliveries logged yet</div>
        ) : filtered.map((d,idx) => (
          <div key={d.id||idx} style={{background:'#fff',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px',marginBottom:8}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:'var(--dark)'}}>{d.itemName}</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>{d.date}{d.note?` · ${d.note}`:''}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:14,fontWeight:700,color:'var(--green-ok)'}}>+{d.qty}</div>
                {d.cost > 0 && <div style={{fontSize:11,color:'var(--text-muted)'}}>${d.cost}/unit</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
