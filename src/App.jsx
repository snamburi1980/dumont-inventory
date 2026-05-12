import { useState, useEffect } from 'react'
import { useAuth }      from './hooks/useAuth'
import { useInventory } from './hooks/useInventory'
import { useToast }     from './hooks/useToast'
import { useOrgItems }  from './hooks/useOrgItems'
import { applyTheme }   from './utils/themes'
import { ErrorBoundary } from './components/ErrorBoundary'

import LoginScreen    from './components/LoginScreen'
import Layout         from './components/Layout'
import Home           from './components/Home'
import Inventory      from './components/Inventory'
import Orders         from './components/Orders'
import Sales          from './components/Sales'
import Delivery       from './components/Delivery'
import COGS           from './components/COGS'
import Schedule       from './components/Schedule'
import Admin          from './components/Admin'
import ChangePassword from './components/ChangePassword'
import Checklist      from './components/Checklist'
import Picks          from './components/Picks'
import Transfers      from './components/Transfers'
import CashRegister   from './components/CashRegister'

export default function App() {
  const auth         = useAuth()
  const invHook      = useInventory()
  const { toast, showToast } = useToast()
  const orgItemsHook = useOrgItems()
  const { needsPasswordChange, setNeedsPasswordChange } = auth

  const [activeTab,    setActiveTab]    = useState('home')
  const [viewingStore, setViewingStore] = useState('')
  const [viewingOrg,   setViewingOrg]   = useState('dumont')
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('dumont_theme') || 'warm'
  })

  const role     = auth.userConfig?.role || ''
  const isStaff  = role === 'staff'
  const staffAllowedTabs = ['home','inventory','icecreamlog','checklist','schedule','transfers','cashregister']

  useEffect(() => { applyTheme(currentTheme) }, [])

  useEffect(() => {
    if (auth.userConfig) {
      const isSuperOwner = auth.isSuperOwner()
      const store = auth.userConfig.storeId || auth.userConfig.store || ''
      const org   = auth.userConfig.orgId   || 'dumont'
      if (store && !isSuperOwner) setViewingStore(store)
      setViewingOrg(org)
      if (store) invHook.loadInventory(store, org)
      orgItemsHook.loadItems(org)
    }
  }, [auth.userConfig])

  useEffect(() => {
    if (viewingStore && auth.userConfig) {
      invHook.loadInventory(viewingStore, viewingOrg)
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

  if (!auth.user || !auth.userConfig) return <LoginScreen auth={auth} />

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

  if (needsPasswordChange) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#FDF6EC', padding:20 }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontSize:18, fontWeight:700, color:'#2C1810', marginBottom:8 }}>Welcome! Please set your password</div>
            <div style={{ fontSize:13, color:'#8B7355' }}>You must change your temporary password before continuing.</div>
          </div>
          <ChangePassword
            showToast={showToast}
            onClose={async () => {
              const { doc, updateDoc } = await import('firebase/firestore')
              const { db } = await import('./firebase/config')
              const emailKey = auth.user.email.replace(/\./g,'_').replace(/@/g,'_at_')
              await updateDoc(doc(db, 'users', emailKey), { forcePasswordChange: false })
              setNeedsPasswordChange(false)
            }}
          />
          <button onClick={auth.logout} style={{ width:'100%', marginTop:10, background:'none', border:'none', color:'#8B7355', cursor:'pointer', fontSize:12 }}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const tabProps = {
    auth, invHook, viewingStore, setViewingStore,
    showToast, setActiveTab,
    orgItemsHook, viewingOrg, setViewingOrg,
  }

  const allTabs = [
    { id:'home',         label:'Home'          },
    { id:'inventory',    label:'Inventory'     },
    { id:'icecreamlog',  label:'Ice Cream Log' },
    { id:'checklist',    label:'Checklist'     },
    { id:'schedule',     label:'Schedule'      },
    { id:'transfers',    label:'Transfers'     },
    { id:'cashregister', label:'Cash Register' },
    { id:'sales',        label:'Sales'         },
    { id:'orders',       label:'Orders'        },
    { id:'delivery',     label:'Delivery'      },
    { id:'cogs',         label:'COGS'          },
    { id:'admin',        label:'Admin'         },
  ]

  const tabs = isStaff
    ? allTabs.filter(t => staffAllowedTabs.includes(t.id))
    : allTabs

  function handleTabChange(tab) {
    if (isStaff && !staffAllowedTabs.includes(tab)) return
    if (tab === 'inventory' && auth.userConfig) {
      invHook.loadInventory(viewingStore, viewingOrg)
    }
    setActiveTab(tab)
  }

  return (
    <ErrorBoundary>
      <Layout auth={auth} tabs={tabs} activeTab={activeTab} setActiveTab={handleTabChange}
        viewingStore={viewingStore} setViewingStore={setViewingStore}
        currentTheme={currentTheme} onThemeChange={setCurrentTheme} showToast={showToast}>

        {activeTab === 'home'        && <Home      {...tabProps} />}
        {activeTab === 'inventory'   && <Inventory {...tabProps} />}
        {activeTab === 'icecreamlog' && <Picks invHook={invHook} viewingStore={viewingStore} viewingOrg={viewingOrg} auth={auth} showToast={showToast} />}
        {activeTab === 'checklist'   && <Checklist viewingStore={viewingStore} auth={auth} showToast={showToast} />}
        {activeTab === 'schedule'    && <Schedule  {...tabProps} />}
        {activeTab === 'sales'       && <Sales     {...tabProps} />}
        {activeTab === 'orders'      && <Orders    {...tabProps} />}
        {activeTab === 'delivery'    && <Delivery  {...tabProps} />}
        {activeTab === 'cashregister' && <CashRegister viewingStore={viewingStore} auth={auth} showToast={showToast} />}
        {activeTab === 'transfers'   && <Transfers auth={auth} showToast={showToast} />}
        {activeTab === 'cogs'        && <COGS      {...tabProps} />}
        {activeTab === 'admin'       && <Admin     {...tabProps} />}

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
    </ErrorBoundary>
  )
}
