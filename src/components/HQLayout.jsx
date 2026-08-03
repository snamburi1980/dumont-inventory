import { useState, useEffect } from 'react'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { THEMES, applyTheme } from '../utils/themes'
import ThemeSwitcher from './ThemeSwitcher'
import ChangePassword from './ChangePassword'

const HQ_TABS = [
  { id:'hq_dashboard', label:'Dashboard' },
  { id:'hq_stores',    label:'Stores'    },
  { id:'hq_analytics', label:'Analytics' },
  { id:'hq_users',     label:'Users'     },
  { id:'hq_settings',  label:'Settings'  },
]

export default function HQLayout({
  auth, activeTab, setActiveTab, children,
  currentTheme, onThemeChange, showToast,
  viewingStore, setViewingStore, onViewStoreOps,
}) {
  const [orgConfig,     setOrgConfig]     = useState(null)
  const [allStores,     setAllStores]     = useState([])
  const [showChangePwd, setShowChangePwd] = useState(false)

  const theme    = THEMES[currentTheme] || THEMES.warm
  const orgName  = orgConfig?.name     || 'Dumont'
  const logoData = orgConfig?.logoData || null

  useEffect(() => {
    const orgId = auth?.userConfig?.orgId || 'dumont'
    Promise.all([
      getDoc(doc(db, 'orgs', orgId)),
      getDocs(collection(db, 'stores')),
    ]).then(([orgSnap, storeSnap]) => {
      if (orgSnap.exists()) setOrgConfig(orgSnap.data())
      setAllStores(storeSnap.docs.map(d => ({ id:d.id, ...d.data() })))
    }).catch(() => {})
  }, [auth?.userConfig?.orgId])

  useEffect(() => { if (currentTheme) applyTheme(currentTheme) }, [currentTheme])

  return (
    <div style={{ minHeight:'100vh', background:theme.bodyBg, display:'flex', flexDirection:'column' }}>

      {/* ── Header ── */}
      <div style={{ background:theme.headerBg, padding:'0 16px', position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:52, maxWidth:1200, margin:'0 auto' }}>

          {/* Logo + HQ badge */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {logoData ? (
              <img src={logoData} alt={orgName} style={{ height:40, maxWidth:120, objectFit:'contain' }} />
            ) : (
              <div style={{ width:40, height:40, borderRadius:8, background:'rgba(227,156,116,0.2)', border:'1px solid rgba(227,156,116,0.5)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Bebas Neue", sans-serif', fontSize:24, color:'#E39C74' }}>
                {orgName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <span style={{ fontFamily:'"Bebas Neue", sans-serif', fontSize:18, letterSpacing:3, color:'#fff' }}>{orgName}</span>
              <span style={{ marginLeft:6, fontSize:9, fontWeight:700, color:'#E39C74', background:'rgba(227,156,116,0.2)', borderRadius:4, padding:'2px 7px', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                HQ
              </span>
            </div>
          </div>

          {/* Right side */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* Store selector */}
            {allStores.length > 0 && (
              <>
                <select value={viewingStore} onChange={e => setViewingStore(e.target.value)}
                  style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'5px 10px', fontSize:12, cursor:'pointer', fontFamily:'inherit', maxWidth:140 }}>
                  <option value="" style={{ background:theme.headerBg }}>Select Store…</option>
                  {allStores.map(s => (
                    <option key={s.id} value={s.id} style={{ background:theme.headerBg }}>{s.name}</option>
                  ))}
                </select>
                {viewingStore && (
                  <button onClick={onViewStoreOps}
                    style={{ background:'#C1683C', color:'#fff', border:'none', borderRadius:8, padding:'5px 14px', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit', whiteSpace:'nowrap' }}>
                    View Ops →
                  </button>
                )}
              </>
            )}

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
      </div>

      {/* ── Body ── */}
      <div style={{ display:'flex', flex:1, maxWidth:1200, margin:'0 auto', width:'100%' }}>

        {/* Sidebar */}
        <div style={{ width:180, flexShrink:0, padding:'24px 0', borderRight:'1px solid #E3DDD0' }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#bbb', textTransform:'uppercase', letterSpacing:'1px', padding:'0 16px', marginBottom:10 }}>
            Headquarters
          </div>
          {HQ_TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              width:'100%', textAlign:'left', padding:'10px 16px',
              background: activeTab === tab.id ? 'rgba(200,132,58,0.12)' : 'transparent',
              color: activeTab === tab.id ? '#1A4C48' : '#6B7F78',
              border:'none',
              borderLeft: activeTab === tab.id ? '3px solid #C1683C' : '3px solid transparent',
              fontSize:13, fontWeight: activeTab === tab.id ? 700 : 400,
              cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex:1, padding:'20px 16px', minWidth:0 }}>
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
    </div>
  )
}
