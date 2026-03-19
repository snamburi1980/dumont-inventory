import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const HARDCODED_USERS = {
  'dumonttexas@gmail.com':    { role:'super_owner', store:'coppell',  name:'Sasikanth' },
  'txccpointwest@gmail.com':  { role:'store_owner',  store:'coppell',  name:'Coppell Owner' },
}

export function useAuth() {
  const [user,       setUser]       = useState(null)
  const [userConfig, setUserConfig] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [pending,    setPending]    = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        await loadUserConfig(firebaseUser)
      } else {
        setUser(null)
        setUserConfig(null)
        setLoading(false)
      }
    })
    return unsub
  }, [])

  async function loadUserConfig(firebaseUser) {
    let cfg = HARDCODED_USERS[firebaseUser.email] || { role:'manager', store:'coppell', name:firebaseUser.email }
    try {
      const emailKey = firebaseUser.email.replace(/\./g,'_').replace(/@/g,'_at_')
      const snap = await getDoc(doc(db, 'users', emailKey))
      if (snap.exists()) {
        const fd = snap.data()
        if (fd.role === 'owner') fd.role = 'super_owner'
        cfg = { ...cfg, ...fd }
        // Check pending
        if (fd.status === 'pending') {
          setPending(true)
          setLoading(false)
          return
        }
      } else {
        // First login — write profile
        const emailKey2 = firebaseUser.email.replace(/\./g,'_').replace(/@/g,'_at_')
        await setDoc(doc(db, 'users', emailKey2), {
          email: firebaseUser.email,
          store: cfg.store,
          role:  cfg.role,
          name:  cfg.name,
          createdAt: Date.now()
        })
      }
    } catch(e) {
      console.warn('Could not load user profile', e)
    }
    setUserConfig(cfg)
    setPending(false)
    setLoading(false)
  }

  async function login(email, password) {
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch(e) {
      setError('Invalid email or password')
    }
  }

  async function logout() {
    await signOut(auth)
  }

  const isSuperOwner   = () => userConfig?.role === 'super_owner'
  const isStoreOwner   = () => ['super_owner','store_owner'].includes(userConfig?.role)
  const isManager      = () => ['super_owner','store_owner','manager'].includes(userConfig?.role)

  return { user, userConfig, loading, error, pending, login, logout, isSuperOwner, isStoreOwner, isManager }
}
