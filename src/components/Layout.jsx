import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { THEMES, applyTheme } from '../utils/themes'
import ThemeSwitcher from './ThemeSwitcher'
import ChangePassword from './ChangePassword'

export default function Layout({ auth, tabs, activeTab, setActiveTab, viewingStore, setViewingStore, children, currentTheme, onThemeChange, showToast, onBackToHQ }) {
  const [orgConfig,     setOrgConfig]     = useState(null)
  const [allStores,     setAllStores]     = useState([])
  const [allRegions,    setAllRegions]    = useState([])
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [selectedRegion,setSelectedRegion]= useState('')
  const [showUserMenu,  setShowUserMenu]  = useState(false)
  const userMenuRef = useRef(null)
  const userConfig = auth?.userConfig

  useEffect(() => { loadOrgConfig(); loadStores() }, [userConfig?.orgId])
  useEffect(() => { if (currentTheme) applyTheme(currentTheme) }, [currentTheme])
  useEffect(() => {
    function onFocus() { loadStores() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

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

  const isSuperOwner = auth?.isSuperOwner?.()
  const role         = userConfig?.role || ''
  const isStaff      = role === 'staff'
  const theme        = THEMES[currentTheme] || THEMES.warm
  const logoData     = orgConfig?.logoData || null
  const orgName      = orgConfig?.name     || 'Dumont'

  const userName     = userConfig?.name || auth?.user?.email || ''
  const userInitials = userName.trim()
    ? userName.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

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

  const accessibleStores = getAccessibleStores().filter(s => {
    if (!isSuperOwner) return true
    if (!selectedRegion) return true
    return s.regionId === selectedRegion
  })

  const tabGroups = isStaff ? [
    { label: 'Operations', ids: ['home','checklist','icecreamlog','inventory'], disabled: false },
  ] : [
    { label: 'Operations', ids: ['home','checklist','icecreamlog','inventory','schedule','cashregister','transfers'], disabled: false },
    { label: 'Commerce',   ids: ['commerce'], disabled: false },
    { label: 'Admin',      ids: ['admin'],    disabled: false },
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
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {isSuperOwner && allRegions.length > 1 && (
              <select value={selectedRegion} onChange={e => {
                const regionId = e.target.value
                setSelectedRegion(regionId)
                if (regionId) {
                  const first = allStores.find(s => s.regionId === regionId)
                  if (first) setViewingStore(first.id)
                }
              }} style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'4px 8px', fontSize:11, cursor:'pointer', fontFamily:'inherit', maxWidth:90 }}>
                <option value="">All Regions</option>
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

            {/* Theme switcher — desktop only */}
            <div className="desktop-only">
              <ThemeSwitcher currentTheme={currentTheme || 'warm'} onThemeChange={onThemeChange || (() => {})} />
            </div>

            {/* User avatar button */}
            <div ref={userMenuRef} style={{ position:'relative' }}>
              <button
                onClick={() => setShowUserMenu(v => !v)}
                title={userName}
                style={{
                  width:36, height:36, borderRadius:'50%',
                  background: showUserMenu ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
                  color:'#fff', border:'2px solid rgba(255,255,255,0.4)',
                  fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  transition:'background 0.15s', flexShrink:0,
                }}>
                {userInitials}
              </button>

              {showUserMenu && (
                <div style={{
                  position:'absolute', right:0, top:44,
                  background:'#fff', border:'1px solid #EDE0CC',
                  borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)',
                  minWidth:210, zIndex:300,
                }}>
                  {/* User info */}
                  <div style={{ padding:'14px 16px', borderBottom:'1px solid #EDE0CC' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#2C1810' }}>{userName}</div>
                    <div style={{ fontSize:11, color:'#8B7355', marginTop:2, textTransform:'capitalize' }}>
                      {(role || 'staff').replace(/_/g,' ')}
                    </div>
                  </div>

                  <div style={{ padding:'6px 0' }}>
                    {/* Theme — mobile only (desktop has it in header) */}
                    <div className="mobile-only" style={{ padding:'6px 16px 2px', borderBottom:'1px solid #F5EFE8', marginBottom:4 }}>
                      <div style={{ fontSize:11, color:'#8B7355', marginBottom:6, fontWeight:600 }}>Theme</div>
                      <ThemeSwitcher currentTheme={currentTheme || 'warm'} onThemeChange={v => { if (onThemeChange) onThemeChange(v); setShowUserMenu(false) }} />
                    </div>

                    <button
                      onClick={() => { setShowChangePwd(true); setShowUserMenu(false) }}
                      style={{ width:'100%', textAlign:'left', padding:'10px 16px', background:'none', border:'none', fontSize:13, color:'#2C1810', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:15 }}>🔑</span> Change Password
                    </button>

                    {onBackToHQ && (
                      <button
                        onClick={() => { onBackToHQ(); setShowUserMenu(false) }}
                        style={{ width:'100%', textAlign:'left', padding:'10px 16px', background:'none', border:'none', fontSize:13, color:'#C8843A', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:15 }}>🏢</span> Back to HQ
                      </button>
                    )}

                    <div style={{ borderTop:'1px solid #F5EFE8', marginTop:4 }}>
                      <button
                        onClick={auth?.logout}
                        style={{ width:'100%', textAlign:'left', padding:'10px 16px', background:'none', border:'none', fontSize:13, color:'#C62828', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:15 }}>🚪</span> Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display:'flex', flex:1, maxWidth:1200, margin:'0 auto', width:'100%' }}>

        {/* Sidebar — desktop only */}
        <div className="sidebar" style={{ width:190, flexShrink:0, padding:'20px 0', borderRight:'1px solid #EDE0CC' }}>
          {onBackToHQ && (
            <button onClick={onBackToHQ} style={{
              width:'100%', textAlign:'left', padding:'8px 16px', background:'none',
              border:'none', borderBottom:'1px solid #EDE0CC', fontSize:12, fontWeight:600,
              color:'#C8843A', cursor:'pointer', fontFamily:'inherit', marginBottom:8,
              display:'flex', alignItems:'center', gap:6,
            }}>
              🏢 Back to HQ
            </button>
          )}

          {tabGroups.map(group => {
            const groupTabs  = tabs.filter(t => group.ids.includes(t.id))
            const isDisabled = group.disabled === true
            if (!groupTabs.length) return null
            return (
              <div key={group.label} style={{ marginBottom:20 }}>
                <div style={{ fontSize:9, fontWeight:700, color: isDisabled ? '#ccc' : '#aaa', textTransform:'uppercase', letterSpacing:'0.8px', padding:'0 16px', marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>
                  {group.label}
                  {isDisabled && <span style={{ fontSize:8, background:'#eee', color:'#bbb', borderRadius:3, padding:'1px 4px' }}>Soon</span>}
                </div>
                {groupTabs.map(tab => (
                  <button key={tab.id}
                    onClick={() => !isDisabled && setActiveTab(tab.id)}
                    style={{
                      width:'100%', textAlign:'left', padding:'9px 16px',
                      background: !isDisabled && activeTab === tab.id ? 'rgba(200,132,58,0.12)' : 'transparent',
                      color: isDisabled ? '#ccc' : activeTab === tab.id ? '#2C1810' : '#8B7355',
                      border:'none',
                      borderLeft: !isDisabled && activeTab === tab.id ? '3px solid #C8843A' : '3px solid transparent',
                      fontSize:13, fontWeight: !isDisabled && activeTab === tab.id ? 700 : 400,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      fontFamily:'inherit', transition:'all 0.15s',
                      display:'flex', alignItems:'center', gap:9,
                    }}>
                    <span style={{ fontSize:15, opacity: isDisabled ? 0.4 : 1 }}>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        {/* Main content */}
        <div className="main-content" style={{ flex:1, padding:'16px', minWidth:0 }}>
          {children}
        </div>
      </div>

      {/* Bottom nav — mobile only */}
      <div className="mobile-bottom-nav" style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:100,
        background: theme.headerBg,
        boxShadow:'0 -2px 12px rgba(0,0,0,0.2)',
        display:'flex', overflowX:'auto',
        scrollbarWidth:'none', msOverflowStyle:'none',
        borderTop:'1px solid rgba(255,255,255,0.1)',
      }}>
        {tabs.map(tab => {
          const group      = tabGroups.find(g => g.ids.includes(tab.id))
          const isDisabled = group?.disabled === true
          const isActive   = activeTab === tab.id
          return (
            <button key={tab.id}
              onClick={() => !isDisabled && setActiveTab(tab.id)}
              style={{
                flex:'0 0 auto', minWidth:68, padding:'10px 8px 8px',
                background:'transparent', border:'none', cursor: isDisabled ? 'not-allowed' : 'pointer',
                display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                borderTop: isActive ? `2px solid ${theme.caramel || '#C8843A'}` : '2px solid transparent',
                transition:'all 0.15s',
              }}>
              <span style={{ fontSize:20, opacity: isDisabled ? 0.25 : 1, lineHeight:1 }}>{tab.icon}</span>
              <span style={{
                fontSize:11, fontWeight: isActive ? 700 : 400, fontFamily:'inherit',
                color: isDisabled ? 'rgba(255,255,255,0.2)' : isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                whiteSpace:'nowrap',
              }}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Change Password Modal */}
      {showChangePwd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ width:'100%', maxWidth:400 }}>
            <ChangePassword showToast={showToast || (() => {})} onClose={() => setShowChangePwd(false)} />
          </div>
        </div>
      )}

      <style>{`
        .sidebar            { display: flex; flex-direction: column; }
        .mobile-bottom-nav  { display: none !important; }
        .desktop-only       { display: flex; }
        .mobile-only        { display: none; }
        @media (max-width: 768px) {
          .sidebar           { display: none !important; }
          .mobile-bottom-nav { display: flex !important; }
          .mobile-only       { display: block !important; }
          .desktop-only      { display: none !important; }
          .main-content      { padding: 16px 16px 80px !important; }
        }
        .mobile-bottom-nav::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
