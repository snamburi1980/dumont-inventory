import { useState, useEffect } from 'react'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { THEMES, applyTheme } from '../utils/themes'
import ThemeSwitcher from './ThemeSwitcher'
import ChangePassword from './ChangePassword'

export default function Layout({ auth, tabs, activeTab, setActiveTab, viewingStore, setViewingStore, children, currentTheme, onThemeChange, showToast }) {
  const [orgConfig,     setOrgConfig]     = useState(null)
  const [allStores,     setAllStores]     = useState([])
  const [allRegions,    setAllRegions]    = useState([])
  const [showChangePwd, setShowChangePwd] = useState(false)
  const userConfig = auth?.userConfig

  useEffect(() => { loadOrgConfig(); loadStores() }, [userConfig?.orgId])

  useEffect(() => {
    if (currentTheme) applyTheme(currentTheme)
  }, [currentTheme])

  async function loadStores() {
    try {
      const [storeSnap, regionSnap] = await Promise.all([
        getDocs(collection(db, 'stores')),
        getDocs(collection(db, 'regions')),
      ])
      setAllStores(storeSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setAllRegions(regionSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {}
  }

  async function loadOrgConfig() {
    const orgId = userConfig?.orgId || 'dumont'
    try {
      const snap = await getDoc(doc(db, 'orgs', orgId))
      if (snap.exists()) setOrgConfig(snap.data())
    } catch(e) {}
  }

  const isSuperOwner     = auth?.isSuperOwner?.()
  const role             = userConfig?.role || ''
  const theme            = THEMES[currentTheme] || THEMES.warm
  const logoData         = orgConfig?.logoData || null
  const orgName          = orgConfig?.name     || 'Dumont'

  function getAccessibleStores() {
    if (isSuperOwner) return allStores
    if (role === 'regional_owner') {
      const regionId = userConfig?.regionId
      return allStores.filter(s => !regionId || s.regionId === regionId)
    }
    const storeId = userConfig?.storeId || userConfig?.store || ''
    if (!storeId) return []
    const store = allStores.find(s => s.id === storeId)
    return store ? [store] : []
  }

  const accessibleStores = getAccessibleStores()

  // Group tabs into sections for sidebar
  const tabGroups = [
    { label: 'Operations', ids: ['home','inventory','checklist','schedule'] },
    { label: 'Commerce',   ids: ['sales','orders','delivery'] },
    { label: 'Insights',   ids: ['cogs','admin'] },
  ]

  return (
    <div style={{ minHeight:'100vh', background: theme.bodyBg, display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ background: theme.headerBg, padding:'0 16px', position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:52, maxWidth:1200, margin:'0 auto' }}>

          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {logoData ? (
              <img src={logoData} alt={orgName} style={{ height:40, maxWidth:120, objectFit:'contain' }} />
            ) : (
              <div style={{ width:40, height:40, borderRadius:8, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'serif', fontSize:22, fontWeight:700, color:'#fff' }}>
                {orgName.charAt(0).toUpperCase()}
              </div>
            )}
            <span style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.8)' }}>{orgName}</span>
          </div>

          {/* Right side */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            {isSuperOwner && allRegions.length > 1 && (
              <select onChange={e => {
                const regionId = e.target.value
                if (!regionId) return
                const first = allStores.find(s => s.regionId === regionId)
                if (first) setViewingStore(first.id)
              }} style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'4px 8px', fontSize:11, cursor:'pointer', fontFamily:'inherit', maxWidth:90 }}>
                <option value="">All</option>
                {allRegions.map(r => (
                  <option key={r.id} value={r.id} style={{ background: theme.headerBg }}>{r.name}</option>
                ))}
              </select>
            )}

            {accessibleStores.length > 1 ? (
              <select value={viewingStore} onChange={e => setViewingStore(e.target.value)}
                style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'4px 8px', fontSize:11, cursor:'pointer', fontFamily:'inherit', maxWidth:110 }}>
                {accessibleStores.map(s => (
                  <option key={s.id} value={s.id} style={{ background: theme.headerBg }}>{s.name}</option>
                ))}
              </select>
            ) : accessibleStores.length === 1 ? (
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.8)', padding:'4px 8px' }}>
                {accessibleStores[0]?.name}
              </span>
            ) : null}

            <ThemeSwitcher currentTheme={currentTheme || 'warm'} onThemeChange={onThemeChange || (() => {})} />

            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <button onClick={() => setShowChangePwd(true)}
                style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>
                Password
              </button>
              <button onClick={auth?.logout}
                style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Mobile tab bar — horizontal scroll, shown on small screens */}
        <div style={{ display:'flex', gap:2, overflowX:'auto', maxWidth:1200, margin:'0 auto', background: theme.tabBg,
          scrollbarWidth:'none', msOverflowStyle:'none' }}
          className="mobile-tabs">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding:'10px 12px', background:'transparent',
              color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.55)',
              border:'none', borderBottom: activeTab === tab.id ? `2px solid ${theme.caramel}` : '2px solid transparent',
              fontSize:11, fontWeight: activeTab === tab.id ? 700 : 400,
              cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', transition:'color 0.15s'
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body — sidebar + content on desktop */}
      <div style={{ display:'flex', flex:1, maxWidth:1200, margin:'0 auto', width:'100%' }}>

        {/* Sidebar — desktop only */}
        <div className="sidebar" style={{ width:180, flexShrink:0, padding:'20px 0', borderRight:'1px solid #EDE0CC' }}>
          {tabGroups.map(group => {
            const groupTabs = tabs.filter(t => group.ids.includes(t.id))
            if (!groupTabs.length) return null
            return (
              <div key={group.label} style={{ marginBottom:20 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#aaa', textTransform:'uppercase', letterSpacing:'0.8px', padding:'0 16px', marginBottom:6 }}>
                  {group.label}
                </div>
                {groupTabs.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                    width:'100%', textAlign:'left', padding:'9px 16px',
                    background: activeTab === tab.id ? 'rgba(200,132,58,0.12)' : 'transparent',
                    color: activeTab === tab.id ? '#2C1810' : '#8B7355',
                    border:'none', borderLeft: activeTab === tab.id ? '3px solid #C8843A' : '3px solid transparent',
                    fontSize:13, fontWeight: activeTab === tab.id ? 700 : 400,
                    cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
                    display:'flex', alignItems:'center', gap:8,
                  }}>
                    {tab.label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        {/* Main content */}
        <div style={{ flex:1, padding:'16px', minWidth:0 }}>
          {children}
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePwd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ width:'100%', maxWidth:400 }}>
            <ChangePassword showToast={showToast || (() => {})} onClose={() => setShowChangePwd(false)} />
          </div>
        </div>
      )}

      {/* CSS for responsive sidebar */}
      <style>{`
        .sidebar { display: flex; flex-direction: column; }
        .mobile-tabs { display: none; }
        @media (max-width: 768px) {
          .sidebar { display: none !important; }
          .mobile-tabs { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
