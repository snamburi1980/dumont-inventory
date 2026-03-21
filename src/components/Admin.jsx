import { useState, useEffect } from 'react'
import {
  collection, getDocs, addDoc, updateDoc,
  deleteDoc, doc, setDoc
} from 'firebase/firestore'
import { logAudit, AUDIT_ACTIONS } from '../utils/auditLogger'
import { db } from '../firebase/config'
import ItemManager  from './ItemManager'
import OrgSetup     from './OrgSetup'
import Pricing      from './Pricing'
import SOPManager   from './SOPManager'
import OrgSettings  from './OrgSettings'

export default function Admin({ showToast, auth, orgItemsHook, viewingOrg, setViewingOrg, viewingStore }) {
  const [view,      setView]      = useState('overview')
  const [orgs,      setOrgs]      = useState([])
  const [regions,   setRegions]   = useState([])
  const [stores,    setStores]    = useState([])
  const [pending,   setPending]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [showOrgSetup, setShowOrgSetup] = useState(false)

  const [newRegion, setNewRegion] = useState({ name:'', orgId:'' })
  const [newStore,  setNewStore]  = useState({ name:'', regionId:'' })
  const [newUser,   setNewUser]   = useState({ email:'', name:'', role:'store_owner', orgId:'', regionId:'', storeId:'' })
  const [userSaved, setUserSaved] = useState(false)

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
    await addDoc(collection(db, 'regions'), {
      name: newRegion.name, orgId: newRegion.orgId, active: true, createdAt: Date.now()
    })
    await logAudit({ action: AUDIT_ACTIONS.REGION_CREATED, orgId: newRegion.orgId, userEmail: auth.userConfig?.email, details: { name: newRegion.name } })
    showToast('Region created')
    setNewRegion({ name:'', orgId:'' })
    loadAll()
  }

  async function createStore() {
    if (!newStore.name.trim() || !newStore.regionId) { showToast('Fill all fields'); return }
    const region = regions.find(r => r.id === newStore.regionId)
    await addDoc(collection(db, 'stores'), {
      name: newStore.name, regionId: newStore.regionId,
      orgId: region?.orgId || '', active: true, createdAt: Date.now()
    })
    await logAudit({ action: AUDIT_ACTIONS.STORE_CREATED, orgId: region?.orgId, userEmail: auth.userConfig?.email, details: { name: newStore.name } })
    showToast('Store created')
    setNewStore({ name:'', regionId:'' })
    loadAll()
  }

  async function assignUser() {
    if (!newUser.email.trim()) { showToast('Enter email'); return }
    const emailKey = newUser.email.toLowerCase().replace(/\./g,'_').replace(/@/g,'_at_')
    const store    = stores.find(s => s.id === newUser.storeId)
    const region   = regions.find(r => r.id === (newUser.regionId || store?.regionId))
    const org      = orgs.find(o => o.id === (newUser.orgId || region?.orgId))
    await setDoc(doc(db, 'users', emailKey), {
      email:    newUser.email.toLowerCase(),
      name:     newUser.name || newUser.email,
      role:     newUser.role,
      orgId:    org?.id    || '',
      regionId: region?.id || '',
      storeId:  store?.id  || '',
      store:    store?.id  || '',
      status:   'active',
      createdAt: Date.now()
    })
    await logAudit({ action: AUDIT_ACTIONS.USER_ASSIGNED, orgId: org?.id, userEmail: auth.userConfig?.email, details: { assignedEmail: newUser.email, role: newUser.role } })
    showToast(`${newUser.email} assigned`)
    setUserSaved(true)
    setTimeout(() => setUserSaved(false), 3000)
    setNewUser({ email:'', name:'', role:'store_owner', orgId:'', regionId:'', storeId:'' })
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

  const card  = { background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:'14px 16px', marginBottom:10 }
  const input = { width:'100%', padding:'9px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, marginBottom:8, boxSizing:'border-box', background:'#FDF6EC' }
  const btn   = { background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'11px 16px', cursor:'pointer', fontSize:13, fontWeight:600, width:'100%' }

  const navTabs = [
    { id:'overview',  label:'Overview'   },
    { id:'items',     label:'Items'      },
    { id:'pricing',   label:'Pricing'    },
    { id:'sop',       label:'SOPs'       },
    { id:'settings',  label:'Settings'   },
    { id:'regions',   label:'Regions'    },
    { id:'stores',    label:'Stores'     },
    { id:'users',     label:'Users'      },
    { id:'pending',   label:`Pending${pending.length > 0 ? ` (${pending.length})` : ''}` },
  ]

  // OrgSetup wizard overlay
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
            loadAll()
            if (setViewingOrg) setViewingOrg(orgId)
            showToast('Organisation created successfully')
          }}
        />
      </div>
    )
  }

  return (
    <div>
      {/* Sub nav */}
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
              <div key={label} style={{...card, textAlign:'center', marginBottom:0}}>
                <div style={{fontSize:28,fontWeight:700,color}}>{value}</div>
                <div style={{fontSize:11,color:'#8B7355',textTransform:'uppercase'}}>{label}</div>
              </div>
            ))}
          </div>

          {/* Org tree */}
          {orgs.map(org => (
            <div key={org.id} style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#2C1810' }}>{org.name}</div>
                <div style={{display:'flex',gap:6}}>
                  <button
                    onClick={() => { if(setViewingOrg) setViewingOrg(org.id); setView('items') }}
                    style={{ fontSize:11, color:'#C8843A', background:'none', border:'1px solid #C8843A', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}
                  >
                    Manage Items
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Delete org "${org.name}"? This cannot be undone.`)) return
                      await deleteDoc(doc(db, 'orgs', org.id))
                      showToast('Org deleted')
                      loadAll()
                    }}
                    style={{ fontSize:11, color:'#E74C3C', background:'none', border:'1px solid #FFCDD2', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {regions.filter(r => r.orgId===org.id).map(region => (
                <div key={region.id} style={{ marginLeft:16, marginBottom:6 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#2980B9', marginBottom:3 }}>{region.name}</div>
                  {stores.filter(s => s.regionId===region.id).map(store => (
                    <div key={store.id} style={{ marginLeft:16, fontSize:12, color:'#8B7355', padding:'2px 0', display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:'#27AE60'}}/>
                      {store.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {/* Create new org button */}
          <button
            onClick={() => setShowOrgSetup(true)}
            style={{ width:'100%', background:'#C8843A', color:'#fff', border:'none', borderRadius:10, padding:'13px', cursor:'pointer', fontSize:13, fontWeight:700, marginTop:4 }}
          >
            + Create New Organisation
          </button>
        </div>
      )}

      {/* ITEMS */}
      {view === 'items' && (
        <div>
          {/* Org selector */}
          {orgs.length > 1 && (
            <div style={{ marginBottom:12 }}>
              <select
                value={viewingOrg}
                onChange={e => { if(setViewingOrg) setViewingOrg(e.target.value) }}
                style={{ ...input, marginBottom:0 }}
              >
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <ItemManager
            orgId={viewingOrg || 'dumont'}
            orgItemsHook={orgItemsHook}
            showToast={showToast}
          />
        </div>
      )}

      {/* PRICING */}
      {view === 'pricing' && (
        <div>
          {orgs.length > 1 && (
            <div style={{ marginBottom:12 }}>
              <select value={viewingOrg} onChange={e => { if(setViewingOrg) setViewingOrg(e.target.value) }} style={{ ...input, marginBottom:0 }}>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <Pricing
            orgItemsHook={orgItemsHook}
            viewingStore={viewingStore}
            viewingOrg={viewingOrg || 'dumont'}
            showToast={showToast}
          />
        </div>
      )}

      {/* SOP */}
      {view === 'sop' && (
        <SOPManager
          viewingOrg={viewingOrg || 'dumont'}
          viewingStore={viewingStore}
          auth={auth}
          showToast={showToast}
        />
      )}

      {/* SETTINGS */}
      {view === 'settings' && (
        <OrgSettings
          orgId={viewingOrg || 'dumont'}
          orgData={orgs.find(o => o.id === (viewingOrg || 'dumont'))}
          showToast={showToast}
          onUpdate={() => loadAll()}
        />
      )}

      {/* REGIONS */}
      {view === 'regions' && (
        <div>
          <div style={card}>
            <div style={{fontSize:13,fontWeight:700,color:'#2C1810',marginBottom:10}}>Create New Region</div>
            <select value={newRegion.orgId} onChange={e => setNewRegion(r=>({...r,orgId:e.target.value}))} style={input}>
              <option value="">Select Org</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input placeholder="Region name (e.g. Texas)" value={newRegion.name}
              onChange={e => setNewRegion(r=>({...r,name:e.target.value}))} style={input} />
            <button style={btn} onClick={createRegion}>Create Region</button>
          </div>
          {regions.map(region => {
            const org = orgs.find(o => o.id===region.orgId)
            return (
              <div key={region.id} style={card}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'#2C1810'}}>{region.name}</div>
                    <div style={{fontSize:11,color:'#8B7355'}}>{org?.name} · {stores.filter(s=>s.regionId===region.id).length} stores</div>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#E3F2FD',color:'#2980B9',fontWeight:600}}>{org?.name}</span>
                    <button
                      onClick={async () => {
                        const name = window.prompt('Edit region name:', region.name)
                        if (!name || name === region.name) return
                        await updateDoc(doc(db, 'regions', region.id), { name })
                        showToast('Region updated')
                        loadAll()
                      }}
                      style={{fontSize:11,padding:'4px 8px',background:'#FDF6EC',border:'1px solid #EDE0CC',borderRadius:6,cursor:'pointer',color:'#2C1810'}}
                    >Edit</button>
                    <button
                      onClick={async () => {
                        const storeCount = stores.filter(s=>s.regionId===region.id).length
                        if (storeCount > 0) { showToast('Remove all stores first'); return }
                        if (!window.confirm(`Delete region "${region.name}"?`)) return
                        await deleteDoc(doc(db, 'regions', region.id))
                        showToast('Region deleted')
                        loadAll()
                      }}
                      style={{fontSize:11,padding:'4px 8px',background:'#FFF0F0',border:'1px solid #FFCDD2',borderRadius:6,cursor:'pointer',color:'#E74C3C'}}
                    >Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* STORES */}
      {view === 'stores' && (
        <div>
          <div style={card}>
            <div style={{fontSize:13,fontWeight:700,color:'#2C1810',marginBottom:10}}>Create New Store</div>
            <select value={newStore.regionId} onChange={e => setNewStore(s=>({...s,regionId:e.target.value}))} style={input}>
              <option value="">Select Region</option>
              {regions.map(r => {
                const org = orgs.find(o => o.id===r.orgId)
                return <option key={r.id} value={r.id}>{org?.name} — {r.name}</option>
              })}
            </select>
            <input placeholder="Store name (e.g. Coppell)" value={newStore.name}
              onChange={e => setNewStore(s=>({...s,name:e.target.value}))} style={input} />
            <button style={btn} onClick={createStore}>Create Store</button>
          </div>
          {stores.map(store => {
            const region = regions.find(r => r.id===store.regionId)
            const org    = orgs.find(o => o.id===store.orgId)
            return (
              <div key={store.id} style={card}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'#2C1810'}}>{store.name}</div>
                    <div style={{fontSize:11,color:'#8B7355'}}>{org?.name} {'>'} {region?.name}</div>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#E8F5E9',color:'#27AE60',fontWeight:600}}>Active</span>
                    <button
                      onClick={async () => {
                        const name = window.prompt('Edit store name:', store.name)
                        if (!name || name === store.name) return
                        await updateDoc(doc(db, 'stores', store.id), { name })
                        showToast('Store updated')
                        loadAll()
                      }}
                      style={{fontSize:11,padding:'4px 8px',background:'#FDF6EC',border:'1px solid #EDE0CC',borderRadius:6,cursor:'pointer',color:'#2C1810'}}
                    >Edit</button>
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Delete store "${store.name}"? This cannot be undone.`)) return
                        await deleteDoc(doc(db, 'stores', store.id))
                        showToast('Store deleted')
                        loadAll()
                      }}
                      style={{fontSize:11,padding:'4px 8px',background:'#FFF0F0',border:'1px solid #FFCDD2',borderRadius:6,cursor:'pointer',color:'#E74C3C'}}
                    >Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* USERS */}
      {view === 'users' && (
        <div>
          <div style={card}>
            <div style={{fontSize:13,fontWeight:700,color:'#2C1810',marginBottom:4}}>Assign User to Store</div>
            <div style={{fontSize:11,color:'#8B7355',marginBottom:12,lineHeight:1.6}}>
              First create the user in Firebase Console → Authentication → Add User. Then assign them here.
            </div>
            <input placeholder="Full Name" value={newUser.name} onChange={e => setNewUser(u=>({...u,name:e.target.value}))} style={input} />
            <input placeholder="Email address" value={newUser.email} onChange={e => setNewUser(u=>({...u,email:e.target.value}))} style={input} />
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
            {newUser.role==='org_owner' && (
              <select value={newUser.orgId} onChange={e => setNewUser(u=>({...u,orgId:e.target.value}))} style={input}>
                <option value="">Select Org</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
            <button style={{...btn, background: userSaved ? '#27AE60' : '#2C1810'}} onClick={assignUser}>
              {userSaved ? 'Saved!' : 'Assign User'}
            </button>

            <div style={{marginTop:14,padding:12,background:'#FDF6EC',borderRadius:8}}>
              <div style={{fontSize:12,fontWeight:700,color:'#2C1810',marginBottom:6}}>Onboarding Steps:</div>
              <div style={{fontSize:11,color:'#8B7355',lineHeight:2}}>
                1. Firebase Console → Authentication → Add User<br/>
                2. Enter their email + temporary password<br/>
                3. Fill form above and click Assign User<br/>
                4. Share app URL + credentials with them
              </div>
            </div>
          </div>
        </div>
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
                  <button onClick={() => approveSignup(req)} style={{background:'#27AE60',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>Approve</button>
                  <button onClick={() => rejectSignup(req)}  style={{background:'#E74C3C',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>Reject</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
