export default function TipBanner({ message }) {
  return (
    <div style={{
      background: '#FFF8F0',
      border: '1px solid #FFE0B2',
      borderRadius: 10,
      padding: '10px 14px',
      marginBottom: 14,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
      <span style={{ fontSize: 12, color: '#8B6914', lineHeight: 1.5 }}>{message}</span>
    </div>
  )
}
