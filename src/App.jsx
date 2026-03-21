import { useState, useEffect } from 'react'
import { useAuth }      from './hooks/useAuth'
import { useInventory } from './hooks/useInventory'
import { useToast }     from './hooks/useToast'
import { useOrgItems }  from './hooks/useOrgItems'
import { loadSavedTheme } from './utils/themes'

import LoginScreen  from './components/LoginScreen'
import Layout       from './components/Layout'
import Home         from './components/Home'
import Dashboard    from './components/Dashboard'
import Inventory    from './components/Inventory'
import Orders       from './components/Orders'
import Sales        from './components/Sales'
import Delivery     from './components/Delivery'
import COGS         from './components/COGS'
import Schedule     from './components/Schedule'
import Admin        from './components/Admin'

export default function App() {
  const auth         = useAuth()
  const invHook      = useInventory()
  const { toast, showToast } = useToast()
  const orgItemsHook = useOrgItems()

  const [activeTab,    setActiveTab]    = useState('home')
  const [viewingStore, setViewingStore] = useState('coppell')
  const [viewingOrg,   setViewingOrg]   = useState('dumont')
  const [currentTheme, setCurrentTheme] = useState(() => loadSavedTheme())

  useEffect(() => {
    if (auth.userConfig) {
      const store = auth.userConfig.storeId || auth.userConfig.store || 'coppell'
      const org   = auth.userConfig.orgId   || 'dumont'
      setViewingStore(store)
      setViewingOrg(org)
      invHook.loadInventory(store)
      orgItemsHook.loadItems(org)
    }
  }, [auth.userConfig])

  useEffect(() => {
    if (viewingStore && auth.userConfig) {
      invHook.loadInventory(viewingStore)
    }
  }, [viewingStore])

  if (auth.loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#FDF6EC' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:48, fontWeight:700, color:'#2C1810', fontFamily:'serif' }}>D</div>
          <div style={{ fontSize:14, color:'#8B7355', marginTop:8 }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!auth.user || !auth.userConfig) {
    return <LoginScreen auth={auth} />
  }

  if (auth.pending) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#FDF6EC', padding:20 }}>
        <div style={{ textAlign:'center', maxWidth:360 }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#2C1810', marginBottom:8 }}>Pending Approval</div>
          <div style={{ fontSize:13, color:'#8B7355', marginBottom:24 }}>Your account is waiting for approval.</div>
          <button onClick={auth.logout} style={{ background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'12px 24px', cursor:'pointer', fontSize:13 }}>
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  const isSuperOwner    = auth.isSuperOwner()
  const isRegionalOwner = auth.userConfig?.role === 'regional_owner'

  const tabProps = {
    auth, invHook, viewingStore, setViewingStore,
    showToast, setActiveTab,
    orgItemsHook, viewingOrg, setViewingOrg,
  }

  const tabs = [
    { id:'home',      label:'Home'      },
    { id:'inventory', label:'Inventory' },
    { id:'orders',    label:'Orders'    },
    { id:'sales',     label:'Sales'     },
    { id:'delivery',  label:'Delivery'  },
    { id:'cogs',      label:'COGS'      },
    { id:'schedule',  label:'Schedule'  },
    ...(isSuperOwner || isRegionalOwner ? [{ id:'admin', label:'Admin' }] : []),
  ]

  return (
    <Layout auth={auth} tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} viewingStore={viewingStore} setViewingStore={setViewingStore} currentTheme={currentTheme} onThemeChange={setCurrentTheme}>
      {activeTab === 'home'      && <Home      {...tabProps} />}
      {activeTab === 'dashboard' && <Dashboard {...tabProps} />}
      {activeTab === 'inventory' && <Inventory {...tabProps} />}
      {activeTab === 'orders'    && <Orders    {...tabProps} />}
      {activeTab === 'sales'     && <Sales     {...tabProps} />}
      {activeTab === 'delivery'  && <Delivery  {...tabProps} />}
      {activeTab === 'cogs'      && <COGS      {...tabProps} />}
      {activeTab === 'schedule'  && <Schedule  {...tabProps} />}
      {activeTab === 'admin'     && <Admin     {...tabProps} />}

      {toast && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          background:'#2C1810', color:'#fff', padding:'12px 24px',
          borderRadius:24, fontSize:13, fontWeight:600,
          boxShadow:'0 4px 16px rgba(0,0,0,0.2)', zIndex:9999,
          whiteSpace:'nowrap'
        }}>
          {toast}
        </div>
      )}
    </Layout>
  )
}
