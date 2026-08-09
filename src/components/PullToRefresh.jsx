import { useState, useRef, useEffect } from 'react'

// Native-style pull-to-refresh. Everyone expects this gesture on mobile; without
// it the only way to get fresh data is a browser reload, which feels like a web page.
// Only engages when the scroll container is already at the top, so it never fights
// normal scrolling.

const THRESHOLD = 70   // px pulled before a refresh fires
const MAX_PULL   = 110 // rubber-band ceiling

export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull]           = useState(0)
  const [refreshing, setRefresh]  = useState(false)
  const startY = useRef(0)
  const active = useRef(false)

  useEffect(() => {
    function atTop() {
      return (window.scrollY || document.documentElement.scrollTop || 0) <= 0
    }

    function onTouchStart(e) {
      if (refreshing || !atTop()) { active.current = false; return }
      startY.current = e.touches[0].clientY
      active.current = true
    }

    function onTouchMove(e) {
      if (!active.current || refreshing) return
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) { setPull(0); return }
      if (!atTop()) { active.current = false; setPull(0); return }
      // resistance curve — feels like iOS rather than a linear drag
      const eased = Math.min(MAX_PULL, delta * 0.5)
      setPull(eased)
      if (eased > 6) e.preventDefault()
    }

    async function onTouchEnd() {
      if (!active.current) return
      active.current = false
      if (pull >= THRESHOLD && !refreshing) {
        setRefresh(true)
        setPull(THRESHOLD)
        try { await onRefresh?.() } catch (err) { console.error('pull-to-refresh:', err) }
        setRefresh(false)
      }
      setPull(0)
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove',  onTouchMove,  { passive: false })
    window.addEventListener('touchend',   onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove',  onTouchMove)
      window.removeEventListener('touchend',   onTouchEnd)
    }
  }, [pull, refreshing, onRefresh])

  const ready = pull >= THRESHOLD

  return (
    <div style={{ position:'relative' }}>
      {/* Indicator */}
      <div style={{
        position:'absolute', top:0, left:0, right:0,
        height: pull, overflow:'hidden',
        display:'flex', alignItems:'center', justifyContent:'center',
        pointerEvents:'none', zIndex:5,
        transition: pull === 0 || refreshing ? 'height 0.25s ease' : 'none',
      }}>
        <div style={{
          width:32, height:32, borderRadius:'50%',
          background:'#fff', border:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 2px 8px rgba(0,0,0,0.12)',
          transform:`rotate(${refreshing ? 0 : pull * 3}deg)`,
          animation: refreshing ? 'ptrSpin 0.7s linear infinite' : 'none',
          opacity: Math.min(1, pull / 35),
        }}>
          <span style={{ fontSize:15, color: ready ? '#C1683C' : '#6B7F78' }}>
            {refreshing ? '⟳' : ready ? '↻' : '↓'}
          </span>
        </div>
      </div>

      <div style={{
        transform:`translateY(${pull}px)`,
        transition: pull === 0 || refreshing ? 'transform 0.25s ease' : 'none',
      }}>
        {children}
      </div>

      <style>{`@keyframes ptrSpin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
