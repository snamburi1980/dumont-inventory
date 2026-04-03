export default function TipBanner({ message }) {
  return (
    <div style={{
      float: 'right',
      clear: 'right',
      width: 200,
      marginLeft: 16,
      marginBottom: 12,
      background: '#FFF8F0',
      border: '1px solid #FFE0B2',
      borderRadius: 10,
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 6,
    }}
    className="tip-banner">
      <span style={{ fontSize:14, flexShrink:0 }}>💡</span>
      <span style={{ fontSize:11, color:'#8B6914', lineHeight:1.5 }}>{message}</span>
      <style>{`
        @media (max-width: 768px) {
          .tip-banner {
            float: none !important;
            width: auto !important;
            margin-left: 0 !important;
            margin-bottom: 14px !important;
          }
        }
      `}</style>
    </div>
  )
}
