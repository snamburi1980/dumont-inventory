import { useState, useEffect } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const APP_BASE = 'https://snamburi1980.github.io/dumont-inventory/'

export default function OnboardingScreen({ token, email, storeName, storeId, orgId, role: roleProp }) {
  const assignedRole  = roleProp || 'store_owner'
  const isStaffOrMgr  = assignedRole === 'staff' || assignedRole === 'manager'
  const [step,        setStep]        = useState('form')   // form | seeding | done
  const [name,        setName]        = useState('')
  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [error,       setError]       = useState('')
  const [saving,      setSaving]      = useState(false)
  const [baseItems,   setBaseItems]   = useState([])
  const [seedItems,   setSeedItems]   = useState([])
  const [seeding,     setSeeding]     = useState(false)
  const [tokenValid,  setTokenValid]  = useState(null)  // null=checking, true, false

  // Validate token on mount (without auth — just check URL params are complete)
  useEffect(() => {
    if (!token || !email || !storeId) {
      setTokenValid(false)
    } else {
      setTokenValid(true)
    }
  }, [token, email, storeId])

  // Load base items for seed step
  async function loadBaseItems() {
    try {
      const snap = await getDocs(collection(db, 'orgs', orgId || 'dumont', 'items'))
      const items = snap.docs.map(d => ({ id: d.id, ...d.data(), quantity: 0 }))
      setBaseItems(items)
      setSeedItems(items.map(i => ({ ...i })))
    } catch(e) {
      console.error('Could not load base items', e)
      setBaseItems([])
      setSeedItems([])
    }
  }

  async function handleCreateAccount(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Please enter your full name'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setSaving(true)
    try {
      // 1. Create Firebase Auth account
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      const uid  = cred.user.uid
      const emailKey = email.replace(/\./g,'_').replace(/@/g,'_at_')

      // 2. Write correct Firestore user doc immediately (before loadUserConfig runs)
      await setDoc(doc(db, 'users', emailKey), {
        uid,
        email,
        name:      name.trim(),
        role:      assignedRole,
        storeId,
        store:     storeId,
        orgId:     orgId || 'dumont',
        status:    'active',
        forcePasswordChange: false,
        createdAt: Date.now(),
      })

      // 3. Validate invitation token and update statuses (now authenticated)
      try {
        const invSnap = await getDoc(doc(db, 'invitations', token))
        if (invSnap.exists()) {
          const inv = invSnap.data()
          if (inv.status === 'pending' && inv.expiresAt > Date.now()) {
            await updateDoc(doc(db, 'invitations', token), { status: 'accepted', acceptedAt: Date.now() })
            await updateDoc(doc(db, 'stores', storeId), { status: 'active' })
          }
        }
      } catch(e) {
        console.warn('Could not update invitation/store status', e)
      }

      // 4. Staff/manager skip inventory seeding — go straight to done
      if (isStaffOrMgr) {
        setStep('done')
        return
      }
      await loadBaseItems()
      setStep('seeding')
    } catch(e) {
      if (e.code === 'auth/email-already-in-use') setError('An account with this email already exists. Please sign in instead.')
      else if (e.code === 'auth/weak-password') setError('Password must be at least 6 characters.')
      else setError('Something went wrong. Please try again.')
      console.error(e)
    }
    setSaving(false)
  }

  async function handleSeedInventory() {
    setSeeding(true)
    try {
      // Build stock object matching existing inventory format
      const stockData = {}
      seedItems.forEach(item => {
        stockData[item.id] = {
          id:       item.id,
          name:     item.name,
          category: item.category || '',
          unit:     item.unit || item.uom || 'unit',
          cost:     item.cost || item.defaultCost || 0,
          par:      item.par || 0,
          stock:    Number(item.quantity) || 0,
        }
      })
      await setDoc(doc(db, 'stores', storeId, 'inventory', 'stock'), stockData)
      setStep('done')
    } catch(e) {
      console.error('Seed failed', e)
      setStep('done') // proceed anyway, they can update inventory manually
    }
    setSeeding(false)
  }

  function handleSkipSeed() {
    setStep('done')
  }

  function handleComplete() {
    // Clear token from URL so normal app flow takes over
    window.history.replaceState({}, '', window.location.pathname)
    window.location.reload()
  }

  const inp = { width:'100%', padding:'11px 12px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:14, marginBottom:12, boxSizing:'border-box', background:'#FDF6EC' }
  const btnPrimary = { width:'100%', background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'13px', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'inherit' }
  const card = { background:'#fff', border:'1px solid #EDE0CC', borderRadius:14, padding:'24px', width:'100%', maxWidth:420 }

  // ── Invalid token ──────────────────────────────────────────
  if (tokenValid === false) {
    return (
      <div style={{ minHeight:'100vh', background:'#FDF6EC', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ ...card, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
          <div style={{ fontSize:17, fontWeight:700, color:'#2C1810', marginBottom:8 }}>Invalid Invitation Link</div>
          <div style={{ fontSize:13, color:'#8B7355', marginBottom:20 }}>This link is missing required information or has already been used. Please contact your administrator for a new invitation.</div>
          <a href={APP_BASE} style={{ ...btnPrimary, display:'block', textDecoration:'none', textAlign:'center' }}>Go to App</a>
        </div>
      </div>
    )
  }

  // ── Checking ───────────────────────────────────────────────
  if (tokenValid === null) {
    return (
      <div style={{ minHeight:'100vh', background:'#FDF6EC', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ fontSize:14, color:'#8B7355' }}>Validating invitation...</div>
      </div>
    )
  }

  // ── Step: Done ─────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div style={{ minHeight:'100vh', background:'#FDF6EC', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ ...card, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
          <div style={{ fontSize:18, fontWeight:700, color:'#2C1810', marginBottom:8 }}>You're all set!</div>
          <div style={{ fontSize:14, color:'#8B7355', marginBottom:8 }}><strong>{storeName}</strong> is ready to go.</div>
          <div style={{ fontSize:13, color:'#8B7355', marginBottom:24 }}>Update your inventory quantities as deliveries arrive.</div>
          <button onClick={handleComplete} style={btnPrimary}>Open {storeName} →</button>
        </div>
      </div>
    )
  }

  // ── Step: Inventory Seed ───────────────────────────────────
  if (step === 'seeding') {
    return (
      <div style={{ minHeight:'100vh', background:'#FDF6EC', padding:20 }}>
        <div style={{ maxWidth:600, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:24, paddingTop:20 }}>
            <div style={{ fontSize:32, fontWeight:700, color:'#2C1810', fontFamily:'serif', marginBottom:4 }}>D</div>
            <div style={{ fontSize:17, fontWeight:700, color:'#2C1810', marginBottom:4 }}>Set Up Your Inventory</div>
            <div style={{ fontSize:13, color:'#8B7355' }}>Below is the Dumont base catalog. Set starting quantities (leave 0 if not in stock yet) and confirm.</div>
          </div>

          {seedItems.length === 0 ? (
            <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:24, textAlign:'center', color:'#8B7355', marginBottom:16 }}>
              No base catalog found. You can add items from Admin → Items after setup.
            </div>
          ) : (
            <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
              <div style={{ background:'#2C1810', padding:'10px 16px', display:'flex', gap:8 }}>
                <div style={{ flex:1, fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase' }}>Item</div>
                <div style={{ width:80, fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase' }}>Category</div>
                <div style={{ width:80, fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase', textAlign:'right' }}>Qty on Hand</div>
              </div>
              {seedItems.map((item, idx) => (
                <div key={item.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', borderBottom: idx < seedItems.length-1 ? '1px solid #F5EFE8' : 'none', background: idx%2===0 ? '#fff' : '#FDFAF6' }}>
                  <div style={{ flex:1, fontSize:13, color:'#2C1810', fontWeight:500 }}>{item.name}</div>
                  <div style={{ width:80, fontSize:11, color:'#8B7355' }}>{item.category || '—'}</div>
                  <input
                    type="number" min="0" step="0.1"
                    value={item.quantity}
                    onChange={e => setSeedItems(prev => prev.map((s,i) => i===idx ? {...s, quantity: e.target.value} : s))}
                    style={{ width:80, padding:'4px 8px', border:'1px solid #EDE0CC', borderRadius:6, fontSize:13, textAlign:'right', fontFamily:'inherit', background:'#FDF6EC' }}
                  />
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleSeedInventory} disabled={seeding}
              style={{ ...btnPrimary, flex:2 }}>
              {seeding ? 'Saving...' : 'Confirm & Save Inventory'}
            </button>
            <button onClick={handleSkipSeed}
              style={{ flex:1, background:'#fff', color:'#8B7355', border:'1px solid #EDE0CC', borderRadius:8, padding:'13px', cursor:'pointer', fontSize:14, fontFamily:'inherit' }}>
              Skip for Now
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step: Create Account ───────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#FDF6EC', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={card}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:36, fontWeight:700, color:'#2C1810', fontFamily:'serif', marginBottom:8 }}>D</div>
          <div style={{ fontSize:17, fontWeight:700, color:'#2C1810', marginBottom:4 }}>Welcome to Dumont Inventory</div>
          <div style={{ fontSize:13, color:'#8B7355' }}>Setting up <strong>{storeName}</strong></div>
        </div>

        <div style={{ background:'#FFF3E0', border:'1px solid #FFB74D', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#C8843A' }}>
          You've been invited as the Store Owner for <strong>{storeName}</strong>. Create your account below.
        </div>

        <form onSubmit={handleCreateAccount}>
          <div style={{ fontSize:11, color:'#8B7355', marginBottom:4, fontWeight:600 }}>Email</div>
          <input value={email} readOnly style={{ ...inp, background:'#F5EFE8', color:'#8B7355', cursor:'not-allowed' }} />

          <div style={{ fontSize:11, color:'#8B7355', marginBottom:4, fontWeight:600 }}>Your Full Name</div>
          <input placeholder="e.g. Jane Smith" value={name} onChange={e => setName(e.target.value)} style={inp} required />

          <div style={{ fontSize:11, color:'#8B7355', marginBottom:4, fontWeight:600 }}>Create Password</div>
          <input type="password" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} style={inp} required />

          <div style={{ fontSize:11, color:'#8B7355', marginBottom:4, fontWeight:600 }}>Confirm Password</div>
          <input type="password" placeholder="Re-enter password" value={confirm} onChange={e => setConfirm(e.target.value)} style={inp} required />

          {error && (
            <div style={{ background:'#FFEBEE', border:'1px solid #FFCDD2', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#C62828' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Creating Account...' : 'Create Account & Continue →'}
          </button>
        </form>
      </div>
    </div>
  )
}
