import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase/config'

const fmt = n => `$${Number(n || 0).toFixed(2)}`

export default function Invoices({ auth, showToast }) {
  const [invoices, setInvoices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('pending')
  const [expanded, setExpanded] = useState(null)

  const role      = auth.userConfig?.role || ''
  const canManage = auth.isSuperOwner?.() || ['store_owner', 'regional_owner'].includes(role)
  const canView   = canManage || role === 'manager'

  useEffect(() => {
    if (!canView) { setLoading(false); return }
    const q = query(
      collection(db, 'invoices'),
      where('orgId', '==', 'dumont'),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q, snap => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => {
      console.error('invoices:', err)
      setLoading(false)
    })
  }, [canView])

  if (!canView) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#8B7355', fontSize: 13 }}>
      Invoice inbox is visible to managers and above.
    </div>
  )

  const shown = filter === 'pending'
    ? invoices.filter(i => !i.approved)
    : filter === 'approved'
      ? invoices.filter(i => i.approved)
      : invoices

  const pendingCount = invoices.filter(i => !i.approved).length

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

  const filterBtn = (id) => ({
    padding: '8px 16px',
    borderRadius: 20,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: filter === id ? 700 : 500,
    fontFamily: 'inherit',
    background: filter === id ? 'var(--dark)' : '#fff',
    color:      filter === id ? '#fff'        : 'var(--text-muted)',
    border:     filter === id ? 'none'        : '1px solid var(--border)',
  })

  if (loading) return <div style={{ padding: 24, color: '#8B7355', fontSize: 13 }}>Loading invoices…</div>

  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button style={filterBtn('pending')}  onClick={() => setFilter('pending')}>
          Pending {pendingCount > 0 && <span style={{ background: '#E53E3E', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11, marginLeft: 4 }}>{pendingCount}</span>}
        </button>
        <button style={filterBtn('approved')} onClick={() => setFilter('approved')}>Approved</button>
        <button style={filterBtn('all')}      onClick={() => setFilter('all')}>All ({invoices.length})</button>
      </div>

      {shown.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8B7355', fontSize: 13 }}>
          {filter === 'pending' ? 'No pending invoices — all caught up!' : 'No invoices found.'}
          <div style={{ fontSize: 12, marginTop: 8 }}>
            Invoice emails are scanned automatically every 20 minutes.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(inv => (
          <div key={inv.id} style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            {/* Summary row */}
            <div
              onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--dark)', marginBottom: 2 }}>
                  {inv.vendor}
                  {inv.storeName && <span style={{ fontWeight: 400, color: '#8B7355', marginLeft: 6, fontSize: 12 }}>· {inv.storeName}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#8B7355', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {inv.invoiceDate && <span>{inv.invoiceDate}</span>}
                  {inv.invoiceNumber && <span>#{inv.invoiceNumber}</span>}
                  <span style={{ color: '#aaa' }}>{new Date(inv.createdAt).toLocaleDateString()}</span>
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
              <div style={{ color: '#aaa', fontSize: 12, flexShrink: 0 }}>
                {expanded === inv.id ? '▲' : '▼'}
              </div>
            </div>

            {/* Expanded detail */}
            {expanded === inv.id && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', background: '#FAFAF8' }}>

                {/* Items table */}
                {inv.items && inv.items.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#8B7355', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Items</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ color: '#8B7355' }}>
                            <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', fontWeight: 600 }}>Item</th>
                            <th style={{ textAlign: 'right', padding: '4px 4px', fontWeight: 600, whiteSpace: 'nowrap' }}>Qty</th>
                            <th style={{ textAlign: 'right', padding: '4px 4px', fontWeight: 600, whiteSpace: 'nowrap' }}>Unit $</th>
                            <th style={{ textAlign: 'right', padding: '4px 0 4px 4px', fontWeight: 600, whiteSpace: 'nowrap' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.items.map((item, i) => (
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 8px 6px 0', color: 'var(--dark)' }}>{item.description}</td>
                              <td style={{ textAlign: 'right', padding: '6px 4px', color: '#555' }}>{item.qty} {item.unit || ''}</td>
                              <td style={{ textAlign: 'right', padding: '6px 4px', color: '#555' }}>{fmt(item.unitCost)}</td>
                              <td style={{ textAlign: 'right', padding: '6px 0 6px 4px', fontWeight: 600, color: 'var(--dark)' }}>{fmt(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 8, fontSize: 13 }}>
                      {inv.subtotal > 0 && <div style={{ color: '#8B7355' }}>Subtotal: {fmt(inv.subtotal)}</div>}
                      {inv.tax > 0      && <div style={{ color: '#8B7355' }}>Tax: {fmt(inv.tax)}</div>}
                      <div style={{ fontWeight: 700, color: 'var(--dark)' }}>Total: {fmt(inv.total)}</div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {inv.notes && (
                  <div style={{ fontSize: 12, color: '#8B7355', marginBottom: 12, fontStyle: 'italic' }}>
                    {inv.notes}
                  </div>
                )}

                {/* Raw email snippet */}
                <details style={{ marginBottom: 12 }}>
                  <summary style={{ fontSize: 12, color: '#aaa', cursor: 'pointer' }}>Email snippet</summary>
                  <pre style={{
                    fontSize: 11, color: '#8B7355', background: '#f5f0eb',
                    padding: 10, borderRadius: 8, marginTop: 6,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
                  }}>
                    {inv.body}
                  </pre>
                </details>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {!inv.approved && canManage && (
                    <button onClick={() => handleApprove(inv)} style={{
                      background: '#276749', color: '#fff',
                      border: 'none', borderRadius: 8, padding: '10px 18px',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                    }}>
                      ✓ Approve
                    </button>
                  )}
                  {inv.approved && (
                    <div style={{ fontSize: 12, color: '#276749', display: 'flex', alignItems: 'center', gap: 4 }}>
                      ✓ Approved by {inv.approvedBy}
                    </div>
                  )}
                  {canManage && (
                    <button onClick={() => handleDelete(inv)} style={{
                      background: 'none', color: '#E53E3E',
                      border: '1px solid #E53E3E', borderRadius: 8, padding: '10px 14px',
                      cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', marginLeft: 'auto',
                    }}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
