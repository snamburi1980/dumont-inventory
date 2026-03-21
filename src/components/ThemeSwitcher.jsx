import { useState } from 'react'
import { THEMES, applyTheme } from '../utils/themes'

export default function ThemeSwitcher({ currentTheme, onThemeChange }) {
  const [open, setOpen] = useState(false)

  function selectTheme(key) {
    applyTheme(key)
    onThemeChange(key)
    setOpen(false)
  }

  return (
    <div style={{ position:'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background:'rgba(255,255,255,0.1)',
          border:'1px solid rgba(255,255,255,0.2)',
          borderRadius:6, padding:'4px 10px',
          color:'rgba(255,255,255,0.8)',
          cursor:'pointer', fontSize:11,
          display:'flex', alignItems:'center', gap:6
        }}
        title="Change theme"
      >
        <div style={{
          width:10, height:10, borderRadius:'50%',
          background: THEMES[currentTheme]?.accentText || '#fff'
        }}/>
        Theme
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position:'fixed', inset:0, zIndex:998 }}
          />
          <div style={{
            position:'absolute', right:0, top:'calc(100% + 8px)',
            background:'#fff', border:'1px solid #E0E0E0',
            borderRadius:12, padding:12, zIndex:999,
            boxShadow:'0 8px 24px rgba(0,0,0,0.15)',
            minWidth:200
          }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', marginBottom:10, letterSpacing:'0.5px' }}>
              Choose Theme
            </div>
            {Object.entries(THEMES).map(([key, theme]) => (
              <div
                key={key}
                onClick={() => selectTheme(key)}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'10px 12px', borderRadius:8, cursor:'pointer',
                  background: currentTheme === key ? theme.cream : 'transparent',
                  border: currentTheme === key ? `1.5px solid ${theme.caramel}` : '1.5px solid transparent',
                  marginBottom:4
                }}
              >
                {/* Color swatches */}
                <div style={{ display:'flex', gap:3 }}>
                  {[theme.headerBg, theme.caramel, theme.greenOk].map((c,i) => (
                    <div key={i} style={{ width:14, height:14, borderRadius:'50%', background:c }}/>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:theme.dark }}>{theme.name}</div>
                </div>
                {currentTheme === key && (
                  <div style={{ marginLeft:'auto', fontSize:14, color:theme.caramel }}>✓</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
