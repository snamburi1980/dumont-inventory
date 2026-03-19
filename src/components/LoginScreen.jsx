import { useState } from 'react'

export default function LoginScreen({ auth }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [isSignup, setIsSignup] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    auth.login(email, password)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:42, color:'#fff', letterSpacing:2 }}>
            Dumont
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginTop:4 }}>
            Creamery & Café — Inventory v18
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 28,
        }}>
          <h2 style={{ color:'#fff', fontSize:18, fontWeight:600, marginBottom:20 }}>
            Sign in to continue
          </h2>

          {auth.error && (
            <div style={{
              background: 'rgba(231,76,60,0.15)',
              border: '1px solid rgba(231,76,60,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#ff6b6b',
              fontSize: 13,
              marginBottom: 16,
            }}>
              {auth.error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:12 }}>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', color:'#fff' }}
                required
              />
            </div>
            <div style={{ marginBottom:20 }}>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', color:'#fff' }}
                required
              />
            </div>
            <button type="submit" className="btn-secondary" style={{ width:'100%' }}>
              Sign In
            </button>
          </form>
        </div>

        <div style={{ textAlign:'center', marginTop:20, fontSize:12, color:'rgba(255,255,255,0.3)' }}>
          v18 · Dumont Creamery & Café
        </div>
      </div>
    </div>
  )
}
