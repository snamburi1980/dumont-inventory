import { useState } from 'react'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

export default function OrgSettings({ orgId, orgData, showToast, onUpdate }) {
  const [logo,     setLogo]     = useState(orgData?.logoData || null)
  const [name,     setName]     = useState(orgData?.name || '')
  const [color,    setColor]    = useState(orgData?.brandColor || '#2C1810')
  const [saving,   setSaving]   = useState(false)

  async function handleLogoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 500000) { showToast('Logo must be under 500KB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setLogo(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const updates = {
        name,
        brandColor: color,
        logoData:   logo,
        updatedAt:  Date.now(),
      }
      await setDoc(doc(db, 'orgs', orgId), updates, { merge: true })
      showToast('Settings saved')
      if (onUpdate) onUpdate(updates)
    } catch(e) {
      showToast('Error saving: ' + e.message)
    }
    setSaving(false)
  }

  const input = {
    width:'100%', padding:'9px 10px', border:'1px solid #EDE0CC',
    borderRadius:8, fontFamily:'inherit', fontSize:13,
    marginBottom:10, boxSizing:'border-box', background:'#FDF6EC'
  }

  return (
    <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:16 }}>
      <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:12 }}>Organisation Settings</div>

      {/* Logo */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:8 }}>Logo</div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {logo ? (
            <img src={logo} alt="Logo" style={{ width:64, height:64, objectFit:'contain', borderRadius:8, border:'1px solid #EDE0CC' }} />
          ) : (
            <div style={{ width:64, height:64, borderRadius:8, border:'2px dashed #EDE0CC', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, color:'#EDE0CC' }}>
              D
            </div>
          )}
          <div>
            <label style={{ cursor:'pointer' }}>
              <div style={{ fontSize:12, color:'#C8843A', fontWeight:600, padding:'6px 12px', background:'#FDF6EC', border:'1px solid #C8843A', borderRadius:6, display:'inline-block' }}>
                {logo ? 'Change Logo' : 'Upload Logo'}
              </div>
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display:'none' }} />
            </label>
            {logo && (
              <button onClick={() => setLogo(null)} style={{ fontSize:11, color:'#E74C3C', background:'none', border:'none', cursor:'pointer', marginLeft:8 }}>
                Remove
              </button>
            )}
            <div style={{ fontSize:10, color:'#aaa', marginTop:4 }}>PNG, JPG · Max 500KB</div>
          </div>
        </div>
      </div>

      {/* Name */}
      <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4 }}>Organisation Name</div>
      <input value={name} onChange={e => setName(e.target.value)} style={input} />

      {/* Brand color */}
      <div style={{ fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:8 }}>Brand Color</div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <input type="color" value={color} onChange={e => setColor(e.target.value)}
          style={{ width:48, height:36, borderRadius:6, border:'1px solid #EDE0CC', cursor:'pointer', padding:2 }} />
        <span style={{ fontSize:12, color:'#8B7355' }}>{color}</span>
      </div>

      <button
        onClick={saveSettings}
        disabled={saving}
        style={{ width:'100%', background: saving ? '#aaa' : '#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'11px', cursor:'pointer', fontSize:13, fontWeight:600 }}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
