import { useState, useEffect } from 'react'

// Watches the service worker for a newer build and offers a one-tap update.
//
// Why this matters: the app is installed as a PWA, so phones keep running the
// cached JS until the page reloads. Without this, staff can run a weeks-old
// version and never know — and you can't tell whether a fix "didn't work" or
// simply never reached the device.
//
// The workbox config uses skipWaiting, so a new worker activates on its own and
// fires `controllerchange`. We deliberately do NOT auto-reload on that event:
// blowing away a half-finished checklist or cash entry is worse than running a
// slightly stale build for a few more minutes. We surface a prompt instead.
export default function UpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // A new worker took control → fresh assets are on disk, page needs a reload
    const onControllerChange = () => setUpdateReady(true)
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    let cleanupFocus = () => {}
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return

      // Worker already waiting from a previous visit
      if (reg.waiting && navigator.serviceWorker.controller) setUpdateReady(true)

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          // "installed" + an existing controller means UPDATE, not first install
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateReady(true)
          }
        })
      })

      // Check for a new build now, and whenever the app is brought back to front
      reg.update().catch(() => {})
      const onFocus = () => reg.update().catch(() => {})
      window.addEventListener('focus', onFocus)
      cleanupFocus = () => window.removeEventListener('focus', onFocus)
    }).catch(() => {})

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      cleanupFocus()
    }
  }, [])

  if (!updateReady) return null

  return (
    <div style={{
      position:'fixed', left:12, right:12,
      bottom:`calc(84px + env(safe-area-inset-bottom))`,
      zIndex:9999, background:'#1A4C48', color:'#fff',
      borderRadius:14, padding:'13px 16px',
      display:'flex', alignItems:'center', gap:12,
      boxShadow:'0 6px 24px rgba(0,0,0,0.3)',
      animation:'updateSlide 0.3s cubic-bezier(0.16,1,0.3,1)',
      maxWidth:460, margin:'0 auto',
    }}>
      <span style={{ fontSize:20 }}>🎉</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13.5, fontWeight:700 }}>New version ready</div>
        <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.7)' }}>Tap update when you're not mid-task</div>
      </div>
      <button onClick={() => window.location.reload()}
        style={{
          background:'#E39C74', color:'#1A4C48', border:'none', borderRadius:9,
          padding:'9px 16px', cursor:'pointer', fontSize:13, fontWeight:800,
          fontFamily:'inherit', flexShrink:0,
        }}>
        Update
      </button>
      <style>{`@keyframes updateSlide { from { transform: translateY(120%); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
    </div>
  )
}
