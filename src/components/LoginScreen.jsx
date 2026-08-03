import { useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth as firebaseAuth } from '../firebase/config'
import monty from '../assets/monty.png'

// Hand-drawn 4-point sparkle from the brand graphics
function Sparkle({ size = 22, color = '#E39C74', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} aria-hidden="true">
      <path d="M12 0 C13 7 17 11 24 12 C17 13 13 17 12 24 C11 17 7 13 0 12 C7 11 11 7 12 0 Z" fill={color}/>
    </svg>
  )
}

export default function LoginScreen({ auth }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [resetMsg, setResetMsg] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setResetMsg('')
    auth.login(email, password)
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setResetMsg('Enter your email address above first, then tap "Forgot password?" again.')
      return
    }
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim())
      setResetMsg(`Password reset link sent to ${email.trim()}. Check your inbox (and spam), set a new password, then sign in here.`)
    } catch(e) {
      // Same message regardless of whether the account exists — don't leak which emails are registered
      setResetMsg(`If an account exists for ${email.trim()}, a reset link has been sent. Check your inbox and spam folder.`)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1A4C48',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Corner brand graphics */}
      <Sparkle size={30} color="#E39C74" style={{ position:'absolute', top:36, left:40 }} />
      <Sparkle size={16} color="#FBBC55" style={{ position:'absolute', top:76, left:82 }} />
      <Sparkle size={22} color="#FBBC55" style={{ position:'absolute', top:48, right:60 }} />
      <Sparkle size={13} color="#E39C74" style={{ position:'absolute', top:92, right:110 }} />
      <Sparkle size={18} color="#E39C74" style={{ position:'absolute', bottom:110, left:56 }} />
      {/* dotted orbit arc, like the brand cover */}
      <svg width="220" height="220" viewBox="0 0 220 220" fill="none" aria-hidden="true"
        style={{ position:'absolute', bottom:-60, left:-60, opacity:0.5 }}>
        <circle cx="110" cy="110" r="100" stroke="#E39C74" strokeWidth="1.5" strokeDasharray="2 8"/>
      </svg>

      {/* Monty the mascot — bottom right corner */}
      <img src={monty} alt="" aria-hidden="true" style={{
        position: 'absolute',
        bottom: -14,
        right: 18,
        height: 190,
        transform: 'rotate(6deg)',
        filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.35))',
        pointerEvents: 'none',
      }}/>

      <div style={{ width: '100%', maxWidth: 380, position:'relative' }}>

        {/* Wordmark — spaced caps like the brand logo */}
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{
            fontFamily:'"Bebas Neue", sans-serif', fontSize:52, color:'#fff',
            letterSpacing:14, textIndent:14, lineHeight:1,
          }}>
            DUMONT
          </div>
          <div style={{
            fontFamily:'Quicksand, sans-serif', fontSize:12, fontWeight:600,
            color:'#E39C74', letterSpacing:4, textIndent:4, marginTop:8, textTransform:'uppercase',
          }}>
            Creamery &amp; Café
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:10, letterSpacing:1 }}>
            INVENTORY v18
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(227,156,116,0.35)',
          borderRadius: 16,
          padding: 28,
          backdropFilter: 'blur(4px)',
        }}>
          <h2 style={{
            color:'#fff', fontSize:22, fontWeight:400, marginBottom:20,
            fontFamily:'"Bebas Neue", sans-serif', letterSpacing:2,
          }}>
            Sign in to continue
          </h2>

          {auth.error && (
            <div style={{
              background: 'rgba(197,61,24,0.2)',
              border: '1px solid rgba(197,61,24,0.4)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#ffb09a',
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
            <button type="submit" style={{
              width:'100%', background:'#E39C74', color:'#1A4C48', border:'none',
              borderRadius:8, padding:'13px', cursor:'pointer', fontSize:15,
              fontFamily:'"Bebas Neue", sans-serif', letterSpacing:2,
            }}>
              Sign In
            </button>
          </form>

          {resetMsg && (
            <div style={{
              background: 'rgba(39,174,96,0.15)',
              border: '1px solid rgba(39,174,96,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#7ee2a8',
              fontSize: 12,
              marginTop: 14,
              lineHeight: 1.5,
            }}>
              {resetMsg}
            </div>
          )}

          <button type="button" onClick={handleForgotPassword}
            style={{
              width:'100%', marginTop:14, background:'none', border:'none',
              color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:12,
              fontFamily:'inherit', textDecoration:'underline',
            }}>
            Forgot password?
          </button>
        </div>

        {/* Checkered brand strip */}
        <div style={{
          marginTop: 24,
          height: 8,
          backgroundImage: 'repeating-linear-gradient(90deg, #E39C74 0 8px, transparent 8px 16px)',
          opacity: 0.55,
          borderRadius: 2,
        }}/>

        <div style={{ textAlign:'center', marginTop:14, fontSize:12, color:'rgba(255,255,255,0.3)' }}>
          v18 · Dumont Creamery &amp; Café
        </div>
      </div>
    </div>
  )
}
