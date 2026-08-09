import { useState, useEffect } from 'react'

// Promise-based confirm that replaces window.confirm().
//
//   if (!await confirm({ title:'Delete store?', message:'…', danger:true })) return
//
// A single <ConfirmHost/> is mounted in main.jsx; any component can call
// confirm() without prop drilling. Falls back to window.confirm if the host
// somehow isn't mounted, so a call site can never silently do nothing.

let hostSetState = null
let pendingResolve = null

export function confirm(options) {
  const opts = typeof options === 'string' ? { message: options } : (options || {})
  return new Promise(resolve => {
    if (!hostSetState) {
      resolve(window.confirm(opts.message || 'Are you sure?'))
      return
    }
    pendingResolve = resolve
    hostSetState({
      open: true,
      title:   opts.title   || 'Are you sure?',
      message: opts.message || '',
      confirmLabel: opts.confirmLabel || (opts.danger ? 'Delete' : 'Confirm'),
      cancelLabel:  opts.cancelLabel  || 'Cancel',
      danger:  !!opts.danger,
    })
  })
}

const CLOSED = { open: false, title: '', message: '', confirmLabel: '', cancelLabel: '', danger: false }

export function ConfirmHost() {
  const [state, setState] = useState(CLOSED)

  useEffect(() => {
    hostSetState = setState
    return () => { hostSetState = null }
  }, [])

  function close(result) {
    setState(CLOSED)
    const r = pendingResolve
    pendingResolve = null
    if (r) r(result)
  }

  // Escape closes (cancel) — expected behaviour for a modal
  useEffect(() => {
    if (!state.open) return
    function onKey(e) {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter')  close(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.open])

  if (!state.open) return null

  const accent = state.danger ? '#C53D18' : '#1A4C48'

  return (
    <div
      onClick={() => close(false)}
      style={{
        position:'fixed', inset:0, zIndex:10000,
        background:'rgba(20,35,33,0.55)',
        display:'flex', alignItems:'flex-end', justifyContent:'center',
        padding:0,
        animation:'confirmFade 0.15s ease',
        backdropFilter:'blur(2px)',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true"
        style={{
          background:'#fff', width:'100%', maxWidth:440,
          borderRadius:'20px 20px 0 0',
          padding:`22px 20px calc(20px + env(safe-area-inset-bottom))`,
          boxShadow:'0 -8px 40px rgba(0,0,0,0.25)',
          animation:'confirmSlide 0.22s cubic-bezier(0.16,1,0.3,1)',
        }}>
        {/* grab handle — signals "sheet" like native apps */}
        <div style={{ width:38, height:4, background:'#E3DDD0', borderRadius:2, margin:'0 auto 16px' }} />

        <div style={{
          fontFamily:'"Bebas Neue", sans-serif', fontSize:22, letterSpacing:1,
          color: accent, marginBottom: state.message ? 8 : 18, textAlign:'center',
        }}>
          {state.title}
        </div>

        {state.message && (
          <div style={{ fontSize:13.5, color:'#5B6B66', lineHeight:1.6, marginBottom:20, textAlign:'center', whiteSpace:'pre-line' }}>
            {state.message}
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
          <button onClick={() => close(true)}
            style={{
              width:'100%', background:accent, color:'#fff', border:'none',
              borderRadius:12, padding:'15px', cursor:'pointer',
              fontSize:15, fontWeight:700, fontFamily:'inherit',
            }}>
            {state.confirmLabel}
          </button>
          <button onClick={() => close(false)}
            style={{
              width:'100%', background:'#fff', color:'#5B6B66',
              border:'1px solid #E3DDD0', borderRadius:12, padding:'15px',
              cursor:'pointer', fontSize:15, fontWeight:600, fontFamily:'inherit',
            }}>
            {state.cancelLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes confirmFade  { from { opacity:0 } to { opacity:1 } }
        @keyframes confirmSlide { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  )
}
