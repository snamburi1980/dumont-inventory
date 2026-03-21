import { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { STORES } from '../data/inventory'
import { THEMES, applyTheme } from '../utils/themes'
import ThemeSwitcher from './ThemeSwitcher'

export default function Layout({ auth, tabs, activeTab, setActiveTab, viewingStore, setViewingStore, children, currentTheme, onThemeChange }) {
  const [orgConfig, setOrgConfig] = useState(null)
  const userConfig = auth?.userConfig

  useEffect(() => { loadOrgConfig() }, [userConfig?.orgId])
  
  // Apply theme whenever it changes
  useEffect(() => {
    if (currentTheme) applyTheme(currentTheme)
  }, [currentTheme])

  async function loadOrgConfig() {
    const orgId = userConfig?.orgId || 'dumont'
    try {
      const snap = await getDoc(doc(db, 'orgs', orgId))
      if (snap.exists()) setOrgConfig(snap.data())
    } catch(e) {}
  }

  const isSuperOwner = auth?.isSuperOwner?.()
  const role         = userConfig?.role || ''

  function getAccessibleStores() {
    if (isSuperOwner || role === 'regional_owner') {
      return Object.entries(STORES).map(([id, s]) => ({ id, ...s }))
    }
    const storeId = userConfig?.storeId || userConfig?.store || 'coppell'
    const store   = STORES[storeId] || { name: storeId }
    return [{ id: storeId, ...store }]
  }

  const accessibleStores = getAccessibleStores()
  const logoData         = orgConfig?.logoData || null
  const orgName          = orgConfig?.name     || 'Dumont'
  
  // Get current theme colors
  const theme = THEMES[currentTheme] || THEMES.warm

  return (
    <div style={{ minHeight:'100vh', background: theme.bodyBg }}>

      {/* Header */}
      <div style={{
        background:    theme.headerBg,
        padding:      '0 16px',
        position:     'sticky', top:0, zIndex:100,
        boxShadow:    '0 2px 8px rgba(0,0,0,0.15)',
        transition:   'background 0.3s'
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:52, maxWidth:900, margin:'0 auto' }}>

          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {logoData ? (
              <img src={logoData} alt={orgName} style={{ height:36, width:36, borderRadius:8, objectFit:'contain', background:'rgba(255,255,255,0.1)' }} />
            ) : (
              <div style={{ width:36, height:36, borderRadius:8, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'serif', fontSize:22, fontWeight:700, color:'#fff' }}>
                {orgName.charAt(0).toUpperCase()}
              </div>
            )}
            <span style={{ fontSize:16, fontWeight:700, color:'#fff', fontFamily:'serif' }}>
              {orgName}
            </span>
          </div>

          {/* Right side */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {accessibleStores.length > 1 ? (
              <select
                value={viewingStore}
                onChange={e => setViewingStore(e.target.value)}
                style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'5px 10px', fontSize:12, cursor:'pointer', fontFamily:'inherit', maxWidth:120 }}
              >
                {accessibleStores.map(s => (
                  <option key={s.id} value={s.id} style={{ background: theme.headerBg }}>{s.name}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.8)', padding:'5px 10px' }}>
                {accessibleStores[0]?.name || viewingStore}
              </span>
            )}

            <ThemeSwitcher currentTheme={currentTheme || 'warm'} onThemeChange={onThemeChange || (() => {})} />

            <button
              onClick={auth?.logout}
              style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'5px 10px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display:'flex', gap:2, overflowX:'auto', maxWidth:900, margin:'0 auto', background: theme.tabBg, transition:'background 0.3s' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding:'10px 14px',
                background:'transparent',
                color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.55)',
                border:'none',
                borderBottom: activeTab === tab.id ? `2px solid ${theme.caramel}` : '2px solid transparent',
                fontSize:12, fontWeight: activeTab === tab.id ? 700 : 400,
                cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit',
                transition:'color 0.15s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding:'16px', maxWidth:900, margin:'0 auto' }}>
        {children}
      </div>
    </div>
  )
}
