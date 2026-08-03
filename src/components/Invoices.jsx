import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase/config'

const fmt = n => `$${Number(n || 0).toFixed(2)}`

const VENDORS = ['Ben E. Keith', 'Stripe', 'Apparatus TX', 'Sentry Insights', 'Other']

const empty = () => ({
  vendor: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10),
  storeName: '', total: '', notes: '',
})

export default function Invoices({ auth, showToast, viewingOrg }) {
  const orgId = viewingOrg || auth.userConfig?.orgId || 'dumont'
  const [invoices, setInvoices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [adding,   setAdding]   = useState(false)
  const [form,     setForm]     = useState(empty())
  const [saving,   setSaving]   = useState(false)

  const role      = auth.userConfig?.role || ''
  const canManage = auth.isSuperOwner?.() || ['store_owner', 'regional_owner', 'manager'].includes(role)

  useEffect(() => {
    if (!canManage) { setLoading(false); return }
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

  const shown = filter === 'pending'
    ? invoices.filter(i => !i.approved)
    : filter === 'approved'
      ? invoices.filter(i => i.approved)
      : invoices

  const pendingCount = invoices.filter(i => !i.approved).length

  async function handleAdd() {
    if (!form.vendor || !form.total) { showToast('Vendor and total are required'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'invoices'), {
        ...form,
        total:     Number(form.total) || 0,
        orgId,
        approved:  false,
        approvedBy: null,
        approvedAt: null,
        createdBy:  auth.user.email,
        createdAt:  Date.now(),
      })
      setForm(empty())
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
    if (!window.confirm(`Delete invoice from ${inv.vendor}?`)) return
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

  if (loading) return <div style={{ padding: 24, color: '#6B7F78', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={filterBtn('all')}      onClick={() => setFilter('all')}>All ({invoices.length})</button>
        <button style={filterBtn('pending')}  onClick={() => setFilter('pending')}>
          Pending {pendingCount > 0 && <span style={{ background: '#E53E3E', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11, marginLeft: 4 }}>{pendingCount}</span>}
        </button>
        <button style={filterBtn('approved')} onClick={() => setFilter('approved')}>Approved</button>
        <button
          onClick={() => { setAdding(true); setForm(empty()) }}
          style={{ marginLeft: 'auto', background: 'var(--dark)', color: '#fff', border: 'none', borderRadius: 20, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
          + Add Invoice
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)', marginBottom: 12 }}>New Invoice</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Vendor *</div>
              <select value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} style={input}>
                <option value="">Select vendor…</option>
                {VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Total Amount *</div>
              <input type="number" step="0.01" placeholder="0.00" value={form.total}
                onChange={e => setForm(f => ({ ...f, total: e.target.value }))} style={input} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Invoice Date</div>
              <input type="date" value={form.invoiceDate}
                onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} style={input} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Invoice #</div>
              <input type="text" placeholder="INV-001" value={form.invoiceNumber}
                onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} style={input} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Store</div>
              <input type="text" placeholder="Coppell / Aubrey" value={form.storeName}
                onChange={e => setForm(f => ({ ...f, storeName: e.target.value }))} style={input} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4 }}>Notes</div>
              <input type="text" placeholder="Optional notes" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={input} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
          No invoices yet. Tap <strong>+ Add Invoice</strong> to log one.
        </div>
      )}

      {/* Invoice list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(inv => (
          <div key={inv.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

            {/* Summary row */}
            <div onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--dark)', marginBottom: 2 }}>
                  {inv.vendor}
                  {inv.storeName && <span style={{ fontWeight: 400, color: '#6B7F78', marginLeft: 6, fontSize: 12 }}>· {inv.storeName}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#6B7F78', display: 'flex', gap: 8 }}>
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
                {inv.notes && (
                  <div style={{ fontSize: 13, color: '#6B7F78', marginBottom: 12 }}>{inv.notes}</div>
                )}
                {inv.approved && (
                  <div style={{ fontSize: 12, color: '#276749', marginBottom: 12 }}>
                    ✓ Approved by {inv.approvedBy}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  {!inv.approved && (
                    <button onClick={() => handleApprove(inv)} style={{
                      background: '#276749', color: '#fff', border: 'none', borderRadius: 8,
                      padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                    }}>✓ Approve</button>
                  )}
                  <button onClick={() => handleDelete(inv)} style={{
                    background: 'none', color: '#E53E3E', border: '1px solid #E53E3E',
                    borderRadius: 8, padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                    marginLeft: inv.approved ? 0 : 'auto',
                  }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
