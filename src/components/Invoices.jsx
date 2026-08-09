import { useState, useEffect, useRef } from 'react'
import { SkeletonList } from './Skeleton'
import { confirm } from './ConfirmDialog'
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'

const fmt = n => `$${Number(n || 0).toFixed(2)}`

// Suggested vendors — free-text input also accepts anything new
const DEFAULT_VENDORS = ['Ben E. Keith', 'Apparatus TX', 'Restaurant Depot', 'Costco', 'Sam\'s Club']

// COGS categories. 'Operating Expense' is tracked but EXCLUDED from COGS math.
export const INVOICE_CATEGORIES = [
  { id: 'icecream',  label: 'Ice Cream / Dairy', color: '#C1683C', cogs: true  },
  { id: 'drinks',    label: 'Boba & Drinks',     color: '#2980B9', cogs: true  },
  { id: 'coffee',    label: 'Coffee',            color: '#6D4C41', cogs: true  },
  { id: 'bakery',    label: 'Bakery',            color: '#9B59B6', cogs: true  },
  { id: 'packaging', label: 'Packaging',         color: '#16A085', cogs: true  },
  { id: 'opex',      label: 'Operating Expense', color: '#7F8C8D', cogs: false },
  { id: 'other',     label: 'Other',             color: '#95A5A6', cogs: true  },
]

const MAX_IMG_B64  = 250000   // ~250 KB base64 per invoice photo
const MAX_PDF_B64  = 650000   // stay under Firestore's 1 MB doc limit

