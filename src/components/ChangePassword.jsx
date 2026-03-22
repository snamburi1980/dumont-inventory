import { useState } from 'react'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { auth } from '../firebase/config'

export default function ChangePassword({ showToast, onClose }) {
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd,     setNewPwd]     = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  async function handleChange() {
    setError('')
    if (!currentPwd || !newPwd || !confirmPwd) { setError('Fill all fields'); return }
    if (newPwd.length < 6) { setError('Password must be at least 6 characters'); return }
    if (newPwd !== confirmPwd) { setError('Passwords do not match'); return }

    setSaving(true)
    try {
      // Re-authenticate first
      const user       = auth.currentUser
      const credential = EmailAuthProvider.credential(user.email, currentPwd)
      await reauthenticateWithCredential(user, credential)
      // Update password
      await updatePassword(user, newPwd)
      showToast('Password changed successfully')
      if (onClose) onClose()
    } catch(e) {
      if (e.code === 'auth/wrong-password') setError('Current password is incorrect')
      else setError('Error changing password. Try again.')
    }
    setSaving(false)
  }

  const input = {
    width:'100%', padding:'9px 10px', border:'1px solid #EDE0CC',
    borderRadius:8, fontFamily:'inherit', fontSize:13,
    marginBottom:8, boxSizing:'border-box', background:'#FDF6EC'
  }

  return (
    <div style={{ background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:16 }}>
      <div style={{ fontSize:14, fontWeight:700, color:'#2C1810', marginBottom:14 }}>Change Password</div>

      {error && (
        <div style={{ background:'#FFEBEE', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#E74C3C', marginBottom:10 }}>
          {error}
        </div>
      )}

      <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>Current Password</div>
      <input type="password" placeholder="Enter current password" value={currentPwd}
        onChange={e => setCurrentPwd(e.target.value)} style={input} />

      <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>New Password</div>
      <input type="password" placeholder="Min 6 characters" value={newPwd}
        onChange={e => setNewPwd(e.target.value)} style={input} />

      <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>Confirm New Password</div>
      <input type="password" placeholder="Repeat new password" value={confirmPwd}
        onChange={e => setConfirmPwd(e.target.value)} style={{ ...input, marginBottom:14 }} />

      <div style={{ display:'flex', gap:8 }}>
        <button
          onClick={handleChange}
          disabled={saving}
          style={{ flex:1, background: saving ? '#aaa' : '#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'11px', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit' }}
        >
          {saving ? 'Changing...' : 'Change Password'}
        </button>
        {onClose && (
          <button onClick={onClose} style={{ padding:'11px 16px', background:'#888', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
