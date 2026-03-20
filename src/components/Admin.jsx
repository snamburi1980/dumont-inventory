import { useState, useEffect } from 'react'
import {
  collection, getDocs, addDoc, updateDoc,
  deleteDoc, doc, setDoc, getDoc
} from 'firebase/firestore'
import { db } from '../firebase/config'

export default function Admin({ showToast, auth }) {
  const [view,     setView]     = useState('overview')
  const [orgs,     setOrgs]     = useState([])
  const [regions,  setRegions]  = useState([])
  const [stores,   setStores]   = useState([])
  const [pending,  setPending]  = useState([])
  const [loading,  setLoading]  = useState(false)

  const [newOrg,    setNewOrg]    = useState({ name:'' })
  const [newRegion, setNewRegion] = useState({ name:'', orgId:'' })
  const [newStore,  setNewStore]  = useState({ name:'', regionId:'' })
  const [newUser,   setNewUser]   = useState({
    email:'', role:'store_owner', orgId:'', regionId:'', storeId:'', name:''
  })
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

  async function createOrg() {
    if (!newOrg.name.trim()) return
    await addDoc(collection(db, 'orgs'), {
      name: newOrg.name, active: true, createdAt: Date.now()
    })
    showToast(`Org "${newOrg.name}" created`)
    setNewOrg({ name:'' })
    loadAll()
  }

  async function createRegion() {
    if (!newRegion.name.trim() || !newRegion.orgId) return
    await addDoc(collection(db, 'regions'), {
      name: newRegion.name, orgId: newRegion.orgId,
      active: true, createdAt: Date.now()
    })
    showToast(`Region "${newRegion.name}" created`)
    setNewRegion({ name:'', orgId:'' })
    loadAll()
  }

  async function createStore() {
    if (!newStore.name.trim() || !newStore.regionId) return
    const region = regions.find(r => r.id === newStore.regionId)
    await addDoc(collection(db, 'stores'), {
      name: newStore.name, regionId: newStore.regionId,
      orgId: region?.orgId || '', active: true, createdAt: Date.now()
    })
    showToast(`Store "${newStore.name}" created`)
    setNewStore({ name:'', regionId:'' })
    loadAll()
  }

  async function assignUser() {
    if (!newUser.email.trim()) { showToast('Enter email'); return }
    if (!newUser.storeId && !newUser.regionId && !newUser.orgId) {
      showToast('Select store/region/org'); return
    }
    const emailKey = newUser.email.toLowerCase().replace(/\./g,'_').replace(/@/g,'_at_')
    const store  = stores.find(s => s.id === newUser.storeId)
    const region = regions.find(r => r.id === (newUser.regionId || store?.regionId))
    const org    = orgs.find(o => o.id === (newUser.orgId || region?.orgId))

    await setDoc(doc(db, 'users', emailKey), {
      email:    newUser.email.toLowerCase(),
      name:     newUser.name || newUser.email,
      role:     newUser.role,
      orgId:    org?.id || '',
      regionId: region?.id || '',
      storeId:  store?.id || '',
      store:    store?.id || '',  // legacy field
      status:   'active',
      createdAt: Date.now()
    })
    showToast(`${newUser.email} assigned to ${store?.name || region?.name || org?.name}`)
    setUserSaved(true)
    setTimeout(() => setUserSaved(false), 3000)
    setNewUser({ email:'', role:'store_owner', orgId:'', regionId:'', storeId:'', name:'' })
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
    { id:'overview', label:'Overview' },
    { id:'orgs',     label:'Orgs' },
    { id:'regions',  label:'Regions' },
    { id:'stores',   label:'Stores' },
    { id:'users',    label:'Assign User' },
    { id:'pending',  label:`Pending${pending.length > 0 ? ` (${pending.length})` : ''}` },
  ]

  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {navTabs.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{
            padding:'6px 14px', borderRadius:20, border:'1px solid #EDE0CC',
            background: view===t.id ? '#2C1810' : '#fff',
            color: view===t.id ? '#fff' : '#8B7355',
            fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit'
          }}>{t.label}</button>
        ))}
      </div>

      {loading && <div style={{textAlign:'center',padding:24,color:'#8B7355'}}>Loading...</div>}

      {/* OVERVIEW */}
      {view === 'overview' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:16}}>
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
              <div style={{fontSize:14,fontWeight:700,color:'#2C1810',marginBottom:8}}>{org.name}</div>
              {regions.filter(r => r.orgId===org.id).map(region => (
                <div key={region.id} style={{marginLeft:16,marginBottom:6}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#2980B9',marginBottom:3}}>{region.name}</div>
                  {stores.filter(s => s.regionId===region.id).map(store => (
                    <div key={store.id} style={{marginLeft:16,fontSize:12,color:'#8B7355',padding:'2px 0',display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:'#27AE60'}}/>
                      {store.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ORGS */}
      {view === 'orgs' && (
        <div>
          <div style={card}>
            <div style={{fontSize:13,fontWeight:700,color:'#2C1810',marginBottom:10}}>Create New Org</div>
            <input placeholder="Org name (e.g. Dumont Creamery)" value={newOrg.name}
              onChange={e => setNewOrg({name:e.target.value})} style={input} />
            <button style={btn} onClick={createOrg}>Create Org</button>
          </div>
          {orgs.map(org => (
            <div key={org.id} style={card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'#2C1810'}}>{org.name}</div>
                  <div style={{fontSize:11,color:'#8B7355'}}>
                    {regions.filter(r=>r.orgId===org.id).length} regions · {stores.filter(s=>s.orgId===org.id).length} stores
                  </div>
                </div>
                <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#E8F5E9',color:'#27AE60',fontWeight:600}}>Active</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* REGIONS */}
      {view === 'regions' && (
        <div>
          <div style={card}>
            <div style={{fontSize:13,fontWeight:700,color:'#2C1810',marginBottom:10}}>Create New Region</div>
            <select value={newRegion.orgId} onChange={e => setNewRegion(r=>({...r,orgId:e.target.value}))} style={input}>
              <option value="">Select Org first</option>
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
                  <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#E3F2FD',color:'#2980B9',fontWeight:600}}>{org?.name}</span>
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
                    <div style={{fontSize:11,color:'#8B7355'}}>{org?.name} › {region?.name}</div>
                  </div>
                  <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#E8F5E9',color:'#27AE60',fontWeight:600}}>Active</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ASSIGN USER */}
      {view === 'users' && (
        <div>
          <div style={card}>
            <div style={{fontSize:13,fontWeight:700,color:'#2C1810',marginBottom:4}}>Assign User to Store</div>
            <div style={{fontSize:11,color:'#8B7355',marginBottom:12}}>
              First create the user in Firebase Console → Authentication → Add User. Then assign them here.
            </div>

            <input placeholder="Name" value={newUser.name}
              onChange={e => setNewUser(u=>({...u,name:e.target.value}))} style={input} />
            <input placeholder="Email address" value={newUser.email}
              onChange={e => setNewUser(u=>({...u,email:e.target.value}))} style={input} />

            <select value={newUser.role} onChange={e => setNewUser(u=>({...u,role:e.target.value,storeId:'',regionId:'',orgId:''}))} style={input}>
              <option value="store_owner">Store Owner</option>
              <option value="manager">Manager</option>
              <option value="regional_owner">Regional Owner</option>
              <option value="org_owner">Org Owner</option>
            </select>

            {/* Store Owner / Manager — pick store */}
            {(newUser.role==='store_owner' || newUser.role==='manager') && (
              <select value={newUser.storeId} onChange={e => setNewUser(u=>({...u,storeId:e.target.value}))} style={input}>
                <option value="">Select Store</option>
                {stores.map(s => {
                  const region = regions.find(r => r.id===s.regionId)
                  const org    = orgs.find(o => o.id===s.orgId)
                  return <option key={s.id} value={s.id}>{org?.name} › {region?.name} › {s.name}</option>
                })}
              </select>
            )}

            {/* Regional Owner — pick region */}
            {newUser.role==='regional_owner' && (
              <select value={newUser.regionId} onChange={e => setNewUser(u=>({...u,regionId:e.target.value}))} style={input}>
                <option value="">Select Region</option>
                {regions.map(r => {
                  const org = orgs.find(o => o.id===r.orgId)
                  return <option key={r.id} value={r.id}>{org?.name} — {r.name}</option>
                })}
              </select>
            )}

            {/* Org Owner — pick org */}
            {newUser.role==='org_owner' && (
              <select value={newUser.orgId} onChange={e => setNewUser(u=>({...u,orgId:e.target.value}))} style={input}>
                <option value="">Select Org</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}

            <button style={{...btn, background: userSaved ? '#27AE60' : '#2C1810'}} onClick={assignUser}>
              {userSaved ? 'Saved!' : 'Assign User'}
            </button>

            {/* Quick steps */}
            <div style={{marginTop:14,padding:12,background:'#FDF6EC',borderRadius:8}}>
              <div style={{fontSize:12,fontWeight:700,color:'#2C1810',marginBottom:6}}>How to onboard a new user:</div>
              <div style={{fontSize:11,color:'#8B7355',lineHeight:1.8}}>
                1. Firebase Console → Authentication → Add User<br/>
                2. Enter their email + temporary password<br/>
                3. Fill in the form above and click Assign User<br/>
                4. Share the app URL + credentials with them<br/>
                5. They login and change their password
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PENDING */}
      {view === 'pending' && (
        <div>
          {pending.length === 0 ? (
            <div style={{textAlign:'center',padding:32,color:'#8B7355'}}>
              <div style={{fontSize:32,marginBottom:8}}>OK</div>
              <div>No pending signups</div>
            </div>
          ) : pending.map(req => (
            <div key={req.id} style={card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'#2C1810'}}>{req.email}</div>
                  <div style={{fontSize:11,color:'#8B7355'}}>
                    {req.store||'No store'} · {new Date(req.createdAt||Date.now()).toLocaleDateString()}
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={() => approveSignup(req)}
                    style={{background:'#27AE60',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    Approve
                  </button>
                  <button onClick={() => rejectSignup(req)}
                    style={{background:'#E74C3C',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
