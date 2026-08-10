import { useState, useEffect } from 'react'
import { SkeletonList } from './Skeleton'
import { confirm } from './ConfirmDialog'
import {
  collection, getDocs, addDoc, updateDoc,
  deleteDoc, doc, setDoc
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db } from '../firebase/config'
import app from '../firebase/config'
import ItemManager  from './ItemManager'
import OrgSetup     from './OrgSetup'
import Pricing      from './Pricing'
import SOPManager   from './SOPManager'
import OrgSettings  from './OrgSettings'
import { logAudit, AUDIT_ACTIONS } from '../utils/auditLogger'
import { sendInvitationEmail } from '../utils/emailNotify'
import { withRetry } from '../utils/withRetry'

const APP_URL = 'https://snamburi1980.github.io/dumont-inventory/'

export default function Admin({ showToast, auth, orgItemsHook, viewingOrg, setViewingOrg, viewingStore, defaultView }) {
  const role0       = auth?.userConfig?.role || ''
  const [view, setView] = useState(defaultView || (auth?.isSuperOwner?.() ? 'overview' : (role0 === 'store_owner' || role0 === 'manager') ? 'users' : 'items'))
  const [orgs,         setOrgs]         = useState([])
  const [regions,      setRegions]      = useState([])
  const [stores,       setStores]       = useState([])
  const [pending,      setPending]      = useState([])
  const [loading,      setLoading]      = useState(false)
  const [showOrgSetup, setShowOrgSetup] = useState(false)

  const [setupStep,    setSetupStep]    = useState(null)
  const [setupOrgId,   setSetupOrgId]   = useState(null)
  const [setupRegionId,setSetupRegionId]= useState(null)

  const [newRegion, setNewRegion] = useState({ name:'', orgId:'' })
  const [newStore,  setNewStore]  = useState({ name:'', regionId:'' })
  const [newUser,   setNewUser]   = useState({ email:'', name:'', role:'store_owner', orgId:'', regionId:'', storeId:'', tempPassword:'' })
  const [userSaved, setUserSaved] = useState(null)
  const [saving,    setSaving]    = useState(false)

  const [users,       setUsers]       = useState([])
  const [editingUser, setEditingUser] = useState(null)

  // Invite new store state
  const [inviteForm,    setInviteForm]    = useState({ name:'', address:'', phone:'', ownerName:'', email:'', ownerRole:'store_owner' })
  const [inviteSent,    setInviteSent]    = useState(null) // { email, link }
  const [inviting,      setInviting]      = useState(false)

  // Invite staff/manager state
  const [inviteUserForm, setInviteUserForm] = useState({ email:'', name:'', role:'staff' })
  const [inviteUserSent, setInviteUserSent] = useState(null)
  const [invitingUser,   setInvitingUser]   = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [orgSnap, regSnap, storeSnap, pendSnap, userSnap] = await Promise.all([
        getDocs(collection(db, 'orgs')),
        getDocs(collection(db, 'regions')),
        getDocs(collection(db, 'stores')),
        getDocs(collection(db, 'signupRequests')),
        getDocs(collection(db, 'users')),
      ])
      setOrgs(orgSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setRegions(regSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setStores(storeSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setPending(pendSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setUsers(userSnap.docs.map(d => ({ emailKey: d.id, ...d.data() }))
        .sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '')))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  // ── INVITE NEW STORE ──────────────────────────────────────
  async function inviteNewStore() {
    if (!inviteForm.name.trim()) { showToast('Enter store name'); return }
    if (!inviteForm.email.trim()) { showToast('Enter owner email'); return }
    setInviting(true)
    try {
      const org = orgs.find(o => o.id === viewingOrg) || orgs[0]
      const region = regions.find(r => r.orgId === (org?.id || viewingOrg))
      // Create store doc with pending status
      const storeRef = await withRetry(() => addDoc(collection(db, 'stores'), {
        name:       inviteForm.name.trim(),
        address:    inviteForm.address.trim(),
        phone:      inviteForm.phone.trim(),
        ownerName:  inviteForm.ownerName.trim(),
        ownerEmail: inviteForm.email.trim().toLowerCase(),
        ownerRole:  inviteForm.ownerRole || 'store_owner',
        orgId:      org?.id || viewingOrg || 'dumont',
        regionId:   region?.id || '',
        status:     'active',
        createdAt:  Date.now(),
        createdBy:  auth.userConfig?.email,
      }))
      // Generate token
      const token = crypto.randomUUID()
      const expiresAt = Date.now() + 72 * 60 * 60 * 1000
      // Write invitation doc — setDoc with a fixed id, safe to retry (idempotent)
      const inviteRole = inviteForm.ownerRole || 'store_owner'
      await withRetry(() => setDoc(doc(db, 'invitations', token), {
        token,
        email:     inviteForm.email.trim().toLowerCase(),
        name:      inviteForm.ownerName.trim(),
        storeName: inviteForm.name.trim(),
        storeId:   storeRef.id,
        orgId:     org?.id || viewingOrg || 'dumont',
        role:      inviteRole,
        status:    'pending',
        expiresAt,
        createdAt: Date.now(),
        createdBy: auth.userConfig?.email,
      }))
      // Build invite link
      const link = `${APP_URL}?token=${token}&email=${encodeURIComponent(inviteForm.email.trim().toLowerCase())}&store=${encodeURIComponent(inviteForm.name.trim())}&storeId=${storeRef.id}&orgId=${org?.id || 'dumont'}&role=${inviteRole}`
      // Send email — store + invitation are already saved at this point, so an
      // email hiccup surfaces the shareable link instead of losing the invite
      try {
        await sendInvitationEmail({ toEmail: inviteForm.email.trim(), storeName: inviteForm.name.trim(), inviteLink: link, role: inviteRole })
      } catch(emailErr) {
        console.warn('Invitation email failed to send:', emailErr)
        showToast('Store created, but the email failed to send — copy the link below and share it manually')
      }
      try { await logAudit({ action: 'STORE_INVITED', userEmail: auth.userConfig?.email, details: { store: inviteForm.name, email: inviteForm.email } }) } catch(_) {}
      await loadAll()
      setInviteSent({ email: inviteForm.email.trim(), link, storeName: inviteForm.name.trim() })
      setInviteForm({ name:'', address:'', phone:'', ownerName:'', email:'', ownerRole:'store_owner' })
      showToast(`Invitation sent to ${inviteForm.email}`)
    } catch(e) {
      console.error(e)
      showToast(`Failed: ${e?.code || e?.message || 'check your connection'}`)
    }
    setInviting(false)
  }
  // ── INVITE STAFF / MANAGER (super_owner only) ─────────────
  async function inviteUser() {
    if (!auth?.isSuperOwner?.()) { showToast('Only HQ can invite users'); return }
    if (!inviteUserForm.email.trim()) { showToast('Enter email'); return }
    const targetStoreId = inviteUserForm.storeId || currentStoreId || viewingStore
    if (!targetStoreId) { showToast('No store selected'); return }
    setInvitingUser(true)
    try {
      const store  = stores.find(s => s.id === targetStoreId)
      const org    = orgs.find(o => o.id === (store?.orgId || viewingOrg))
      const token  = crypto.randomUUID()
      const expiresAt = Date.now() + 72 * 60 * 60 * 1000
      await withRetry(() => setDoc(doc(db, 'invitations', token), {
        token,
        email:     inviteUserForm.email.trim().toLowerCase(),
        name:      inviteUserForm.name.trim(),
        storeName: store?.name || '',
        storeId:   targetStoreId,
        orgId:     org?.id || viewingOrg || 'dumont',
        role:      inviteUserForm.role,
        status:    'pending',
        expiresAt,
        createdAt: Date.now(),
        createdBy: auth.userConfig?.email,
      }))
      const link = `${APP_URL}?token=${token}&email=${encodeURIComponent(inviteUserForm.email.trim().toLowerCase())}&store=${encodeURIComponent(store?.name || '')}&storeId=${targetStoreId}&orgId=${org?.id || 'dumont'}&role=${inviteUserForm.role}`
      try {
        await sendInvitationEmail({
          toEmail:   inviteUserForm.email.trim(),
          storeName: store?.name || '',
          inviteLink: link,
          role:      inviteUserForm.role,
        })
      } catch(emailErr) {
        console.warn('Invitation email failed to send:', emailErr)
        showToast('Invitation created, but the email failed — copy the link below and share it manually')
      }
      setInviteUserSent({ email: inviteUserForm.email.trim(), link, role: inviteUserForm.role, storeName: store?.name || '' })
      setInviteUserForm({ email:'', name:'', role:'staff' })
      showToast(`Invitation sent to ${inviteUserForm.email}`)
    } catch(e) {
      console.error(e)
      showToast(`Failed: ${e?.code || e?.message || 'check your connection'}`)
    }
    setInvitingUser(false)
  }
  // ──────────────────────────────────────────────────────────

  // ── CASCADE DELETE ─────────────────────────────────────────
  // clearStoreData (Cloud Function, super_owner only) wipes the store doc,
  // every subcollection under it (inventory, checklists, schedule, stockLog,
  // cashRegister...), its invitations, and optionally its users + logins.
  async function deleteStore(storeId, storeName) {
    if (!await confirm({ title:`Delete ${storeName}?`, message:'ALL of this store\u2019s data will be permanently deleted \u2014 inventory, checklists, schedules, cash register and logs.\n\nThis cannot be undone.', confirmLabel:'Delete Store', danger:true })) return
    const alsoUsers = await confirm({ title:'Also delete its users?', message:`Remove the user accounts and logins assigned to ${storeName}?`, confirmLabel:'Delete Users Too', cancelLabel:'Keep Users', danger:true })
    setLoading(true)
    try {
      const clearStoreData = httpsCallable(getFunctions(app), 'clearStoreData')
      const res = await clearStoreData({ storeId, deleteUsers: alsoUsers })
      const cleared = res.data?.usersDeleted?.length || 0
      await logAudit({ action: 'STORE_CLEARED', userEmail: auth.userConfig?.email, details: { storeId, storeName, usersDeleted: cleared } })
      showToast(`Store "${storeName}" cleared${cleared ? ` · ${cleared} user(s) removed` : ''}`)
    } catch(e) {
      console.error(e)
      showToast(`Failed to clear store: ${e.message}`)
    }
    setLoading(false)
    loadAll()
  }

  async function deleteRegion(regionId, regionName, regionStores) {
    if (!await confirm({ title:`Delete region ${regionName}?`, message:`Its ${regionStores.length} store(s), all their data and all their users will be permanently deleted.\n\nThis cannot be undone.`, confirmLabel:'Delete Region', danger:true })) return
    setLoading(true)
    try {
      const clearStoreData = httpsCallable(getFunctions(app), 'clearStoreData')
      for (const store of regionStores) {
        await clearStoreData({ storeId: store.id, deleteUsers: true })
      }
      await deleteDoc(doc(db, 'regions', regionId))
      showToast(`Region "${regionName}" and ${regionStores.length} store(s) deleted`)
    } catch(e) {
      console.error(e)
      showToast(`Failed: ${e.message}`)
    }
    setLoading(false)
    loadAll()
  }

  async function deleteOrg(orgId, orgName) {
    if (!await confirm({ title:`Delete ${orgName}?`, message:'Every region, store, data record and user in this organisation will be permanently deleted.\n\nThis cannot be undone.', confirmLabel:'Delete Organisation', danger:true })) return
    setLoading(true)
    try {
      const orgRegions = regions.filter(r => r.orgId === orgId)
      const orgStores  = stores.filter(s => s.orgId === orgId)
      const clearStoreData = httpsCallable(getFunctions(app), 'clearStoreData')
      for (const store of orgStores) {
        await clearStoreData({ storeId: store.id, deleteUsers: true })
      }
      for (const region of orgRegions) {
        await deleteDoc(doc(db, 'regions', region.id))
      }
      await deleteDoc(doc(db, 'orgs', orgId))
      showToast(`Org "${orgName}" and all its regions/stores deleted`)
    } catch(e) {
      console.error(e)
      showToast(`Failed: ${e.message}`)
    }
    setLoading(false)
    loadAll()
  }
  // ──────────────────────────────────────────────────────────

  async function createRegion() {
    if (!newRegion.name.trim() || !newRegion.orgId) { showToast('Fill all fields'); return }
    const exists = regions.find(r => r.name.toLowerCase() === newRegion.name.toLowerCase() && r.orgId === newRegion.orgId)
    if (exists) { showToast(`Region "${newRegion.name}" already exists`); return }
    setSaving(true)
    try {
      const ref = await withRetry(() => addDoc(collection(db, 'regions'), {
        name: newRegion.name, orgId: newRegion.orgId, active: true, createdAt: Date.now()
      }))
      try { await logAudit({ action: AUDIT_ACTIONS.REGION_CREATED, orgId: newRegion.orgId, userEmail: auth.userConfig?.email, details: { name: newRegion.name } }) } catch(_) {}
      await loadAll()
      showToast(`Region "${newRegion.name}" created`)
      if (setupStep === 'region') {
        setSetupRegionId(ref.id)
        setSetupStep('store')
        setNewStore(s => ({ ...s, regionId: ref.id }))
      }
      setNewRegion({ name:'', orgId:'' })
    } catch(e) {
      console.error('createRegion failed:', e)
      showToast(`Failed: ${e?.code || e?.message || 'check your connection'}`)
    }
    setSaving(false)
  }

  async function createStore() {
    if (!newStore.name.trim()) { showToast('Enter a store name'); return }
    const resolvedRegionId = newStore.regionId || (regions.length === 1 ? regions[0].id : '')
    setSaving(true)
    try {
      const region = regions.find(r => r.id === resolvedRegionId)
      const ref = await withRetry(() => addDoc(collection(db, 'stores'), {
        name:      newStore.name.trim(),
        regionId:  resolvedRegionId,
        orgId:     region?.orgId || viewingOrg || 'dumont',
        status:    'active',
        active:    true,
        createdAt: Date.now()
      }))
      try { await logAudit({ action: AUDIT_ACTIONS.STORE_CREATED, orgId: region?.orgId, userEmail: auth.userConfig?.email, details: { name: newStore.name } }) } catch(_) {}
      await loadAll()
      showToast(`Store "${newStore.name}" created`)
      if (setupStep === 'store') {
        setSetupStep('user')
        setNewUser(u => ({ ...u, storeId: ref.id }))
      }
      setNewStore({ name:'', regionId:'' })
    } catch(e) {
      console.error('createStore failed:', e)
      showToast(`Failed: ${e.code === 'permission-denied' ? 'Check Firestore rules' : e.message || 'Unknown error'}`)
    }
    setSaving(false)
  }

  async function assignUser(overrideStoreId) {
    if (!newUser.email.trim()) { showToast('Enter email'); return }
    if (!newUser.tempPassword?.trim()) { showToast('Enter a temporary password'); return }
    setSaving(true)
    try {
      const resolvedStoreId = overrideStoreId || newUser.storeId
      const emailKey = newUser.email.toLowerCase().replace(/\./g,'_').replace(/@/g,'_at_')
      const store    = stores.find(s => s.id === resolvedStoreId)
      const region   = regions.find(r => r.id === (newUser.regionId || store?.regionId))
      const org      = orgs.find(o => o.id === (newUser.orgId || region?.orgId))
      await withRetry(() => setDoc(doc(db, 'users', emailKey), {
        email:               newUser.email.toLowerCase(),
        name:                newUser.name || newUser.email,
        role:                newUser.role,
        orgId:               org?.id    || viewingOrg || '',
        regionId:            region?.id || '',
        storeId:             store?.id  || resolvedStoreId || '',
        store:               store?.id  || resolvedStoreId || '',
        status:              'active',
        forcePasswordChange: true,
        createdAt:           Date.now()
      }))
      try { await logAudit({ action: AUDIT_ACTIONS.USER_ASSIGNED, userEmail: auth.userConfig?.email, details: { assignedEmail: newUser.email, role: newUser.role } }) } catch(_) {}
      setUserSaved({ email: newUser.email, name: newUser.name, password: newUser.tempPassword || '', role: newUser.role, store: store?.name || '' })
      if (setupStep === 'user') setSetupStep('done')
      setNewUser({ email:'', name:'', role:'store_owner', orgId:'', regionId:'', storeId:'', tempPassword:'' })
    } catch(e) {
      console.error('assignUser failed:', e)
      showToast(`Failed: ${e?.code || e?.message || 'check your connection'}`)
    }
    setSaving(false)
  }

  async function approveSignup(req) {
    try {
      const emailKey = req.email.replace(/\./g,'_').replace(/@/g,'_at_')
      await withRetry(() => updateDoc(doc(db, 'users', emailKey), { status:'active', role: req.role||'store_owner', storeId: req.store||'', store: req.store||'' }))
      await deleteDoc(doc(db, 'signupRequests', req.id))
      setPending(prev => prev.filter(p => p.id !== req.id))
      showToast(`${req.email} approved`)
    } catch(e) { showToast(`Error approving: ${e?.code || e?.message || 'check your connection'}`) }
  }

  async function rejectSignup(req) {
    try {
      await deleteDoc(doc(db, 'signupRequests', req.id))
      setPending(prev => prev.filter(p => p.id !== req.id))
      showToast(`${req.email} rejected`)
    } catch(e) { showToast(`Error: ${e?.code || e?.message || 'check your connection'}`) }
  }

  async function saveUserEdit(emailKey, updates) {
    setSaving(true)
    try {
      await withRetry(() => updateDoc(doc(db, 'users', emailKey), updates))
      showToast('User updated')
      setEditingUser(null)
      await loadAll()
    } catch(e) {
      console.error('saveUserEdit failed:', e)
      showToast(`Failed: ${e?.code || e?.message || 'check your connection'}`)
    }
    setSaving(false)
  }

  async function toggleUserActive(user) {
    const newStatus = user.status === 'inactive' ? 'active' : 'inactive'
    try {
      await withRetry(() => updateDoc(doc(db, 'users', user.emailKey), { status: newStatus }))
      showToast(newStatus === 'active' ? `${user.name || user.email} activated` : `${user.name || user.email} deactivated`)
      await loadAll()
    } catch(e) {
      showToast(`Failed: ${e?.code || e?.message || 'check your connection'}`)
    }
  }

  async function deleteUser(user) {
    if (!await confirm({ title:`Delete ${user.name || user.email}?`, message:'They will lose access and their login account will be removed.\n\nThis cannot be undone.', confirmLabel:'Delete User', danger:true })) return
    try {
      const deleteAuthUser = httpsCallable(getFunctions(app), 'deleteAuthUser')
      await deleteAuthUser({ email: user.email })
    } catch(e) {
      console.warn('Could not delete Auth account:', e.message)
    }
    await deleteDoc(doc(db, 'users', user.emailKey))
    showToast(`${user.name || user.email} deleted`)
    loadAll()
  }

  const card  = { background:'#fff', border:'1px solid #E3DDD0', borderRadius:12, padding:'14px 16px', marginBottom:12 }
  const input = { width:'100%', padding:'9px 10px', border:'1px solid #E3DDD0', borderRadius:8, fontFamily:'inherit', fontSize:13, marginBottom:8, boxSizing:'border-box', background:'#F6F4ED' }
  const btn   = (color='#1A4C48') => ({ background:color, color:'#fff', border:'none', borderRadius:8, padding:'11px 16px', cursor:'pointer', fontSize:13, fontWeight:600, width:'100%', fontFamily:'inherit', opacity: saving ? 0.7 : 1 })
  const isSuperOwnerUser = auth?.isSuperOwner?.()
  const currentRole      = auth?.userConfig?.role || ''
  const isStoreOwner     = currentRole === 'store_owner'
  const isManager        = currentRole === 'manager'
  const currentStoreId   = auth?.userConfig?.storeId || auth?.userConfig?.store || ''
  const canManageUsers   = isSuperOwnerUser || isStoreOwner || isManager

  const navTabs = isSuperOwnerUser ? [
    { id:'overview', label:'Overview' },
    { id:'stores',   label:'Stores'   },
    { id:'setup',    label:'Setup'    },
    { id:'users',    label:'Users'    },
    { id:'items',    label:'Items'    },
    { id:'pricing',  label:'Pricing'  },
    { id:'sop',      label:'SOPs'     },
    { id:'settings', label:'Settings' },
  ] : (isStoreOwner || isManager) ? [
    { id:'users',    label:'Users'    },
    { id:'items',    label:'Items'    },
    { id:'pricing',  label:'Pricing'  },
    { id:'sop',      label:'SOPs'     },
    { id:'settings', label:'Settings' },
  ] : [
    { id:'items',    label:'Items'    },
    { id:'pricing',  label:'Pricing'  },
    { id:'sop',      label:'SOPs'     },
    { id:'settings', label:'Settings' },
  ]

  if (setupStep && setupStep !== 'done') {
    const steps = ['region','store','user']
    const stepIdx = steps.indexOf(setupStep)
    const org = orgs.find(o => o.id === setupOrgId)
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:20 }}>
          {['Create Org','Add Region','Add Store','Add User'].map((s,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, background: i <= stepIdx+1 ? '#1A4C48' : '#E3DDD0', color: i <= stepIdx+1 ? '#fff' : '#6B7F78', flexShrink:0 }}>{i+1}</div>
              <span style={{ fontSize:11, color: i === stepIdx+1 ? '#1A4C48' : '#6B7F78', fontWeight: i===stepIdx+1?700:400, whiteSpace:'nowrap' }}>{s}</span>
              {i < 3 && <div style={{ width:16, height:2, background:'#E3DDD0' }}/>}
            </div>
          ))}
        </div>
        {setupStep === 'region' && (
          <div style={card}>
            <div style={{ fontSize:15, fontWeight:700, color:'#1A4C48', marginBottom:4 }}>Add Region</div>
            <div style={{ fontSize:12, color:'#6B7F78', marginBottom:12 }}>For org: {org?.name}</div>
            <input placeholder="Region name (e.g. Texas, NC)" value={newRegion.name}
              onChange={e => setNewRegion(r=>({...r, name:e.target.value, orgId:setupOrgId}))} style={input}/>
            <button style={btn()} onClick={createRegion} disabled={saving}>{saving ? 'Creating...' : 'Add Region and Continue'}</button>
            <button onClick={() => { setSetupStep(null); setView('overview') }} style={{ ...btn('#888'), marginTop:8 }}>Skip — Do Later</button>
          </div>
        )}
        {setupStep === 'store' && (
          <div style={card}>
            <div style={{ fontSize:15, fontWeight:700, color:'#1A4C48', marginBottom:4 }}>Add Store</div>
            <div style={{ fontSize:12, color:'#6B7F78', marginBottom:12 }}>Region: {regions.find(r=>r.id===setupRegionId)?.name}</div>
            <input placeholder="Store name (e.g. Coppell, Frisco)" value={newStore.name}
              onChange={e => setNewStore(s=>({...s, name:e.target.value, regionId:setupRegionId}))} style={input}/>
            <button style={btn()} onClick={createStore} disabled={saving}>{saving ? 'Creating...' : 'Add Store and Continue'}</button>
            <button onClick={() => setSetupStep('user')} style={{ ...btn('#888'), marginTop:8 }}>Skip — Do Later</button>
          </div>
        )}
        {setupStep === 'user' && (
          <div style={card}>
            <div style={{ fontSize:15, fontWeight:700, color:'#1A4C48', marginBottom:4 }}>Assign User</div>
            <div style={{ background:'#FFF3E0', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:11, color:'#C1683C' }}>
              Firebase Console → Authentication → Add User → enter email + temporary password
            </div>
            <input placeholder="Full Name" value={newUser.name} onChange={e => setNewUser(u=>({...u,name:e.target.value}))} style={input}/>
            <input placeholder="Email address" value={newUser.email} onChange={e => setNewUser(u=>({...u,email:e.target.value}))} style={input}/>
            <input placeholder="Temporary password (min 6 chars)" type="text" value={newUser.tempPassword||''} onChange={e => setNewUser(u=>({...u,tempPassword:e.target.value}))} style={input}/>
            <select value={newUser.role} onChange={e => setNewUser(u=>({...u,role:e.target.value}))} style={input}>
              <option value="store_owner">Store Owner</option>
              <option value="manager">Manager</option>
              <option value="regional_owner">Regional Owner</option>
            </select>
            <select value={newUser.storeId} onChange={e => setNewUser(u=>({...u,storeId:e.target.value}))} style={input}>
              <option value="">Select Store</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button style={btn()} onClick={assignUser} disabled={saving}>{saving ? 'Saving...' : 'Assign User'}</button>
            <button onClick={() => { setSetupStep(null); setView('overview') }} style={{ ...btn('#888'), marginTop:8 }}>Skip — Do Later</button>
          </div>
        )}
      </div>
    )
  }

  if (setupStep === 'done' && userSaved) {
    return (
      <div>
        <div style={{ ...card, textAlign:'center', background:'#E8F5E9', border:'1px solid #27AE60' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
          <div style={{ fontSize:16, fontWeight:700, color:'#1A4C48', marginBottom:4 }}>Setup Complete!</div>
          <div style={{ fontSize:12, color:'#6B7F78', marginBottom:16 }}>Share these details with your user</div>
        </div>
        <div style={card}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:12 }}>Share with {userSaved.email}</div>
          {[
            { label:'App URL',  value: APP_URL },
            { label:'Email',    value: userSaved.email },
            { label:'Password', value: '(the one you set in Firebase)' },
            { label:'Role',     value: userSaved.role },
            { label:'Store',    value: userSaved.store || 'Not assigned' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #E3DDD0' }}>
              <span style={{ fontSize:12, color:'#6B7F78', fontWeight:600 }}>{label}</span>
              <span style={{ fontSize:12, color:'#1A4C48', fontWeight:500 }}>{value}</span>
            </div>
          ))}
          <button onClick={() => {
            const text = `Dumont Inventory App\nURL: ${APP_URL}\nEmail: ${userSaved.email}\nRole: ${userSaved.role}\nStore: ${userSaved.store}`
            navigator.clipboard.writeText(text).then(() => showToast('Copied!'))
          }} style={{ ...btn(), marginTop:12 }}>Copy to Share</button>
        </div>
        <button onClick={() => { setSetupStep(null); setUserSaved(null); setView('overview') }} style={{ ...btn('#1A4C48'), marginTop:4 }}>
          Done — Back to Overview
        </button>
      </div>
    )
  }

  if (showOrgSetup) {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <button onClick={() => setShowOrgSetup(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#6B7F78' }}>{'<'} Back</button>
          <div style={{ fontSize:15, fontWeight:700, color:'#1A4C48' }}>New Organisation Setup</div>
        </div>
        <OrgSetup showToast={showToast} existingOrgs={orgs} onComplete={(orgId) => {
          setShowOrgSetup(false)
          if (setViewingOrg) setViewingOrg(orgId)
          setSetupOrgId(orgId)
          setNewRegion(r => ({ ...r, orgId }))
          loadAll().then(() => setSetupStep('region'))
          showToast('Organisation created! Now add a region.')
        }}/>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {navTabs.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{
            padding:'6px 14px', borderRadius:20, border:'1px solid #E3DDD0',
            background: view===t.id ? '#1A4C48' : '#fff',
            color: view===t.id ? '#fff' : '#6B7F78',
            fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap'
          }}>{t.label}</button>
        ))}
      </div>

      {loading && <SkeletonList count={4} lines={2} />}

      {/* OVERVIEW */}
      {view === 'overview' && (
        <div>
          {/* Quick nav to Stores */}
          <button onClick={() => setView('stores')}
            style={{ ...btn('#1A4C48'), marginBottom:16 }}>
            + Create New Store & Send Invitation
          </button>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
            {[
              { label:'Orgs',    value:orgs.length,    color:'#C1683C' },
              { label:'Stores',  value:stores.length,  color:'#27AE60' },
              { label:'Users',   value:users.filter(u => u.status !== 'inactive').length, color:'#9B59B6' },
              { label:'Pending', value:pending.length, color:pending.length>0?'#E74C3C':'#6B7F78' },
            ].map(({label,value,color}) => (
              <div key={label} style={{...card,textAlign:'center',marginBottom:0}}>
                <div style={{fontSize:28,fontWeight:700,color}}>{value}</div>
                <div style={{fontSize:11,color:'#6B7F78',textTransform:'uppercase'}}>{label}</div>
              </div>
            ))}
          </div>

          {orgs.map(org => {
            const orgRegions = regions.filter(r => r.orgId === org.id)
            return (
              <div key={org.id} style={card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#1A4C48' }}>{org.name}</div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={() => { if(setViewingOrg) setViewingOrg(org.id); setView('items') }}
                      style={{ fontSize:11, color:'#C1683C', background:'none', border:'1px solid #C1683C', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>
                      Items
                    </button>
                    <button onClick={() => deleteOrg(org.id, org.name)}
                      style={{ fontSize:11, color:'#E74C3C', background:'none', border:'1px solid #FFCDD2', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
                {orgRegions.map(region => {
                  const regionStores = stores.filter(s => s.regionId === region.id)
                  return (
                    <div key={region.id} style={{ marginLeft:16, marginBottom:6 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#2980B9' }}>{region.name}</div>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={async () => {
                            const name = window.prompt('Edit region name:', region.name)
                            if (!name || name === region.name) return
                            await updateDoc(doc(db, 'regions', region.id), { name })
                            showToast('Updated'); loadAll()
                          }} style={{ fontSize:10, color:'#6B7F78', background:'none', border:'1px solid #E3DDD0', borderRadius:4, padding:'2px 6px', cursor:'pointer' }}>Edit</button>
                          <button onClick={() => deleteRegion(region.id, region.name, regionStores)}
                            style={{ fontSize:10, color:'#E74C3C', background:'none', border:'1px solid #FFCDD2', borderRadius:4, padding:'2px 6px', cursor:'pointer' }}>Del</button>
                        </div>
                      </div>
                      {regionStores.map(store => (
                        <div key={store.id} style={{ marginLeft:16, fontSize:12, color:'#6B7F78', padding:'3px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div style={{width:6,height:6,borderRadius:'50%',background:'#27AE60'}}/>
                            {store.name}
                          </div>
                          <div style={{display:'flex',gap:4}}>
                            <button onClick={async () => {
                              const name = window.prompt('Edit store name:', store.name)
                              if (!name || name === store.name) return
                              await updateDoc(doc(db, 'stores', store.id), { name })
                              showToast('Updated'); loadAll()
                            }} style={{ fontSize:10, color:'#6B7F78', background:'none', border:'1px solid #E3DDD0', borderRadius:4, padding:'2px 6px', cursor:'pointer' }}>Edit</button>
                            <button onClick={() => deleteStore(store.id, store.name)}
                              style={{ fontSize:10, color:'#E74C3C', background:'none', border:'1px solid #FFCDD2', borderRadius:4, padding:'2px 6px', cursor:'pointer' }}>Del</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {isSuperOwnerUser && (
            <button onClick={() => setShowOrgSetup(true)}
              style={{ width:'100%', background:'#C1683C', color:'#fff', border:'none', borderRadius:10, padding:'13px', cursor:'pointer', fontSize:13, fontWeight:700, marginTop:4, fontFamily:'inherit' }}>
              + Create New Organisation
            </button>
          )}

        </div>
      )}

      {/* STORES */}
      {view === 'stores' && (
        <div>
          {/* Single combined form */}
          <div style={{ ...card, marginBottom:20 }}>
            {inviteSent ? (
              <div>
                <div style={{ background:'#E8F5E9', border:'1px solid #27AE60', borderRadius:10, padding:'16px', marginBottom:4 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#27AE60', marginBottom:6 }}>Store created & invitation sent!</div>
                  <div style={{ fontSize:12, color:'#1A4C48', marginBottom:4 }}>Store: <strong>{inviteSent.storeName}</strong></div>
                  <div style={{ fontSize:12, color:'#1A4C48', marginBottom:10 }}>Invitation emailed to: <strong>{inviteSent.email}</strong></div>
                  <div style={{ fontSize:10, color:'#6B7F78', wordBreak:'break-all', marginBottom:12 }}>{inviteSent.link}</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => { navigator.clipboard.writeText(inviteSent.link); showToast('Link copied!') }}
                      style={{ background:'#27AE60', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>
                      Copy Invite Link
                    </button>
                    <button onClick={() => setInviteSent(null)}
                      style={{ background:'none', border:'1px solid #E3DDD0', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:12, fontFamily:'inherit', color:'#6B7F78' }}>
                      + Add Another Store
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#1A4C48', marginBottom:4 }}>Create Store & Invite Owner</div>
                <div style={{ fontSize:12, color:'#6B7F78', marginBottom:16 }}>Fills in all details, creates the store, and emails an onboarding link in one step.</div>

                <div style={{ fontSize:11, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Store Details</div>
                <input placeholder="Store Name *  (e.g. Frisco, McKinney)" value={inviteForm.name}
                  onChange={e => setInviteForm(f=>({...f,name:e.target.value}))} style={input}/>
                <input placeholder="Store Address" value={inviteForm.address}
                  onChange={e => setInviteForm(f=>({...f,address:e.target.value}))} style={input}/>
                <input placeholder="Store Phone Number" type="tel" value={inviteForm.phone}
                  onChange={e => setInviteForm(f=>({...f,phone:e.target.value}))} style={input}/>

                <div style={{ fontSize:11, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8, marginTop:4 }}>Owner Details</div>
                <input placeholder="Owner Name" value={inviteForm.ownerName}
                  onChange={e => setInviteForm(f=>({...f,ownerName:e.target.value}))} style={input}/>
                <input placeholder="Owner Email *" type="email" value={inviteForm.email}
                  onChange={e => setInviteForm(f=>({...f,email:e.target.value}))} style={input}/>
                <select value={inviteForm.ownerRole} onChange={e => setInviteForm(f=>({...f,ownerRole:e.target.value}))} style={input}>
                  <option value="store_owner">Store Owner</option>
                  <option value="manager">Manager</option>
                  <option value="regional_owner">Regional Owner</option>
                </select>

                <button onClick={inviteNewStore} disabled={inviting}
                  style={{ ...btn('#1A4C48'), marginTop:4, opacity: inviting ? 0.7 : 1 }}>
                  {inviting ? 'Creating & Sending...' : 'Create Store & Send Invitation'}
                </button>
              </div>
            )}
          </div>

          {/* Store list */}
          <div style={{ fontSize:12, fontWeight:700, color:'#6B7F78', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>
            All Stores ({stores.length})
          </div>
          {stores.map(store => {
            const region = regions.find(r => r.id === store.regionId)
            const org    = orgs.find(o => o.id === store.orgId)
            return (
              <div key={store.id} style={{ ...card, marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48' }}>{store.name}</div>
                    <div style={{ fontSize:11, color:'#6B7F78' }}>
                      {org?.name}{region ? ` › ${region.name}` : ''}
                      {store.address ? ` · ${store.address}` : ''}
                    </div>
                    <div style={{ display:'inline-block', marginTop:4, fontSize:10, fontWeight:600, borderRadius:4, padding:'2px 8px',
                      background: store.status==='active' ? '#E8F5E9' : '#FFF3E0',
                      color:      store.status==='active' ? '#27AE60' : '#C1683C',
                    }}>
                      {store.status || 'active'}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={async () => {
                      const name = window.prompt('Edit store name:', store.name)
                      if (!name || name === store.name) return
                      await updateDoc(doc(db, 'stores', store.id), { name })
                      showToast('Updated'); loadAll()
                    }} style={{ fontSize:11, color:'#6B7F78', background:'none', border:'1px solid #E3DDD0', borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
                      Edit
                    </button>
                    <button onClick={() => deleteStore(store.id, store.name)}
                      style={{ fontSize:11, color:'#E74C3C', background:'none', border:'1px solid #FFCDD2', borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          {stores.length === 0 && !loading && (
            <div style={{ ...card, textAlign:'center', color:'#6B7F78' }}>No stores yet. Send an invitation above.</div>
          )}
        </div>
      )}

      {/* SETUP */}
      {view === 'setup' && (
        <div>
          <div style={card}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:10 }}>Add Region</div>
            <select value={newRegion.orgId} onChange={e => setNewRegion(r=>({...r,orgId:e.target.value}))} style={input}>
              <option value="">Select Org</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input placeholder="Region name (e.g. Texas, NC)" value={newRegion.name}
              onChange={e => setNewRegion(r=>({...r,name:e.target.value}))} style={input}/>
            <button style={btn()} onClick={createRegion} disabled={saving}>{saving ? 'Creating...' : '+ Add Region'}</button>
          </div>

          <div style={card}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:10 }}>Add Store</div>
            <select value={newStore.regionId} onChange={e => setNewStore(s=>({...s,regionId:e.target.value}))} style={input}>
              <option value="">Select Region</option>
              {regions.map(r => {
                const org = orgs.find(o=>o.id===r.orgId)
                return <option key={r.id} value={r.id}>{org?.name} — {r.name}</option>
              })}
            </select>
            <input placeholder="Store name (e.g. Coppell, Frisco)" value={newStore.name}
              onChange={e => setNewStore(s=>({...s,name:e.target.value}))} style={input}/>
            <button style={btn()} onClick={createStore} disabled={saving}>{saving ? 'Creating...' : '+ Add Store'}</button>
          </div>

          <div style={card}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:4 }}>Assign User</div>
            <div style={{ fontSize:11, color:'#6B7F78', marginBottom:10, lineHeight:1.6 }}>
              First create the user in Firebase Console → Authentication → Add User, then assign here.
            </div>
            <input placeholder="Full Name" value={newUser.name} onChange={e => setNewUser(u=>({...u,name:e.target.value}))} style={input}/>
            <input placeholder="Email address" value={newUser.email} onChange={e => setNewUser(u=>({...u,email:e.target.value}))} style={input}/>
            <input placeholder="Temporary password (min 6 chars)" type="text" value={newUser.tempPassword||''} onChange={e => setNewUser(u=>({...u,tempPassword:e.target.value}))} style={input}/>
            <select value={newUser.role} onChange={e => setNewUser(u=>({...u,role:e.target.value,storeId:'',regionId:'',orgId:''}))} style={input}>
              <option value="store_owner">Store Owner</option>
              <option value="manager">Manager</option>
              <option value="regional_owner">Regional Owner</option>
              <option value="org_owner">Org Owner</option>
            </select>
            {(newUser.role==='store_owner'||newUser.role==='manager') && (
              <select value={newUser.storeId} onChange={e => setNewUser(u=>({...u,storeId:e.target.value}))} style={input}>
                <option value="">Select Store</option>
                {stores.map(s => {
                  const region = regions.find(r=>r.id===s.regionId)
                  const org    = orgs.find(o=>o.id===s.orgId)
                  return <option key={s.id} value={s.id}>{org?.name} {'>'} {region?.name} {'>'} {s.name}</option>
                })}
              </select>
            )}
            {newUser.role==='regional_owner' && (
              <select value={newUser.regionId} onChange={e => setNewUser(u=>({...u,regionId:e.target.value}))} style={input}>
                <option value="">Select Region</option>
                {regions.map(r => {
                  const org = orgs.find(o=>o.id===r.orgId)
                  return <option key={r.id} value={r.id}>{org?.name} — {r.name}</option>
                })}
              </select>
            )}
            <button style={btn()} onClick={assignUser} disabled={saving}>{saving ? 'Saving...' : 'Assign User'}</button>
            {userSaved && (
              <div style={{ marginTop:12, padding:'12px', background:'#E8F5E9', borderRadius:8, border:'1px solid #27AE60' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#27AE60', marginBottom:8 }}>User assigned! Share these details:</div>
                {[
                  { label:'App URL', value: APP_URL },
                  { label:'Email',   value: userSaved.email },
                  { label:'Store',   value: userSaved.store || 'See admin' },
                ].map(({label,value}) => (
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'3px 0', borderBottom:'1px solid #C8E6C9' }}>
                    <span style={{color:'#6B7F78',fontWeight:600}}>{label}</span>
                    <span style={{color:'#1A4C48'}}>{value}</span>
                  </div>
                ))}
                <button onClick={() => {
                  const text = `Dumont Inventory App\nURL: ${APP_URL}\nEmail: ${userSaved.email}\nStore: ${userSaved.store}`
                  navigator.clipboard.writeText(text).then(() => showToast('Copied!'))
                }} style={{ marginTop:8, background:'#27AE60', color:'#fff', border:'none', borderRadius:6, padding:'7px 14px', cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>
                  Copy to Share
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'users' && (
        <div>
          {/* Store owners/managers cannot manage users — they request HQ */}
          {!isSuperOwnerUser && (
            <div style={{ ...card, background:'#F6F4ED', borderLeft:'3px solid #C1683C' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:4 }}>Need to add or change a user?</div>
              <div style={{ fontSize:12, color:'#6B7F78', lineHeight:1.6 }}>
                User accounts are managed by Dumont HQ. Email{' '}
                <a href="mailto:dumonttexas@gmail.com" style={{ color:'#C1683C', fontWeight:600 }}>dumonttexas@gmail.com</a>{' '}
                with the person's name, email address, and role (staff or manager) — you'll be notified once their access is ready.
              </div>
            </div>
          )}

          {/* Invite User — super_owner only */}
          {isSuperOwnerUser && (
          <div style={{ ...card, border:'1.5px solid #1A4C48' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:4 }}>Invite User</div>
            <div style={{ fontSize:11, color:'#6B7F78', marginBottom:12 }}>
              Sends an email with a sign-up link. They create their own password — no Firebase Console needed.
            </div>
            {inviteUserSent ? (
              <div style={{ background:'#E8F5E9', border:'1px solid #27AE60', borderRadius:8, padding:'12px', marginBottom:4 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#27AE60', marginBottom:4 }}>
                  Invitation sent to {inviteUserSent.email}
                </div>
                <div style={{ fontSize:11, color:'#1A4C48', marginBottom:6 }}>
                  Role: {inviteUserSent.role} · Store: {inviteUserSent.storeName}
                </div>
                <div style={{ fontSize:10, color:'#6B7F78', wordBreak:'break-all', marginBottom:8 }}>{inviteUserSent.link}</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => { navigator.clipboard.writeText(inviteUserSent.link); showToast('Link copied!') }}
                    style={{ background:'#27AE60', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>
                    Copy Link
                  </button>
                  <button onClick={() => setInviteUserSent(null)}
                    style={{ background:'none', border:'1px solid #E3DDD0', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:11, fontFamily:'inherit', color:'#6B7F78' }}>
                    Invite Another
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <input placeholder="Full Name (optional)" value={inviteUserForm.name}
                  onChange={e => setInviteUserForm(f=>({...f,name:e.target.value}))} style={input}/>
                <input placeholder="Email address *" type="email" value={inviteUserForm.email}
                  onChange={e => setInviteUserForm(f=>({...f,email:e.target.value}))} style={input}/>
                <select value={inviteUserForm.role}
                  onChange={e => setInviteUserForm(f=>({...f,role:e.target.value}))} style={input}>
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="store_owner">Store Owner</option>
                </select>
                <select value={inviteUserForm.storeId || currentStoreId || ''}
                  onChange={e => setInviteUserForm(f=>({...f,storeId:e.target.value}))} style={input}>
                  <option value="">Select Store</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button onClick={inviteUser} disabled={invitingUser}
                  style={{ ...btn('#1A4C48'), opacity: invitingUser ? 0.7 : 1 }}>
                  {invitingUser ? 'Sending...' : '📧 Send Invitation'}
                </button>
              </div>
            )}
          </div>
          )}

          {/* User list */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48' }}>
              {isStoreOwner ? 'Your Store Users' : `All Users (${users.length})`}
            </div>
            <button onClick={loadAll} style={{ fontSize:11, color:'#6B7F78', background:'none', border:'1px solid #E3DDD0', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:'inherit' }}>Refresh</button>
          </div>
          {(() => {
            const visibleUsers = isManager
              ? users.filter(u => (u.storeId || u.store) === currentStoreId && u.role === 'staff')
              : isStoreOwner
              ? users.filter(u => (u.storeId || u.store) === currentStoreId && u.role !== 'super_owner' && u.role !== 'regional_owner' && u.role !== 'store_owner')
              : users
            if (visibleUsers.length === 0) return <div style={{textAlign:'center',padding:32,color:'#6B7F78'}}>No users found</div>
            return visibleUsers.map(user => {
              const store = stores.find(s => s.id === (user.storeId || user.store))
              const isEditing = editingUser?.emailKey === user.emailKey
              const roleColors = { super_owner:'#9B59B6', regional_owner:'#2980B9', store_owner:'#C1683C', manager:'#27AE60', staff:'#6B7F78' }
              const roleColor = roleColors[user.role] || '#6B7F78'
              const isInactive = user.status === 'inactive'
              return (
                <div key={user.emailKey} style={{ ...card, opacity: isInactive ? 0.65 : 1 }}>
                  {!isEditing ? (
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.name || user.email}</div>
                        <div style={{ fontSize:11, color:'#6B7F78', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:6 }}>{user.email}</div>
                        <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                          <span style={{ fontSize:10, fontWeight:700, color:'#fff', background:roleColor, borderRadius:4, padding:'2px 7px' }}>{(user.role||'').replace(/_/g,' ')}</span>
                          {store && <span style={{ fontSize:10, color:'#6B7F78', background:'#EEE3D3', borderRadius:4, padding:'2px 7px' }}>{store.name}</span>}
                          {isInactive && <span style={{ fontSize:10, color:'#E74C3C', background:'#FFEBEE', borderRadius:4, padding:'2px 7px' }}>Inactive</span>}
                        </div>
                      </div>
                      {isSuperOwnerUser && (
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        <button onClick={() => setEditingUser({ ...user })}
                          style={{ fontSize:11, color:'#6B7F78', background:'none', border:'1px solid #E3DDD0', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:'inherit' }}>Edit</button>
                        {user.email !== 'dumonttexas@gmail.com' && (
                          <>
                            <button onClick={() => toggleUserActive(user)}
                              style={{ fontSize:11, color: isInactive ? '#27AE60' : '#E74C3C', background:'none', border:`1px solid ${isInactive ? '#C8E6C9' : '#FFCDD2'}`, borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:'inherit' }}>
                              {isInactive ? 'Activate' : 'Deactivate'}
                            </button>
                            <button onClick={() => deleteUser(user)}
                              style={{ fontSize:11, color:'#fff', background:'#E74C3C', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:'inherit' }}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#1A4C48', marginBottom:10 }}>Edit: {user.name || user.email}</div>
                      <select value={editingUser.role || ''} onChange={e => setEditingUser(u => ({...u, role:e.target.value}))} style={input}>
                        <option value="store_owner">Store Owner</option>
                        <option value="manager">Manager</option>
                        <option value="regional_owner">Regional Owner</option>
                        <option value="staff">Staff</option>
                      </select>
                      <select value={editingUser.storeId || editingUser.store || ''} onChange={e => setEditingUser(u => ({...u, storeId:e.target.value}))} style={input}>
                        <option value="">No Store Assigned</option>
                        {stores.map(s => {
                          const r = regions.find(r => r.id === s.regionId)
                          return <option key={s.id} value={s.id}>{r ? `${r.name} › ` : ''}{s.name}</option>
                        })}
                      </select>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => saveUserEdit(user.emailKey, {
                          role: editingUser.role,
                          storeId: editingUser.storeId || editingUser.store || '',
                          store:   editingUser.storeId || editingUser.store || '',
                        })} style={{ ...btn(), flex:1 }} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
                        <button onClick={() => setEditingUser(null)} style={{ ...btn('#888'), flex:'none', padding:'11px 20px' }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          })()}
        </div>
      )}

      {view === 'items' && (
        <div>
          {orgs.length > 1 && (
            <select value={viewingOrg} onChange={e => { if(setViewingOrg) setViewingOrg(e.target.value) }} style={{ ...input, marginBottom:12 }}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <ItemManager orgId={viewingOrg || 'dumont'} orgItemsHook={orgItemsHook} showToast={showToast} />
        </div>
      )}

      {view === 'pricing' && (
        <div>
          {orgs.length > 1 && (
            <select value={viewingOrg} onChange={e => { if(setViewingOrg) setViewingOrg(e.target.value) }} style={{ ...input, marginBottom:12 }}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <Pricing orgItemsHook={orgItemsHook} viewingStore={viewingStore} viewingOrg={viewingOrg || 'dumont'} showToast={showToast} />
        </div>
      )}

      {view === 'sop' && (
        <SOPManager viewingOrg={viewingOrg || 'dumont'} viewingStore={viewingStore} auth={auth} showToast={showToast} />
      )}

      {view === 'settings' && (
        <OrgSettings orgId={viewingOrg || 'dumont'} orgData={orgs.find(o => o.id === (viewingOrg || 'dumont'))} showToast={showToast} onUpdate={() => loadAll()} />
      )}

      {view === 'pending' && (
        <div>
          {pending.length === 0 ? (
            <div style={{textAlign:'center',padding:32,color:'#6B7F78'}}>No pending signups</div>
          ) : pending.map(req => (
            <div key={req.id} style={card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'#1A4C48'}}>{req.email}</div>
                  <div style={{fontSize:11,color:'#6B7F78'}}>{req.store||'No store'} · {new Date(req.createdAt||Date.now()).toLocaleDateString()}</div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={() => approveSignup(req)} style={{background:'#27AE60',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'inherit'}}>Approve</button>
                  <button onClick={() => rejectSignup(req)} style={{background:'#E74C3C',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'inherit'}}>Reject</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
