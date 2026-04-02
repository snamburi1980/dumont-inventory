import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, orderBy, query, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import { logAudit, AUDIT_ACTIONS } from '../utils/auditLogger'
import { sendDeliveryNotification } from '../utils/emailNotify'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

// Use legacy build for better browser compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString()

// Fuzzy match invoice line to inventory item
function matchToInventory(description, inventory) {
  if (!description || !inventory?.length) return null
  const words = description.toLowerCase().split(/\W+/).filter(w => w.length > 2)
  let best = null, bestScore = 0
  for (const item of inventory) {
    const name = (item.name || '').toLowerCase()
    const hits = words.filter(w => name.includes(w)).length
    const score = hits / Math.max(words.length, 1)
    if (score > bestScore) { bestScore = score; best = item }
  }
  return bestScore >= 0.3 ? best : null
}

// Extract text from PDF using pdfjs-dist
async function extractPDFText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const uint8Array  = new Uint8Array(arrayBuffer)
  const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    fullText += pageText + '\n'
  }
  return fullText
}

// Parse extracted text into invoice data
function parseInvoiceText(text) {
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)
  
  // Extract vendor name (usually in first few lines)
  const vendorName = lines[0] || 'Unknown Vendor'
  
  // Extract invoice number
  const invMatch = text.match(/invoice\s*#?\s*:?\s*([A-Z0-9\-]+)/i)
  const invoiceNumber = invMatch ? invMatch[1] : ''
  
  // Extract date
  const dateMatch = text.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i)
  const invoiceDate = dateMatch ? dateMatch[1] : new Date().toLocaleDateString()
  
  // Extract total
  const totalMatch = text.match(/total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i)
  const totalAmount = totalMatch ? parseFloat(totalMatch[1].replace(',','')) : 0
  
  // Extract line items - look for patterns with numbers (qty and price)
  const lineItems = []
  const numPattern = /(\d+\.?\d*)/g
  
  lines.forEach(line => {
    // Skip header lines
    if (/^(invoice|date|bill|ship|from|to|phone|email|address|total|subtotal|tax|page|qty|quantity|description|item|price|amount|unit)/i.test(line)) return
    if (line.length < 4) return
    
    const numbers = line.match(numPattern)
    if (!numbers || numbers.length < 1) return
    
    // Find where numbers start
    const firstNumIdx = line.search(/\d/)
    if (firstNumIdx < 3) return
    
    const description = line.substring(0, firstNumIdx)
      .replace(/[^\w\s\-&\/]/g, '')
      .trim()
    
    if (description.length < 3) return
    
    const qty       = parseFloat(numbers[0]) || 1
    const unitPrice = numbers.length > 1 ? parseFloat(numbers[numbers.length - 2]) || 0 : 0
    const amount    = numbers.length > 0  ? parseFloat(numbers[numbers.length - 1]) || 0 : 0
    
    lineItems.push({ description, qty, unitPrice, amount })
  })
  
  return { vendorName, invoiceNumber, invoiceDate, totalAmount, lineItems }
}

