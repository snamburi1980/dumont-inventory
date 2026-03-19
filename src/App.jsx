import { useState, useEffect } from 'react'
import { useAuth }      from './hooks/useAuth'
import { useInventory } from './hooks/useInventory'
import { useToast }     from './hooks/useToast'

import LoginScreen  from './components/LoginScreen'
import Layout       from './components/Layout'
import Dashboard    from './components/Dashboard'
import Inventory    from './components/Inventory'
import Orders       from './components/Orders'
import Sales        from './components/Sales'
import Delivery     from './components/Delivery'
import COGS         from './components/COGS'
import Schedule     from './components/Schedule'
import Admin        from './components/Admin'

export default function App() {
  const auth        = useAuth()
  const invHook     = useInventory()
  const { toast, showToast } = useToast()
  const [activeTab,    setActiveTab]    = useState('dashboard')
  const [viewingStore, setViewingStore] = useState('coppell')

  // Load inventory when user logs in or store changes
  useEffect(() => {
    if (auth.userConfig) {
      const store = viewingStore || auth.userConfig.store || 'coppell'
      setViewingStore(store)
      invHook.loadInventory(store)
    }
  }, [auth.userConfig, viewingStore])

  // Show loading
  if (auth.loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--cream)' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}></div>
          <div style={{ fontSize:14, color:'var(--text-muted)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!auth.user || !auth.userConfig) {
    return <LoginScreen auth={auth} />
  }

  // Pending approval
  if (auth.pending) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--cream)', padding:20 }}>
        <div style={{ textAlign:'center', maxWidth:360 }}>
          <div style={{ fontSize:40, marginBottom:16 }}></div>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--dark)', marginBottom:8 }}>Pending Approval</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:24 }}>Your account is waiting for approval. Please contact your store owner.</div>
          <button className="btn-primary" onClick={auth.logout}>Sign Out</button>
        </div>
      </div>
    )
  }

  const tabProps = {
    auth, invHook, viewingStore, setViewingStore,
    showToast, setActiveTab,
  }

  const tabs = [
    { id:'dashboard', label:'Dashboard' },
    { id:'inventory', label:'Inventory' },
    { id:'orders',    label:'Orders' },
    { id:'sales',     label:'Sales' },
    { id:'delivery',  label:'Delivery' },
    { id:'cogs',      label:'COGS' },
    { id:'schedule',  label:'Schedule' },
    ...(auth.isSuperOwner() ? [{ id:'admin', label:'Admin' }] : []),
  ]

  return (
    <Layout
      auth={auth}
      tabs={tabs}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      viewingStore={viewingStore}
      setViewingStore={setViewingStore}
    >
      {activeTab === 'dashboard' && <Dashboard {...tabProps} />}
      {activeTab === 'inventory' && <Inventory {...tabProps} />}
      {activeTab === 'orders'    && <Orders    {...tabProps} />}
      {activeTab === 'sales'     && <Sales     {...tabProps} />}
      {activeTab === 'delivery'  && <Delivery  {...tabProps} />}
      {activeTab === 'cogs'      && <COGS      {...tabProps} />}
      {activeTab === 'schedule'  && <Schedule  {...tabProps} />}
      {activeTab === 'admin'     && <Admin     {...tabProps} />}

      {toast && <div className="toast">{toast}</div>}
    </Layout>
  )
}