const empty = (storeId = '') => ({
  vendor: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10),
  storeId, total: '', notes: '', category: 'icecream',
  fileData: null, fileType: null, fileName: null,
})

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        try {
          // Invoices need to stay readable — keep more resolution than checklist photos
          let quality = 0.7, maxDim = 1400
          const render = (dim, q) => {
            const canvas = document.createElement('canvas')
            let w = img.width, h = img.height
            const scale = Math.min(1, dim / Math.max(w, h))
            canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
            return canvas.toDataURL('image/jpeg', q)
          }
          let out = render(maxDim, quality)
          if (out.length > MAX_IMG_B64) out = render(1100, 0.6)
          if (out.length > MAX_IMG_B64) out = render(900, 0.5)
          resolve(out)
        } catch(e) { reject(e) }
      }
      img.onerror = reject
      img.src = ev.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function Invoices({ auth, showToast, viewingOrg, viewingStore }) {
  const orgId = viewingOrg || auth.userConfig?.orgId || 'dumont'
  const [invoices, setInvoices] = useState([])
  const [stores,   setStores]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [adding,   setAdding]   = useState(false)
  const [form,     setForm]     = useState(empty())
  const [saving,   setSaving]   = useState(false)
  const [attaching,setAttaching]= useState(false)
  const fileRef = useRef()

  const role      = auth.userConfig?.role || ''
  const canManage = auth.isSuperOwner?.() || ['store_owner', 'regional_owner', 'manager'].includes(role)
  const canApprove= auth.isSuperOwner?.() || ['store_owner', 'regional_owner'].includes(role)
  const isSuperOrRegional = auth.isSuperOwner?.() || role === 'regional_owner'
  const myStoreId = auth.userConfig?.storeId || auth.userConfig?.store || ''

  useEffect(() => {
    if (!canManage) { setLoading(false); return }
    getDocs(collection(db, 'stores')).then(snap =>
      setStores(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    ).catch(() => {})
    const q = query(
      collection(db, 'invoices'),
      where('orgId', '==', orgId),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q, snap => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => {
      console.error('invoices:', err)
      setLoading(false)
    })
  }, [canManage, orgId])

  if (!canManage) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#6B7F78', fontSize: 13 }}>
      Invoice log is visible to managers and above.
    </div>
  )

  // Store owners/managers only see their own store's invoices; legacy invoices
  // without a storeId (pre-store-tagging) stay visible to everyone.
  const visibleInvoices = isSuperOrRegional
    ? invoices
    : invoices.filter(i => !i.storeId || i.storeId === myStoreId)

  const shown = filter === 'pending'
    ? visibleInvoices.filter(i => !i.approved)
    : filter === 'approved'
      ? visibleInvoices.filter(i => i.approved)
      : visibleInvoices

  const pendingCount = visibleInvoices.filter(i => !i.approved).length
  const vendorSuggestions = [...new Set([...visibleInvoices.map(i => i.vendor).filter(Boolean), ...DEFAULT_VENDORS])].sort()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAttaching(true)
    try {
      if (file.type === 'application/pdf') {
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = ev => res(ev.target.result)
          r.onerror = rej
          r.readAsDataURL(file)
        })
        if (b64.length > MAX_PDF_B64) {
          showToast('PDF too large (max ~500 KB) — take a photo of the invoice instead')
        } else {
          setForm(f => ({ ...f, fileData: b64, fileType: 'application/pdf', fileName: file.name }))
        }
      } else if (file.type.startsWith('image/')) {
        const b64 = await compressImage(file)
        setForm(f => ({ ...f, fileData: b64, fileType: 'image/jpeg', fileName: file.name }))
      } else {
        showToast('Attach a photo or PDF')
      }
    } catch(err) {
      console.error(err)
      showToast('Could not process file — try a photo instead')
    }
    setAttaching(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleAdd() {
    if (!form.vendor.trim() || !form.total) { showToast('Vendor and total are required'); return }
    if (!form.storeId) { showToast('Select a store'); return }
    setSaving(true)
    try {
      const store = stores.find(s => s.id === form.storeId)
      await addDoc(collection(db, 'invoices'), {
        vendor:        form.vendor.trim(),
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceDate:   form.invoiceDate,
        storeId:       form.storeId,
        storeName:     store?.name || '',
        category:      form.category,
        total:         Number(form.total) || 0,
        notes:         form.notes.trim(),
        fileData:      form.fileData || null,
        fileType:      form.fileType || null,
        fileName:      form.fileName || null,
        orgId,
        approved:   false,
        approvedBy: null,
        approvedAt: null,
        createdBy:  auth.user.email,
        createdAt:  Date.now(),
      })
      setForm(empty(viewingStore || ''))
      setAdding(false)
      showToast('Invoice added')
    } catch (e) { showToast('Error: ' + e.message) }
    setSaving(false)
  }

  async function handleApprove(inv) {
    try {
      await updateDoc(doc(db, 'invoices', inv.id), {
        approved:   true,
        approvedBy: auth.user.email,
        approvedAt: Date.now(),
      })
      showToast('Invoice approved ✓')
    } catch (e) { showToast('Error: ' + e.message) }
  }

  async function handleDelete(inv) {
    if (!await confirm({ title:'Delete invoice?', message:`${inv.vendor} · ${fmt(inv.total)}`, danger:true })) return
    try {
      await deleteDoc(doc(db, 'invoices', inv.id))
      if (expanded === inv.id) setExpanded(null)
      showToast('Invoice deleted')
    } catch (e) { showToast('Error: ' + e.message) }
  }

  const filterBtn = id => ({
    padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
    fontSize: 13, fontWeight: filter === id ? 700 : 500, fontFamily: 'inherit',
    background: filter === id ? 'var(--dark)' : '#fff',
    color:      filter === id ? '#fff'        : 'var(--text-muted)',
    border:     filter === id ? 'none'        : '1px solid var(--border)',
  })

  const input = { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }
  const catOf = id => INVOICE_CATEGORIES.find(c => c.id === id) || INVOICE_CATEGORIES[INVOICE_CATEGORIES.length - 1]

  if (loading) return <SkeletonList count={4} lines={2} />

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={filterBtn('all')}      onClick={() => setFilter('all')}>All ({visibleInvoices.length})</button>
        <button style={filterBtn('pending')}  onClick={() => setFilter('pending')}>
          Pending {pendingCount > 0 && <span style={{ background: '#E53E3E', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11, marginLeft: 4 }}>{pendingCount}</span>}
        </button>
        <button style={filterBtn('approved')} onClick={() => setFilter('approved')}>Approved</button>
        <button
          onClick={() => { setAdding(true); setForm(empty(viewingStore || '')) }}
          style={{ marginLeft: 'auto', background: 'var(--dark)', color: '#fff', border: 'none', borderRadius: 20, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
          + Add Invoice
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)', marginBottom: 12 }}>New Invoice</div>

          {/* Attachment first — snap a photo of the paper invoice */}
          <div style={{ marginBottom: 12 }}>
            <input type="file" accept="image/*,application/pdf" capture="environment"
              ref={fileRef} onChange={handleFile} style={{ display: 'none' }} />
            {attaching ? (
              <div style={{ padding: '12px', textAlign: 'center', color: '#6B7F78', fontSize: 13 }}>Processing…</div>
            ) : form.fileData ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FFF4', border: '1px solid #81C784', borderRadius: 10, padding: '10px 12px' }}>
                {form.fileType?.startsWith('image') ? (
                  <img src={form.fileData} alt="invoice" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  <span style={{ fontSize: 26 }}>📄</span>
                )}
                <div style={{ flex: 1, fontSize: 12, color: '#276749', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {form.fileName || 'Attached'}
                </div>
                <button onClick={() => setForm(f => ({ ...f, fileData: null, fileType: null, fileName: null }))}
                  style={{ background: 'none', border: '1px solid #FFCDD2', color: '#E53E3E', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                  Remove
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                style={{ width: '100%', background: '#FDF9F3', border: '1.5px dashed #C1683C', borderRadius: 10, padding: '14px', cursor: 'pointer', fontSize: 13, color: '#C1683C', fontWeight: 600, fontFamily: 'inherit' }}>
                📷 Snap Photo or Upload Invoice (PDF)
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Vendor *</div>
              <input list="vendor-suggestions" placeholder="Type or pick vendor…" value={form.vendor}
                onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} style={input} />
              <datalist id="vendor-suggestions">
                {vendorSuggestions.map(v => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Total Amount *</div>
              <input type="number" step="0.01" placeholder="0.00" value={form.total}
                onChange={e => setForm(f => ({ ...f, total: e.target.value }))} style={{ ...input, fontWeight: 700 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Invoice Date</div>
              <input type="date" value={form.invoiceDate}
                onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} style={input} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Store *</div>
              {isSuperOrRegional ? (
                <select value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))} style={input}>
                  <option value="">Select store…</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <div style={{ ...input, background: '#F5EDE0', color: 'var(--dark)', fontWeight: 600 }}>
                  {stores.find(s => s.id === myStoreId)?.name || 'Your store'}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Invoice #</div>
              <input type="text" placeholder="INV-001 (optional)" value={form.invoiceNumber}
                onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} style={input} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Notes</div>
              <input type="text" placeholder="Optional notes" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={input} />
            </div>
          </div>

          {/* Category — drives COGS */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 6 }}>
              Category * <span style={{ fontSize: 11, color: '#aaa' }}>(Operating Expense is excluded from COGS)</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {INVOICE_CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setForm(f => ({ ...f, category: c.id }))}
                  style={{ padding: '7px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                    fontWeight: form.category === c.id ? 700 : 400,
                    background: form.category === c.id ? c.color : '#fff',
                    color: form.category === c.id ? '#fff' : c.color,
                    border: `1.5px solid ${c.color}` }}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={handleAdd} disabled={saving} style={{
              background: 'var(--dark)', color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            }}>
              {saving ? 'Saving…' : 'Save Invoice'}
            </button>
            <button onClick={() => setAdding(false)} style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-muted)',
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {shown.length === 0 && !adding && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B7F78', fontSize: 13 }}>
          No invoices yet. Tap <strong>+ Add Invoice</strong> to log one — snap a photo of the paper invoice or enter it manually.
        </div>
      )}

      {/* Invoice list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(inv => {
          const cat = catOf(inv.category)
          return (
            <div key={inv.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

              {/* Summary row */}
              <div onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--dark)', marginBottom: 2 }}>
                    {inv.fileData && <span style={{ marginRight: 4 }}>📎</span>}
                    {inv.vendor}
                    {inv.storeName && <span style={{ fontWeight: 400, color: '#6B7F78', marginLeft: 6, fontSize: 12 }}>· {inv.storeName}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7F78', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {inv.category && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: cat.color, borderRadius: 4, padding: '1px 7px' }}>
                        {cat.label}
                      </span>
                    )}
                    {inv.invoiceDate && <span>{inv.invoiceDate}</span>}
                    {inv.invoiceNumber && <span>#{inv.invoiceNumber}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--dark)' }}>{fmt(inv.total)}</div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    background: inv.approved ? '#C6F6D5' : '#FEFCBF',
                    color:      inv.approved ? '#276749' : '#744210',
                  }}>
                    {inv.approved ? 'Approved' : 'Pending'}
                  </span>
                </div>
                <div style={{ color: '#aaa', fontSize: 12 }}>{expanded === inv.id ? '▲' : '▼'}</div>
              </div>

              {/* Expanded detail */}
              {expanded === inv.id && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', background: '#FAFAF8' }}>
                  {inv.fileData && inv.fileType?.startsWith('image') && (
                    <img src={inv.fileData} alt="invoice" style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 12 }} />
                  )}
                  {inv.fileData && inv.fileType === 'application/pdf' && (
                    <a href={inv.fileData} download={inv.fileName || 'invoice.pdf'}
                      style={{ display: 'inline-block', marginBottom: 12, fontSize: 13, color: '#C1683C', fontWeight: 600 }}>
                      📄 Download {inv.fileName || 'invoice.pdf'}
                    </a>
                  )}
                  {inv.notes && (
                    <div style={{ fontSize: 13, color: '#6B7F78', marginBottom: 12 }}>{inv.notes}</div>
                  )}
                  <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>
                    Added by {inv.createdBy}{inv.approved ? ` · ✓ approved by ${inv.approvedBy}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!inv.approved && canApprove && (
                      <button onClick={() => handleApprove(inv)} style={{
                        background: '#276749', color: '#fff', border: 'none', borderRadius: 8,
                        padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                      }}>✓ Approve</button>
                    )}
                    {!inv.approved && !canApprove && (
                      <span style={{ fontSize: 12, color: '#744210', alignSelf: 'center' }}>Awaiting owner approval</span>
                    )}
                    <button onClick={() => handleDelete(inv)} style={{
                      background: 'none', color: '#E53E3E', border: '1px solid #E53E3E',
                      borderRadius: 8, padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                      marginLeft: 'auto',
                    }}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
