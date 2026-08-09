import { useState, useEffect } from 'react'

// Tells staff when the device has lost connection. Firestore still accepts
// writes offline (they queue in IndexedDB and flush on reconnect), so the
// message is reassuring rather than alarming — but silence would erode trust.
export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine !== false)
  const [justReconnected, setJustReconnected] = useState(false)

  useEffect(() => {
    function goOnline() {
      setOnline(true)
      setJustReconnected(true)
      setTimeout(() => setJustReconnected(false), 3000)
    }
    function goOffline() { setOnline(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online && !justReconnected) return null

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 9998,
      background: online ? '#27AE60' : '#8B5A00',
      color: '#fff',
      fontSize: 12.5,
      fontWeight: 700,
      textAlign: 'center',
      padding: '7px 12px',
      letterSpacing: '0.2px',
    }}>
      {online
        ? '✓ Back online — your changes are syncing'
        : '⚠ No connection — you can keep working, changes save when you reconnect'}
    </div>
  )
}
