// Skeleton placeholders. Showing the SHAPE of incoming content instead of the
// word "Loading…" makes the app feel markedly faster — the screen doesn't jump
// when data lands, and there's no blank gap to stare at.

export function SkeletonLine({ w = '100%', h = 12, style = {} }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: 6, ...style }} />
}

export function SkeletonCard({ lines = 2 }) {
  return (
    <div style={{
      background:'#fff', border:'1px solid var(--border)', borderRadius:12,
      padding:'14px 16px', marginBottom:10,
    }}>
      <SkeletonLine w="55%" h={13} style={{ marginBottom:9 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} w={i === lines - 1 ? '35%' : '80%'} h={10} style={{ marginBottom: 6 }} />
      ))}
    </div>
  )
}

export function SkeletonList({ count = 4, lines = 2 }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} lines={lines} />)}
    </div>
  )
}

// Matches the 2- or 3-across KPI/stat card rows used on Home, COGS and Cash
export function SkeletonStats({ count = 4, columns = 2 }) {
  return (
    <div aria-busy="true" style={{ display:'grid', gridTemplateColumns:`repeat(${columns},1fr)`, gap:10, marginBottom:14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background:'#fff', border:'1px solid var(--border)', borderRadius:12,
          padding:'16px', textAlign:'center',
        }}>
          <SkeletonLine w="55%" h={20} style={{ margin:'0 auto 8px' }} />
          <SkeletonLine w="70%" h={9}  style={{ margin:'0 auto' }} />
        </div>
      ))}
    </div>
  )
}

// Rows for the inventory / history tables
export function SkeletonRows({ count = 6 }) {
  return (
    <div aria-busy="true" style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          display:'flex', alignItems:'center', gap:12, padding:'13px 16px',
          borderBottom: i < count - 1 ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ flex:1 }}>
            <SkeletonLine w={`${45 + (i % 3) * 12}%`} h={12} style={{ marginBottom:6 }} />
            <SkeletonLine w="28%" h={9} />
          </div>
          <SkeletonLine w={52} h={22} style={{ borderRadius:8 }} />
        </div>
      ))}
    </div>
  )
}
