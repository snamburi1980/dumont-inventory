import { useState } from 'react'
import CashRegister from './CashRegister'
import Transfers    from './Transfers'
import Invoices     from './Invoices'

export default function Records({ viewingStore, auth, showToast }) {
  const role      = auth.userConfig?.role || ''
  const canInvoice = auth.isSuperOwner?.() || ['store_owner', 'regional_owner', 'manager'].includes(role)

  const [view, setView] = useState('cash')

  const btn = (id) => ({
    flex: 1, padding: '11px', borderRadius: 10,
    cursor: 'pointer', fontSize: 14, fontWeight: view === id ? 700 : 500,
    fontFamily: 'inherit',
    background: view === id ? 'var(--dark)' : '#fff',
    color:      view === id ? '#fff'        : 'var(--text-muted)',
    border:     view === id ? 'none'        : '1px solid var(--border)',
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView('cash')}      style={btn('cash')}     >💵 Cash</button>
        <button onClick={() => setView('transfers')} style={btn('transfers')} >↔️ Transfers</button>
        {canInvoice && (
          <button onClick={() => setView('invoices')} style={btn('invoices')}>🧾 Invoices</button>
        )}
      </div>
      {view === 'cash'      && <CashRegister viewingStore={viewingStore} auth={auth} showToast={showToast} />}
      {view === 'transfers' && <Transfers    viewingStore={viewingStore} auth={auth} showToast={showToast} />}
      {view === 'invoices'  && <Invoices     auth={auth} showToast={showToast} />}
    </div>
  )
}
