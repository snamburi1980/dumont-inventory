import { useState, useEffect } from 'react'
import {
  collection, getDocs, addDoc, updateDoc,
  deleteDoc, doc, setDoc
} from 'firebase/firestore'
import { db } from '../firebase/config'
import ItemManager  from './ItemManager'
import OrgSetup     from './OrgSetup'
import Pricing      from './Pricing'
import SOPManager   from './SOPManager'
import OrgSettings  from './OrgSettings'
import { logAudit, AUDIT_ACTIONS } from '../utils/auditLogger'

const APP_URL = 'https://snamburi1980.github.io/dumont-inventory/'

export default function Admin({ showToast, auth, orgItemsHook, viewingOrg, setViewingOrg, viewingStore }) {
  const [view,         setView]         = useState('overview')
  const [orgs,         setOrgs]         = useState([])
  const [regions,      setRegions]      = useState([])
  const [stores,       setStores]       = useState([])
  const [pending,      setPending]      = useState([])
  const [loading,      setLoading]      = useState(false)
  const [showOrgSetup, setShowOrgSetup] = useState(false)

  // Guided setup flow
  const [setupStep,    setSetupStep]    = useState(null) // null | 'region' | 'store' | 'user'
  const [setupOrgId,   setSetupOrgId]   = useState(null)
  const [setupRegionId,setSetupRegionId]= useState(null)

  // Forms
  const [newRegion, setNewRegion] = useState({ name:'', orgId:'' })
  const [newStore,  setNewStore]  = useState({ name:'', regionId:'' })
  const [newUser,   setNewUser]   = useState({ email:'', name:'', role:'store_owner', orgId:'', regionId:'', storeId:'', tempPassword:'' })
  const [userSaved, setUserSaved] = useState(null) // null | {email, role, store}
  const [saving,    setSaving]    = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [orgSnap, regSnap, storeSnap, pendSnap] = await Promise.all([
        getDocs(collection(db, 'orgs')),
        getDocs(collection(db, 'regions')),
        getDocs(collection(db, 'stores')),
        getDocs(collection(db, 'signupRequests')),
      ])
      setOrgs(orgSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setRegions(regSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setStores(storeSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setPending(pendSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function createRegion() {
    if (!newRegion.name.trim() || !newRegion.orgId) { showToast('Fill all fields'); return }
    // Check duplicate
    const exists = regions.find(r => r.name.toLowerCase() === newRegion.name.toLowerCase() && r.orgId === newRegion.orgId)
    if (exists) { showToast(`Region "${newRegion.name}" already exists`); return }
    setSaving(true)
    const ref = await addDoc(collection(db, 'regions'), {
      name: newRegion.name, orgId: newRegion.orgId, active: true, createdAt: Date.now()
    })
    await logAudit({ action: AUDIT_ACTIONS.REGION_CREATED, orgId: newRegion.orgId, userEmail: auth.userConfig?.email, details: { name: newRegion.name } })
    await loadAll()
    setSaving(false)
    showToast(`Region "${newRegion.name}" created`)
    // If in guided flow, move to next step
    if (setupStep === 'region') {
      setSetupRegionId(ref.id)
      setSetupStep('store')
      setNewStore(s => ({ ...s, regionId: ref.id }))
    }
    setNewRegion({ name:'', orgId:'' })
  }

  async function createStore() {
    if (!newStore.name.trim() || !newStore.regionId) { showToast('Fill all fields'); return }
    // Check duplicate
    const exists = stores.find(s => s.name.toLowerCase() === newStore.name.toLowerCase() && s.regionId === newStore.regionId)
    if (exists) { showToast(`Store "${newStore.name}" already exists in this region`); return }
    setSaving(true)
    const region = regions.find(r => r.id === newStore.regionId)
    const ref = await addDoc(collection(db, 'stores'), {
      name: newStore.name, regionId: newStore.regionId,
      orgId: region?.orgId || '', active: true, createdAt: Date.now()
    })
    await logAudit({ action: AUDIT_ACTIONS.STORE_CREATED, orgId: region?.orgId, userEmail: auth.userConfig?.email, details: { name: newStore.name } })
    await loadAll()
    setSaving(false)
    showToast(`Store "${newStore.name}" created`)
    if (setupStep === 'store') {
      setSetupStep('user')
      setNewUser(u => ({ ...u, storeId: ref.id }))
    }
    setNewStore({ name:'', regionId:'' })
  }

  async function assignUser() {
    if (!newUser.email.trim()) { showToast('Enter email'); return }
    if (!newUser.tempPassword?.trim()) { showToast('Enter a temporary password'); return }
    setSaving(true)
    const emailKey = newUser.email.toLowerCase().replace(/\./g,'_').replace(/@/g,'_at_')
    const store    = stores.find(s => s.id === newUser.storeId)
    const region   = regions.find(r => r.id === (newUser.regionId || store?.regionId))
    const org      = orgs.find(o => o.id === (newUser.orgId || region?.orgId))
    await setDoc(doc(db, 'users', emailKey), {
      email:               newUser.email.toLowerCase(),
      name:                newUser.name || newUser.email,
      role:                newUser.role,
      orgId:               org?.id    || viewingOrg || '',
      regionId:            region?.id || '',
      storeId:             store?.id  || '',
      store:               store?.id  || '',
      status:              'active',
      forcePasswordChange: true,
      createdAt:           Date.now()
    })
    await logAudit({ action: AUDIT_ACTIONS.USER_ASSIGNED, userEmail: auth.userConfig?.email, details: { assignedEmail: newUser.email, role: newUser.role } })
    setSaving(false)
    setUserSaved({ email: newUser.email, name: newUser.name, password: newUser.tempPassword || '', role: newUser.role, store: store?.name || '' })
    if (setupStep === 'user') setSetupStep('done')
    setNewUser({ email:'', name:'', role:'store_owner', orgId:'', regionId:'', storeId:'', tempPassword:'' })
  }

  async function approveSignup(req) {
    try {
      const emailKey = req.email.replace(/\./g,'_').replace(/@/g,'_at_')
      await updateDoc(doc(db, 'users', emailKey), {
        status: 'active', role: req.role || 'store_owner',
        storeId: req.store || '', store: req.store || ''
      })
      await deleteDoc(doc(db, 'signupRequests', req.id))
      setPending(prev => prev.filter(p => p.id !== req.id))
      showToast(`${req.email} approved`)
    } catch(e) { showToast('Error approving') }
  }

  async function rejectSignup(req) {
    await deleteDoc(doc(db, 'signupRequests', req.id))
    setPending(prev => prev.filter(p => p.id !== req.id))
    showToast(`${req.email} rejected`)
  }

  const card  = { background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:'14px 16px', marginBottom:12 }
  const input = { width:'100%', padding:'9px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, marginBottom:8, boxSizing:'border-box', background:'#FDF6EC' }
  const btn   = (color='#2C1810') => ({ background:color, color:'#fff', border:'none', borderRadius:8, padding:'11px 16px', cursor:'pointer', fontSize:13, fontWeight:600, width:'100%', fontFamily:'inherit', opacity: saving ? 0.7 : 1 })

  const isSuperOwnerUser = auth?.isSuperOwner?.()

  // Super owner sees all tabs, manager sees limited tabs
  const navTabs = isSuperOwnerUser ? [
    { id:'overview', label:'Overview' },
    { id:'setup',    label:'Setup'    },
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

  // Guided setup flow after org creation
  if (setupStep && setupStep !== 'done') {
    const steps = ['region','store','user']
    const stepIdx = steps.indexOf(setupStep)
    const org = orgs.find(o => o.id === setupOrgId)

    return (
      <div>
        {/* Progress */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:20 }}>
          {['Create Org','Add Region','Add Store','Add User'].map((s,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{
                width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:11, fontWeight:700,
                background: i <= stepIdx+1 ? '#2C1810' : '#EDE0CC',
                color: i <= stepIdx+1 ? '#fff' : '#8B7355', flexShrink:0
              }}>{i+1}</div>
              <span style={{ fontSize:11, color: i === stepIdx+1 ? '#2C1810' : '#8B7355', fontWeight: i===stepIdx+1?700:400, whiteSpace:'nowrap' }}>{s}</span>
              {i < 3 && <div style={{ width:16, height:2, background:'#EDE0CC' }}/>}
            </div>
          ))}
        </div>

        {/* Step: Add Region */}
        {setupStep === 'region' && (
          <div style={card}>
            <div style={{ fontSize:15, fontWeight:700, color:'#2C1810', marginBottom:4 }}>Add Region</div>
            <div style={{ fontSize:12, color:'#8B7355', marginBottom:12 }}>For org: {org?.name}</div>
            <input placeholder="Region name (e.g. Texas, NC, Southeast)" value={newRegion.name}
              onChange={e => setNewRegion(r=>({...r, name:e.target.value, orgId:setupOrgId}))} style={input}/>
            <button style={btn()} onClick={createRegion} disabled={saving}>
              {saving ? 'Creating...' : 'Add Region and Continue'}
            </button>
            <button onClick={() => { setSetupStep(null); setView('overview') }}
              style={{ ...btn('#888'), marginTop:8 }}>
              Skip — Do Later
            </button>
          </div>
        )}

        {/* Step: Add Store */}
        {setupStep === 'store' && (
          <div style={card}>
            <div style={{ fontSize:15, fontWeight:700, color:'#2C1810', marginBottom:4 }}>Add Store</div>
            <div style={{ fontSize:12, color:'#8B7355', marginBottom:12 }}>
              Region: {regions.find(r=>r.id===setupRegionId)?.name}
            </div>
            <input placeholder="Store name (e.g. Coppell, Frisco, Austin)" value={newStore.name}
              onChange={e => setNewStore(s=>({...s, name:e.target.value, regionId:setupRegionId}))} style={input}/>
            <button style={btn()} onClick={createStore} disabled={saving}>
              {saving ? 'Creating...' : 'Add Store and Continue'}
            </button>
            <button onClick={() => setSetupStep('user')}
              style={{ ...btn('#888'), marginTop:8 }}>
              Skip — Do Later
            </button>
          </div>
        )}

        {/* Step: Assign User */}
        {setupStep === 'user' && (
          <div style={card}>
            <div style={{ fontSize:15, fontWeight:700, color:'#2C1810', marginBottom:4 }}>Assign User</div>
            <div style={{ fontSize:12, color:'#8B7355', marginBottom:4 }}>
              Create the user in Firebase Console → Authentication first, then assign here.
            </div>
            <div style={{ background:'#FFF3E0', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:11, color:'#C8843A' }}>
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
            <button style={btn()} onClick={assignUser} disabled={saving}>
              {saving ? 'Saving...' : 'Assign User'}
            </button>
            <button onClick={() => { setSetupStep(null); setView('overview') }}
              style={{ ...btn('#888'), marginTop:8 }}>
              Skip — Do Later
            </button>
          </div>
        )}
      </div>
    )
  }

  // Done step - show credentials to share
  if (setupStep === 'done' && userSaved) {
    return (
      <div>
        <div style={{ ...card, textAlign:'center', background:'#E8F5E9', border:'1px solid #27AE60' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>OK</div>
          <div style={{ fontSize:16, fontWeight:700, color:'#2C1810', marginBottom:4 }}>Setup Complete!</div>
          <div style={{ fontSize:12, color:'#8B7355', marginBottom:16 }}>Share these details with your user</div>
        </div>
        <div style={card}>
          <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:12 }}>Share with {userSaved.email}</div>
          {[
            { label:'App URL',  value: APP_URL },
            { label:'Email',    value: userSaved.email },
            { label:'Password', value: '(the one you set in Firebase)' },
            { label:'Role',     value: userSaved.role },
            { label:'Store',    value: userSaved.store || 'Not assigned' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #EDE0CC' }}>
              <span style={{ fontSize:12, color:'#8B7355', fontWeight:600 }}>{label}</span>
              <span style={{ fontSize:12, color:'#2C1810', fontWeight:500 }}>{value}</span>
            </div>
          ))}
          <button
            onClick={() => {
              const text = `Dumont Inventory App\nURL: ${APP_URL}\nEmail: ${userSaved.email}\nRole: ${userSaved.role}\nStore: ${userSaved.store}\nUse the password set in Firebase. You can change it after login.`
              navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'))
            }}
            style={{ ...btn(), marginTop:12 }}
          >
            Copy to Share
          </button>
          <div style={{ marginTop:10, padding:'10px 12px', background:'#FDF6EC', borderRadius:8, fontSize:11, color:'#8B7355' }}>
            The user can change their password after login via the Profile option.
          </div>
        </div>
        <button onClick={() => { setSetupStep(null); setUserSaved(null); setView('overview') }}
          style={{ ...btn('#2C1810'), marginTop:4 }}>
          Done — Back to Overview
        </button>
      </div>
    )
  }

  if (showOrgSetup) {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <button onClick={() => setShowOrgSetup(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#8B7355' }}>
            {'<'} Back
          </button>
          <div style={{ fontSize:15, fontWeight:700, color:'#2C1810' }}>New Organisation Setup</div>
        </div>
        <OrgSetup
          showToast={showToast}
          existingOrgs={orgs}
          onComplete={(orgId) => {
            setShowOrgSetup(false)
            if (setViewingOrg) setViewingOrg(orgId)
            // Start guided flow
            setSetupOrgId(orgId)
            setNewRegion(r => ({ ...r, orgId }))
            loadAll().then(() => setSetupStep('region'))
            showToast('Organisation created! Now add a region.')
          }}
        />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {navTabs.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{
            padding:'6px 14px', borderRadius:20, border:'1px solid #EDE0CC',
            background: view===t.id ? '#2C1810' : '#fff',
            color: view===t.id ? '#fff' : '#8B7355',
            fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap'
          }}>{t.label}</button>
        ))}
      </div>

      {loading && <div style={{textAlign:'center',padding:24,color:'#8B7355'}}>Loading...</div>}

      {/* OVERVIEW */}
      {view === 'overview' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
            {[
              { label:'Orgs',    value:orgs.length,    color:'#C8843A' },
              { label:'Regions', value:regions.length, color:'#2980B9' },
              { label:'Stores',  value:stores.length,  color:'#27AE60' },
              { label:'Pending', value:pending.length, color:pending.length>0?'#E74C3C':'#8B7355' },
            ].map(({label,value,color}) => (
              <div key={label} style={{...card,textAlign:'center',marginBottom:0}}>
                <div style={{fontSize:28,fontWeight:700,color}}>{value}</div>
                <div style={{fontSize:11,color:'#8B7355',textTransform:'uppercase'}}>{label}</div>
              </div>
            ))}
          </div>

          {orgs.map(org => (
            <div key={org.id} style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#2C1810' }}>{org.name}</div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={() => { if(setViewingOrg) setViewingOrg(org.id); setView('items') }}
                    style={{ fontSize:11, color:'#C8843A', background:'none', border:'1px solid #C8843A', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>
                    Items
                  </button>
                  <button onClick={async () => {
                    if (!window.confirm(`Delete org "${org.name}"?`)) return
                    await deleteDoc(doc(db, 'orgs', org.id))
                    showToast('Org deleted'); loadAll()
                  }} style={{ fontSize:11, color:'#E74C3C', background:'none', border:'1px solid #FFCDD2', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
              {regions.filter(r => r.orgId===org.id).map(region => (
                <div key={region.id} style={{ marginLeft:16, marginBottom:6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#2980B9' }}>{region.name}</div>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={async () => {
                        const name = window.prompt('Edit region name:', region.name)
                        if (!name || name === region.name) return
                        await updateDoc(doc(db, 'regions', region.id), { name })
                        showToast('Updated'); loadAll()
                      }} style={{ fontSize:10, color:'#8B7355', background:'none', border:'1px solid #EDE0CC', borderRadius:4, padding:'2px 6px', cursor:'pointer' }}>Edit</button>
                      <button onClick={async () => {
                        if (stores.filter(s=>s.regionId===region.id).length > 0) { showToast('Remove stores first'); return }
                        if (!window.confirm(`Delete "${region.name}"?`)) return
                        await deleteDoc(doc(db, 'regions', region.id))
                        showToast('Deleted'); loadAll()
                      }} style={{ fontSize:10, color:'#E74C3C', background:'none', border:'1px solid #FFCDD2', borderRadius:4, padding:'2px 6px', cursor:'pointer' }}>Del</button>
                    </div>
                  </div>
                  {stores.filter(s => s.regionId===region.id).map(store => (
                    <div key={store.id} style={{ marginLeft:16, fontSize:12, color:'#8B7355', padding:'3px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
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
                        }} style={{ fontSize:10, color:'#8B7355', background:'none', border:'1px solid #EDE0CC', borderRadius:4, padding:'2px 6px', cursor:'pointer' }}>Edit</button>
                        <button onClick={async () => {
                          if (!window.confirm(`Delete "${store.name}"?`)) return
                          await deleteDoc(doc(db, 'stores', store.id))
                          showToast('Deleted'); loadAll()
                        }} style={{ fontSize:10, color:'#E74C3C', background:'none', border:'1px solid #FFCDD2', borderRadius:4, padding:'2px 6px', cursor:'pointer' }}>Del</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {isSuperOwnerUser && <button onClick={() => setShowOrgSetup(true)}
            style={{ width:'100%', background:'#C8843A', color:'#fff', border:'none', borderRadius:10, padding:'13px', cursor:'pointer', fontSize:13, fontWeight:700, marginTop:4, fontFamily:'inherit' }}>
            + Create New Organisation
          </button>}
        </div>
      )}

      {/* SETUP — Region, Store, User only */}
      {view === 'setup' && (
        <div>
          {/* Add Region */}
          <div style={card}>
            <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:10 }}>Add Region</div>
            <select value={newRegion.orgId} onChange={e => setNewRegion(r=>({...r,orgId:e.target.value}))} style={input}>
              <option value="">Select Org</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input placeholder="Region name (e.g. Texas, NC)" value={newRegion.name}
              onChange={e => setNewRegion(r=>({...r,name:e.target.value}))} style={input}/>
            <button style={btn()} onClick={createRegion} disabled={saving}>
              {saving ? 'Creating...' : '+ Add Region'}
            </button>
          </div>

          {/* Add Store */}
          <div style={card}>
            <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:10 }}>Add Store</div>
            <select value={newStore.regionId} onChange={e => setNewStore(s=>({...s,regionId:e.target.value}))} style={input}>
              <option value="">Select Region</option>
              {regions.map(r => {
                const org = orgs.find(o=>o.id===r.orgId)
                return <option key={r.id} value={r.id}>{org?.name} — {r.name}</option>
              })}
            </select>
            <input placeholder="Store name (e.g. Coppell, Frisco)" value={newStore.name}
              onChange={e => setNewStore(s=>({...s,name:e.target.value}))} style={input}/>
            <button style={btn()} onClick={createStore} disabled={saving}>
              {saving ? 'Creating...' : '+ Add Store'}
            </button>
          </div>

          {/* Assign User */}
          <div style={card}>
            <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:4 }}>Assign User</div>
            <div style={{ fontSize:11, color:'#8B7355', marginBottom:10, lineHeight:1.6 }}>
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
            <button style={btn()} onClick={assignUser} disabled={saving}>
              {saving ? 'Saving...' : 'Assign User'}
            </button>

            {/* Show credentials after assign */}
            {userSaved && (
              <div style={{ marginTop:12, padding:'12px', background:'#E8F5E9', borderRadius:8, border:'1px solid #27AE60' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#27AE60', marginBottom:8 }}>User assigned! Share these details:</div>
                {[
                  { label:'App URL',  value: APP_URL },
                  { label:'Email',    value: userSaved.email },
                  { label:'Password', value: '(set in Firebase Auth)' },
                  { label:'Store',    value: userSaved.store || 'See admin' },
                ].map(({label,value}) => (
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'3px 0', borderBottom:'1px solid #C8E6C9' }}>
                    <span style={{color:'#8B7355',fontWeight:600}}>{label}</span>
                    <span style={{color:'#2C1810'}}>{value}</span>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const text = `Dumont Inventory App\nURL: ${APP_URL}\nEmail: ${userSaved.email}\nPassword: (the one you set)\nStore: ${userSaved.store}`
                    navigator.clipboard.writeText(text).then(() => showToast('Copied!'))
                  }}
                  style={{ marginTop:8, background:'#27AE60', color:'#fff', border:'none', borderRadius:6, padding:'7px 14px', cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}
                >
                  Copy to Share
                </button>
                <div style={{ marginTop:6, fontSize:10, color:'#8B7355' }}>
                  User can change password after login via Profile settings.
                </div>
              </div>
            )}
          </div>

          {/* All Stores */}
          <div style={card}>
            <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:10 }}>All Stores</div>
            {stores.length === 0 ? (
              <div style={{color:'#8B7355',fontSize:13}}>No stores yet</div>
            ) : stores.map(store => {
              const region = regions.find(r=>r.id===store.regionId)
              const org    = orgs.find(o=>o.id===store.orgId)
              return (
                <div key={store.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #EDE0CC' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#2C1810' }}>{store.name}</div>
                    <div style={{ fontSize:11, color:'#8B7355' }}>{org?.name} {'>'} {region?.name || 'No region'}</div>
                  </div>
                  <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:'#E8F5E9', color:'#27AE60', fontWeight:600 }}>Active</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ITEMS */}
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

      {/* PRICING */}
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

      {/* SOP */}
      {view === 'sop' && (
        <SOPManager viewingOrg={viewingOrg || 'dumont'} viewingStore={viewingStore} auth={auth} showToast={showToast} />
      )}

      {/* SETTINGS */}
      {view === 'settings' && (
        <OrgSettings orgId={viewingOrg || 'dumont'} orgData={orgs.find(o => o.id === (viewingOrg || 'dumont'))} showToast={showToast} onUpdate={() => loadAll()} />
      )}

      {/* PENDING */}
      {view === 'pending' && (
        <div>
          {pending.length === 0 ? (
            <div style={{textAlign:'center',padding:32,color:'#8B7355'}}>No pending signups</div>
          ) : pending.map(req => (
            <div key={req.id} style={card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'#2C1810'}}>{req.email}</div>
                  <div style={{fontSize:11,color:'#8B7355'}}>{req.store||'No store'} · {new Date(req.createdAt||Date.now()).toLocaleDateString()}</div>
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