export default function Delivery({ invHook, viewingStore, showToast }) {
  const { inventory, saveInventory, loadInventory } = invHook

  const [deliveries,    setDeliveries]    = useState([])
  const [search,        setSearch]        = useState('')
  const [form,          setForm]          = useState({ itemId:'', qty:'', cost:'', note:'' })
  const [parsing,       setParsing]       = useState(false)
  const [parsedInvoice, setParsedInvoice] = useState(null)
  const [approving,     setApproving]     = useState(false)
  const [tab,           setTab]           = useState('upload')

  useEffect(() => { loadDeliveries() }, [viewingStore])

  async function loadDeliveries() {
    if (!viewingStore) return
    try {
      const q = query(
        collection(db, 'stores', viewingStore, 'deliveries'),
        orderBy('dateTs', 'desc'),
        limit(100)
      )
      const snap = await getDocs(q)
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { console.error('loadDeliveries:', e) }
  }

  async function handlePDFUpload(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Please upload a PDF file')
      return
    }
    setParsing(true)
    setParsedInvoice(null)
    try {
      console.log('Extracting text from PDF...')
      const text   = await extractPDFText(file)
      console.log('Extracted text:', text.substring(0, 500))
      const parsed = parseInvoiceText(text)
      console.log('Parsed invoice:', parsed)
      setParsedInvoice(parsed)
      if (parsed.lineItems.length === 0) {
        showToast('Could not find line items — check console or use manual entry')
      } else {
        showToast(`Found ${parsed.lineItems.length} items in invoice`)
      }
    } catch(err) {
      console.error('PDF parse error:', err)
      showToast('Error reading PDF: ' + err.message)
    }
    setParsing(false)
  }

  async function approveInvoice() {
    if (!parsedInvoice) return
    setApproving(true)

    const matched   = []
    const unmatched = []

    for (const li of parsedInvoice.lineItems) {
      const item = matchToInventory(li.description, inventory)
      if (item) matched.push({ li, item })
      else unmatched.push(li.description)
    }

    if (matched.length === 0) {
      showToast('No items matched your inventory — check item names')
      setApproving(false)
      return
    }

    // Update inventory stock
    const updates = {}
    matched.forEach(({ li, item }) => {
      updates[item.id] = (updates[item.id] || 0) + Number(li.qty)
    })

    const updatedInventory = inventory.map(inv => {
      if (updates[inv.id]) {
        return { ...inv, stock: Math.round((inv.stock + updates[inv.id]) * 100) / 100 }
      }
      return inv
    })

    await saveInventory(viewingStore, updatedInventory)
    loadInventory(viewingStore)

    // Log each matched item
    for (const { li, item } of matched) {
      await addDoc(collection(db, 'stores', viewingStore, 'deliveries'), {
        itemName:      item.name,
        qty:           Number(li.qty),
        cost:          li.unitPrice || 0,
        totalCost:     li.amount || 0,
        vendor:        parsedInvoice.vendorName,
        invoiceNumber: parsedInvoice.invoiceNumber,
        note:          `Invoice: ${parsedInvoice.invoiceNumber} · ${parsedInvoice.vendorName}`,
        dateTs:        Date.now(),
        date:          new Date().toLocaleDateString(),
      })
    }

    await logAudit({
      action:  AUDIT_ACTIONS.DELIVERY_LOGGED,
      storeId: viewingStore,
      details: {
        invoiceNumber: parsedInvoice.invoiceNumber,
        vendor:        parsedInvoice.vendorName,
        total:         parsedInvoice.totalAmount,
        matched:       matched.length,
        skipped:       unmatched.length,
      },
    })

    await loadDeliveries()
    // Send email notification
    sendDeliveryNotification({
      storeName: viewingStore,
      storeEmail: 'txccpointwest@gmail.com',
      vendor:    parsedInvoice.vendorName || 'Unknown',
      itemCount: matched.length,
      totalCost: parsedInvoice.totalAmount || 0,
      date:      new Date().toLocaleDateString(),
    })
    showToast(`✅ ${matched.length} item${matched.length !== 1 ? 's' : ''} added to inventory`)
    if (unmatched.length > 0) showToast(`${unmatched.length} items not matched — skipped`)

    setParsedInvoice(null)
    setApproving(false)
    setTab('log')
  }

  async function logDelivery() {
    const item = inventory.find(i => String(i.id) === String(form.itemId))
    if (!item || !form.qty) { showToast('Select item and quantity'); return }
    const qty  = parseFloat(form.qty)
    const cost = parseFloat(form.cost) || 0
    const updated = inventory.map(i =>
      String(i.id) === String(item.id)
        ? { ...i, stock: Math.round((i.stock + qty) * 100) / 100 }
        : i
    )
    await saveInventory(viewingStore, updated)
    loadInventory(viewingStore)
    const entry = {
      itemName:  item.name,
      qty, cost,
      totalCost: cost * qty,
      vendor:    'Manual',
      note:      form.note,
      dateTs:    Date.now(),
      date:      new Date().toLocaleDateString(),
    }
    await addDoc(collection(db, 'stores', viewingStore, 'deliveries'), entry)
    await logAudit({ action: AUDIT_ACTIONS.DELIVERY_LOGGED, storeId: viewingStore, details: { itemName: item.name, qty, cost } })
    setDeliveries(prev => [entry, ...prev])
    setForm({ itemId:'', qty:'', cost:'', note:'' })
    showToast(`+${qty} ${item.uom || ''} ${item.name} logged`)
    setTab('log')
  }

  const filtered = deliveries.filter(d =>
    !search || d.itemName?.toLowerCase().includes(search.toLowerCase()) ||
    d.vendor?.toLowerCase().includes(search.toLowerCase())
  )

  const now = new Date()
  const monthSpend = deliveries
    .filter(d => {
      const dt = new Date(d.dateTs)
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear()
    })
    .reduce((sum, d) => sum + (d.totalCost || (d.cost || 0) * (d.qty || 0)), 0)

  const inp = { width:'100%', padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8, fontFamily:'inherit', fontSize:13, background:'#FDF6EC', boxSizing:'border-box', marginBottom:8 }

  return (
    <div>
      {/* Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
        {[
          { id:'upload', label:'Upload Invoice' },
          { id:'manual', label:'Manual Entry'   },
          { id:'log',    label:`Log (${deliveries.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'7px 14px', borderRadius:20, border:'1px solid var(--border)',
            background: tab===t.id ? 'var(--dark)' : '#fff',
            color: tab===t.id ? '#fff' : 'var(--text-muted)',
            fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit'
          }}>{t.label}</button>
        ))}
      </div>

      {/* UPLOAD TAB */}
      {tab === 'upload' && (
        <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--dark)', marginBottom:6 }}>Upload Vendor Invoice</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:12 }}>
            Upload PDF invoice — items will be matched to your inventory automatically
          </div>

          {!parsedInvoice && (
            <label style={{ display:'block', border:'2px dashed var(--border)', borderRadius:10, padding:'28px', textAlign:'center', cursor:'pointer' }}>
              <div style={{ fontSize:36, marginBottom:8 }}>{parsing ? '⏳' : '📄'}</div>
              <div style={{ fontSize:14, color:'var(--dark)', fontWeight:600 }}>
                {parsing ? 'Reading invoice...' : 'Tap to upload invoice PDF'}
              </div>
              <div style={{ fontSize:11, color:'#aaa', marginTop:6 }}>PDF format</div>
              <input type="file" accept=".pdf" onChange={handlePDFUpload} style={{ display:'none' }} disabled={parsing}/>
            </label>
          )}

          {parsedInvoice && (
            <div>
              {/* Invoice summary */}
              <div style={{ background:'#1b3a2d', borderRadius:10, padding:'14px', marginBottom:12, color:'#fff' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:10, opacity:0.6, textTransform:'uppercase' }}>Vendor</div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{parsedInvoice.vendorName || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, opacity:0.6, textTransform:'uppercase' }}>Invoice #</div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{parsedInvoice.invoiceNumber || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, opacity:0.6, textTransform:'uppercase' }}>Date</div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{parsedInvoice.invoiceDate || '—'}</div>
                  </div>
                </div>
                <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:8, padding:'10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:12, opacity:0.8 }}>{parsedInvoice.lineItems?.length || 0} line items found</div>
                  <div style={{ fontSize:20, fontWeight:800 }}>${(parsedInvoice.totalAmount || 0).toFixed(2)}</div>
                </div>
              </div>

              {/* Line items */}
              <div style={{ marginBottom:12 }}>
                {parsedInvoice.lineItems.map((li, i) => {
                  const match = matchToInventory(li.description, inventory)
                  return (
                    <div key={i} style={{
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'8px 10px', borderRadius:8, marginBottom:4,
                      background: match ? '#E8F5E9' : '#FFF3E0',
                      border: `1px solid ${match ? '#C8E6C9' : '#FFE0B2'}`
                    }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600 }}>{li.description}</div>
                        {match
                          ? <div style={{ fontSize:10, color:'#2d6a4f' }}>✓ Matches: {match.name}</div>
                          : <div style={{ fontSize:10, color:'#b45309' }}>⚠ No match — will skip</div>
                        }
                      </div>
                      <div style={{ textAlign:'right', fontSize:12 }}>
                        <div style={{ fontWeight:700 }}>×{li.qty}</div>
                        <div style={{ color:'#888' }}>${(li.amount || 0).toFixed(2)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button onClick={approveInvoice} disabled={approving}
                  style={{ flex:1, background:'var(--green-ok)', color:'#fff', border:'none', borderRadius:8, padding:'12px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit' }}>
                  {approving ? '⏳ Updating...' : '✅ Approve & Update Inventory'}
                </button>
                <button onClick={() => setParsedInvoice(null)}
                  style={{ padding:'12px 14px', background:'#888', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MANUAL TAB */}
      {tab === 'manual' && (
        <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--dark)', marginBottom:10 }}>Manual Entry</div>
          <select value={form.itemId} onChange={e => setForm(f=>({...f,itemId:e.target.value}))} style={inp}>
            <option value="">Select item</option>
            {inventory.filter(i => i.active !== false).map(i => (
              <option key={i.id} value={i.id}>{i.name} ({i.uom})</option>
            ))}
          </select>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <input type="number" placeholder="Quantity received" value={form.qty}
              onChange={e => setForm(f=>({...f,qty:e.target.value}))}
              style={{ ...inp, marginBottom:0 }}/>
            <input type="number" placeholder="Unit cost $" value={form.cost}
              onChange={e => setForm(f=>({...f,cost:e.target.value}))}
              style={{ ...inp, marginBottom:0 }}/>
          </div>
          <input type="text" placeholder="Note (vendor, invoice ref)" value={form.note}
            onChange={e => setForm(f=>({...f,note:e.target.value}))}
            style={{ ...inp, marginTop:8 }}/>
          <button onClick={logDelivery}
            style={{ width:'100%', background:'var(--dark)', color:'#fff', border:'none', borderRadius:8, padding:'12px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit' }}>
            + Log Delivery
          </button>
        </div>
      )}

      {/* LOG TAB */}
      {tab === 'log' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--dark)' }}>
              Delivery Log
              {monthSpend > 0 && (
                <span style={{ marginLeft:8, fontSize:11, fontWeight:400, color:'var(--text-muted)' }}>
                  This month: <strong style={{ color:'#1b3a2d' }}>${monthSpend.toFixed(2)}</strong>
                </span>
              )}
            </div>
            <input className="search-bar" placeholder="Search..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ maxWidth:160 }}/>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:13 }}>No deliveries logged yet</div>
          ) : filtered.map((d, idx) => (
            <div key={d.id||idx} style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{d.itemName}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {d.date} · {d.vendor || 'Unknown'}{d.invoiceNumber ? ` · #${d.invoiceNumber}` : ''}{d.note && !d.invoiceNumber ? ` · ${d.note}` : ''}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--green-ok)' }}>+{d.qty}</div>
                  {(d.totalCost || d.cost) > 0 && (
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                      ${(d.totalCost || (d.cost * d.qty) || 0).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
