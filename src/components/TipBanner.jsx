import monty from '../assets/monty.png'

export default function TipBanner({ message }) {
  return (
    <div style={{
      background: '#EEE3D3',
      border: '1px solid #E3D3BB',
      borderRadius: 12,
      padding: '10px 14px',
      marginBottom: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <img src={monty} alt="" aria-hidden="true"
        style={{ height: 38, flexShrink: 0, transform: 'rotate(-6deg)' }} />
      <span style={{ fontSize: 12, color: '#1A4C48', lineHeight: 1.5 }}>
        <span style={{ fontFamily:'"Bebas Neue", sans-serif', letterSpacing:1, color:'#C1683C', marginRight:6 }}>Monty says:</span>
        {message}
      </span>
    </div>
  )
}
