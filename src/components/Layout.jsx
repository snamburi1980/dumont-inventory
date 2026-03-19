import { STORES } from '../data/inventory'

export default function Layout({ auth, tabs, activeTab, setActiveTab, viewingStore, setViewingStore, children }) {
  const store = STORES[viewingStore] || {}

  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{
        background: 'var(--dark)',
        padding: '12px 16px 0',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:22, color:'#fff' }}>Dumont</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>v18</span>
            {auth.isSuperOwner() ? (
              <select
                value={viewingStore}
                onChange={e => setViewingStore(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '4px 8px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {Object.entries(STORES).map(([id, s]) => (
                  <option key={id} value={id} style={{ background:'#2C1810' }}>{s.name}</option>
                ))}
              </select>
            ) : (
              <span style={{
                background: 'rgba(200,132,58,0.3)',
                border: '1px solid rgba(200,132,58,0.5)',
                color: '#D4A843',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
              }}>
                {store.name || viewingStore}
              </span>
            )}
            <button
              onClick={auth.logout}
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.7)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="tab-bar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, padding:'16px 16px 40px', maxWidth:900, width:'100%', margin:'0 auto' }}>
        {children}
      </div>
    </div>
  )
}
