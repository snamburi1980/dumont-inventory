import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, orderBy, query, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import { logAudit, AUDIT_ACTIONS } from '../utils/auditLogger'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString()

// Extract text from PDF using pdfjs-dist
async function extractPDFText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const uint8Array  = new Uint8Array(arrayBuffer)
  const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    fullText += content.items.map(item => item.str).join(' ') + '\n'
  }
  return fullText
}

// Parse flat pdfjs text into invoice metadata + line items
function parseInvoiceText(text) {
  const flat = text.replace(/\s+/g, ' ').trim()

  // Invoice number
  const invMatch      = flat.match(/invoice\s*(?:number|#|no\.?)?\s*[:\s]?\s*([A-Z0-9\-]{4,})/i)
  const invoiceNumber = invMatch ? invMatch[1] : ''

  // Vendor: text before "Bill to" or "Invoice"
  const vendorMatch = flat.match(/^(.+?)(?=\s+Bill to|\s+Invoice\s)/i)
  const vendorName  = vendorMatch ? vendorMatch[1].replace(/^Page \d+ of \d+\s*/i, '').trim() : 'Unknown Vendor'

  // First date found
  const dateMatch   = flat.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/)
  const invoiceDate = dateMatch ? dateMatch[1] : new Date().toLocaleDateString()

  // Grand total
  const totalMatch  = flat.match(/\bTotal\b[^$]*\$([\d,]+\.\d{2})/i)
  const allAmounts  = [...flat.matchAll(/\$([\d,]+\.\d{2})/g)]
  const totalAmount = totalMatch
    ? parseFloat(totalMatch[1].replace(',', ''))
    : allAmounts.length
      ? parseFloat(allAmounts[allAmounts.length - 1][1].replace(',', ''))
      : 0

  // Line items: Description  Qty  $unitPrice  $lineTotal
  const lineItems = []
  const SKIP = /^(invoice|date|bill|ship|from|to|phone|email|address|total|subtotal|tax|page|qty|quantity|description|item|price|amount|unit|pay|bank|routing|account|swift|reference)/i
  const re   = /([A-Za-z][A-Za-z0-9 ()&,.\-\/'']{3,60?}?)\s+(\d+(?:\.\d+)?)\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/g
  let m
  while ((m = re.exec(flat)) !== null) {
    const description = m[1].trim()
    const qty         = parseFloat(m[2])
    const unitPrice   = parseFloat(m[3].replace(',', ''))
    const amount      = parseFloat(m[4].replace(',', ''))
    if (SKIP.test(description) || description.length < 3 || qty <= 0 || amount <= 0) continue
    lineItems.push({ description, qty, unitPrice, amount })
  }

  return { vendorName, invoiceNumber, invoiceDate, totalAmount, lineItems }
}

export default function Delivery({ invHook, viewingStore, showToast }) {
  const { inventory, saveInventory, loadInventory } = invHook

  const [deliveries,    setDeliveries]    = useState([])
  const [search,        setSearch]        = useState('')
  const [form,          setForm]          = useState({ itemId:'', qty:'', cost:'', note:'' })
  const [parsing,       setParsing]       = useState(false)
  const [parsedInvoice, setParsedInvoice] = useState(null)
  const [saving,        setSaving]        = useState(false)
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
    if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Please upload a PDF file'); return }
    setParsing(true)
    setParsedInvoice(null)
    try {
      const text   = await extractPDFText(file)
      const parsed = parseInvoiceText(text)
      setParsedInvoice(parsed)
      if (parsed.lineItems.length === 0) showToast('No line items found — check PDF or use manual entry')
      else showToast(`Found ${parsed.lineItems.length} items`)
    } catch(err) {
      console.error('PDF parse error:', err)
      showToast('Error reading PDF: ' + err.message)
    }
    setParsing(false)
  }

  // Save invoice as a single delivery log entry (no inventory changes)
  async function saveInvoice() {
    if (!parsedInvoice) return
    setSaving(true)
    try {
      const entry = {
        type:          'invoice',
        itemName:      `Invoice ${parsedInvoice.invoiceNumber} — ${parsedInvoice.vendorName}`,
        vendor:        parsedInvoice.vendorName,
        invoiceNumber: parsedInvoice.invoiceNumber,
        invoiceDate:   parsedInvoice.invoiceDate,
        lineItems:     parsedInvoice.lineItems,
        totalCost:     parsedInvoice.totalAmount,
        qty:           parsedInvoice.lineItems.length,
        cost:          parsedInvoice.totalAmount,
        note:          `${parsedInvoice.lineItems.length} items · $${parsedInvoice.totalAmount.toFixed(2)}`,
        dateTs:        Date.now(),
        date:          new Date().toLocaleDateString(),
      }
      await addDoc(collection(db, 'stores', viewingStore, 'deliveries'), entry)
      await logAudit({
        action:  AUDIT_ACTIONS.DELIVERY_LOGGED,
        storeId: viewingStore,
        details: { invoiceNumber: parsedInvoice.invoiceNumber, vendor: parsedInvoice.vendorName, total: parsedInvoice.totalAmount },
      })
      await loadDeliveries()
      showToast(`✅ Invoice ${parsedInvoice.invoiceNumber} saved to log`)
      setParsedInvoice(null)
      setTab('log')
    } catch(err) {
      console.error('saveInvoice:', err)
      showToast('Error saving invoice')
    }
    setSaving(false)
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
    !search ||
    d.itemName?.toLowerCase().includes(search.toLowerCase()) ||
    d.vendor?.toLowerCase().includes(search.toLowerCase()) ||
    d.invoiceNumber?.toLowerCase().includes(search.toLowerCase())
  )

  const now = new Date()
  const monthSpend = deliveries
    .filter(d => { const dt = new Date(d.dateTs); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear() })
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
          <div style={{ fontSize:13, fontWeight:700, color:'var(--dark)', marginBottom:4 }}>Upload Vendor Invoice</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:12 }}>
            PDF is saved to your delivery log. Use Manual Entry to update stock levels.
          </div>

          {!parsedInvoice && (
            <label style={{ display:'block', border:'2px dashed var(--border)', borderRadius:10, padding:'28px', textAlign:'center', cursor: parsing ? 'default' : 'pointer' }}>
              <div style={{ fontSize:36, marginBottom:8 }}>{parsing ? '⏳' : '📄'}</div>
              <div style={{ fontSize:14, color:'var(--dark)', fontWeight:600 }}>
                {parsing ? 'Reading invoice...' : 'Tap to upload invoice PDF'}
              </div>
              <div style={{ fontSize:11, color:'#aaa', marginTop:6 }}>PDF format only</div>
              <input type="file" accept=".pdf" onChange={handlePDFUpload} style={{ display:'none' }} disabled={parsing}/>
            </label>
          )}

          {parsedInvoice && (
            <div>
              {/* Invoice header */}
              <div style={{ background:'#1b3a2d', borderRadius:10, padding:'14px 16px', marginBottom:12, color:'#fff' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:10, opacity:0.55, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>Vendor</div>
                    <div style={{ fontSize:12, fontWeight:700, lineHeight:1.3 }}>{parsedInvoice.vendorName || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, opacity:0.55, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>Invoice #</div>
                    <div style={{ fontSize:12, fontWeight:700 }}>{parsedInvoice.invoiceNumber || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, opacity:0.55, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>Date</div>
                    <div style={{ fontSize:12, fontWeight:700 }}>{parsedInvoice.invoiceDate || '—'}</div>
                  </div>
                </div>
                <div style={{ background:'rgba(255,255,255,0.12)', borderRadius:8, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:12, opacity:0.75 }}>{parsedInvoice.lineItems.length} items</div>
                  <div style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.5px' }}>${parsedInvoice.totalAmount.toFixed(2)}</div>
                </div>
              </div>

              {/* Line items — read only */}
              {parsedInvoice.lineItems.length > 0 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                    Items (reference only)
                  </div>
                  <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                    {parsedInvoice.lineItems.map((li, i) => (
                      <div key={i} style={{
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'8px 12px',
                        borderBottom: i < parsedInvoice.lineItems.length - 1 ? '1px solid var(--border)' : 'none',
                        background: i % 2 === 0 ? '#fff' : '#fafafa',
                        gap: 8,
                      }}>
                        <div style={{ fontSize:12, color:'var(--dark)', flex:1 }}>{li.description}</div>
                        <div style={{ fontSize:11, color:'#888', whiteSpace:'nowrap' }}>×{li.qty}</div>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--dark)', whiteSpace:'nowrap', minWidth:56, textAlign:'right' }}>
                          ${li.amount.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={saveInvoice} disabled={saving} style={{
                  flex:1, background:'var(--green-ok)', color:'#fff', border:'none', borderRadius:8,
                  padding:'12px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit'
                }}>
                  {saving ? '⏳ Saving...' : '✅ Save to Delivery Log'}
                </button>
                <button onClick={() => setParsedInvoice(null)} style={{
                  padding:'12px 14px', background:'#888', color:'#fff', border:'none',
                  borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'inherit'
                }}>
                  Cancel
                </button>
              </div>

              <div style={{ marginTop:8, fontSize:11, color:'var(--text-muted)', textAlign:'center' }}>
                To update stock levels, use Manual Entry after saving.
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
              onChange={e => setForm(f=>({...f,qty:e.target.value}))} style={{ ...inp, marginBottom:0 }}/>
            <input type="number" placeholder="Unit cost $" value={form.cost}
              onChange={e => setForm(f=>({...f,cost:e.target.value}))} style={{ ...inp, marginBottom:0 }}/>
          </div>
          <input type="text" placeholder="Note (vendor, invoice ref)" value={form.note}
            onChange={e => setForm(f=>({...f,note:e.target.value}))} style={{ ...inp, marginTop:8 }}/>
          <button onClick={logDelivery} style={{
            width:'100%', background:'var(--dark)', color:'#fff', border:'none', borderRadius:8,
            padding:'12px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit'
          }}>
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
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)' }}>{d.itemName}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                    {d.date} · {d.vendor || 'Unknown'}
                    {d.invoiceNumber ? ` · #${d.invoiceNumber}` : ''}
                    {d.note && !d.invoiceNumber ? ` · ${d.note}` : ''}
                  </div>
                  {/* Expandable line items for invoice entries */}
                  {d.type === 'invoice' && d.lineItems?.length > 0 && (
                    <details style={{ marginTop:6 }}>
                      <summary style={{ fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>
                        {d.lineItems.length} items — tap to view
                      </summary>
                      <div style={{ marginTop:6, paddingLeft:4 }}>
                        {d.lineItems.map((li, i) => (
                          <div key={i} style={{ fontSize:11, color:'#555', display:'flex', justifyContent:'space-between', padding:'2px 0', borderBottom:'1px solid #f0f0f0' }}>
                            <span>{li.description} ×{li.qty}</span>
                            <span style={{ fontWeight:600 }}>${li.amount?.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
                <div style={{ textAlign:'right', marginLeft:12, flexShrink:0 }}>
                  {d.type === 'invoice'
                    ? <div style={{ fontSize:14, fontWeight:700, color:'#1b3a2d' }}>${(d.totalCost||0).toFixed(2)}</div>
                    : <div style={{ fontSize:14, fontWeight:700, color:'var(--green-ok)' }}>+{d.qty}</div>
                  }
                  {d.type !== 'invoice' && (d.totalCost || d.cost) > 0 && (
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
