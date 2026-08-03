import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../firebase/config'

const HARDCODED_USERS = {
  'dumonttexas@gmail.com':    { role:'super_owner', store:'',  name:'Sasikanth' },
}

export function useAuth() {
  const [user,               setUser]               = useState(null)
  const [userConfig,         setUserConfig]         = useState(null)
  const [loading,            setLoading]            = useState(true)
  const [error,              setError]              = useState('')
  const [pending,            setPending]            = useState(false)
  const [needsPasswordChange,setNeedsPasswordChange]= useState(false)

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
    // Unknown accounts default to the least-privileged role — real roles come
    // from the Firestore users doc created by the super_owner / invite flow
    let cfg = HARDCODED_USERS[firebaseUser.email] || { role:'staff', store:'', name:firebaseUser.email }
    try {
      const emailKey = firebaseUser.email.replace(/\./g,'_').replace(/@/g,'_at_')
      const snap = await getDoc(doc(db, 'users', emailKey))
      if (snap.exists()) {
        const fd = snap.data()
        if (fd.role === 'owner') fd.role = 'super_owner'
        cfg = { ...cfg, ...fd }
        // Hardcoded users always keep their hardcoded role
        if (HARDCODED_USERS[firebaseUser.email]) {
          cfg.role = HARDCODED_USERS[firebaseUser.email].role
        }
        // Check pending
        if (fd.status === 'pending') {
          setPending(true)
          setLoading(false)
          return
        }
      }
      // No auto-create for unknown accounts: user docs are created only by the
      // super_owner (Admin) or through a valid invitation (OnboardingScreen).
    } catch(e) {
      console.warn('Could not load user profile', e)
    }
    setUserConfig(cfg)
    setPending(false)
    setNeedsPasswordChange(cfg.forcePasswordChange === true)
    // Sync custom claims (role/storeId/orgId) into the JWT token so Firestore rules work.
    // ensureClaims reads the user's Firestore doc and stamps claims for users who haven't
    // had their claims set yet (e.g., existed before syncUserClaims was deployed).
    try {
      const ensureClaims = httpsCallable(functions, 'ensureClaims')
      await ensureClaims()
    } catch(_) {}
    // Force token refresh so the stamped Custom Claims are picked up immediately
    try { await firebaseUser.getIdToken(true) } catch(_) {}
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

  async function changePassword(currentPassword, newPassword) {
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
      return { success: true }
    } catch(e) {
      if (e.code === 'auth/wrong-password') return { success: false, error: 'Current password is incorrect' }
      if (e.code === 'auth/weak-password') return { success: false, error: 'New password must be at least 6 characters' }
      return { success: false, error: 'Failed to change password' }
    }
  }

  const isSuperOwner   = () => userConfig?.role === 'super_owner'
  const isStoreOwner   = () => ['super_owner','store_owner'].includes(userConfig?.role)
  const isManager      = () => ['super_owner','store_owner','manager'].includes(userConfig?.role)

  return { user, userConfig, loading, error, pending, login, logout, changePassword, isSuperOwner, isStoreOwner, isManager }
}
