import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot,
         addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase/config'

const LINK_CATS    = ['SOP', 'Form', 'Policy', 'Contact', 'Training', 'Other']
const CONTACT_CATS = ['Food Supplier', 'Equipment', 'Maintenance', 'Utilities', 'Staffing', 'Other']

const emptyAnn     = () => ({ title: '', body: '', pinned: false })
const emptyLink    = () => ({ name: '', url: '', category: 'SOP' })
const emptyIssue   = () => ({ title: '', description: '', status: 'open' })
const emptyContact = () => ({ name: '', category: 'Food Supplier', phone: '', email: '', notes: '' })

function SectionHeader({ icon, title, count, onAdd, editMode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--dark)' }}>{title}</span>
      {count > 0 && (
        <span style={{ fontSize: 12, background: '#EFEBE0', color: '#6B7F78', borderRadius: 10, padding: '2px 8px', fontWeight: 600 }}>{count}</span>
      )}
      {editMode && (
        <button onClick={onAdd} style={{
          marginLeft: 'auto', background: 'var(--dark)', color: '#fff',
          border: 'none', borderRadius: 16, padding: '5px 12px',
          cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
        }}>+ Add</button>
      )}
    </div>
  )
}

function InlineForm({ fields, onSave, onCancel, saving }) {
  return (
    <div style={{ background: '#FAFAF8', border: '1px dashed var(--border)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
      {fields}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={onSave} disabled={saving} style={{
          background: 'var(--dark)', color: '#fff', border: 'none',
          borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
        }}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={onCancel} style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 8,
          padding: '9px 14px', cursor: 'pointer', fontSize: 13,
          fontFamily: 'inherit', color: 'var(--text-muted)',
        }}>Cancel</button>
      </div>
    </div>
  )
}

export default function Bulletin({ auth, showToast, viewingOrg }) {
  const orgId = viewingOrg || auth.userConfig?.orgId || 'dumont'
  const [announcements, setAnnouncements] = useState([])
  const [links,         setLinks]         = useState([])
  const [issues,        setIssues]        = useState([])
  const [contacts,      setContacts]      = useState([])
  const [loading,       setLoading]       = useState(true)

  const isSuperOwner = auth.isSuperOwner?.()
  const [editMode, setEditMode] = useState(false)
  const [saving,   setSaving]   = useState(false)

  const [addingAnn,     setAddingAnn]     = useState(false)
  const [addingLink,    setAddingLink]    = useState(false)
  const [addingIssue,   setAddingIssue]   = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [editingItem,   setEditingItem]   = useState(null)

  const [annForm,     setAnnForm]     = useState(emptyAnn())
  const [linkForm,    setLinkForm]    = useState(emptyLink())
  const [issueForm,   setIssueForm]   = useState(emptyIssue())
  const [contactForm, setContactForm] = useState(emptyContact())

  useEffect(() => {
    let n = 0
    const done = () => { if (++n >= 4) setLoading(false) }
    const q1 = query(collection(db, 'announcements'),    where('orgId', '==', orgId), orderBy('createdAt', 'desc'))
    const q2 = query(collection(db, 'bulletinLinks'),    where('orgId', '==', orgId), orderBy('createdAt', 'desc'))
    const q3 = query(collection(db, 'bulletinIssues'),   where('orgId', '==', orgId), orderBy('createdAt', 'desc'))
    const q4 = query(collection(db, 'bulletinContacts'), where('orgId', '==', orgId), orderBy('category',  'asc'))
    const u1 = onSnapshot(q1, s => { setAnnouncements(s.docs.map(d => ({ id: d.id, ...d.data() }))); done() }, done)
    const u2 = onSnapshot(q2, s => { setLinks(s.docs.map(d => ({ id: d.id, ...d.data() }))); done() }, done)
    const u3 = onSnapshot(q3, s => { setIssues(s.docs.map(d => ({ id: d.id, ...d.data() }))); done() }, done)
    const u4 = onSnapshot(q4, s => { setContacts(s.docs.map(d => ({ id: d.id, ...d.data() }))); done() }, done)
    return () => { u1(); u2(); u3(); u4() }
  }, [orgId])

  // ── Announcements ──────────────────────────────────────────────────────────
  const sortedAnn = [...announcements].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return (b.createdAt || 0) - (a.createdAt || 0)
  })

  async function saveAnn() {
    if (!annForm.title.trim()) { showToast('Title is required'); return }
    setSaving(true)
    try {
      if (editingItem?.type === 'ann') {
        await updateDoc(doc(db, 'announcements', editingItem.id), { ...annForm, updatedAt: Date.now() })
        setEditingItem(null)
      } else {
        await addDoc(collection(db, 'announcements'), {
          ...annForm, orgId, createdBy: auth.user.email, createdAt: Date.now(),
        })
        setAddingAnn(false)
      }
      setAnnForm(emptyAnn())
      showToast(editingItem ? 'Announcement updated' : 'Announcement posted')
    } catch (e) { showToast('Error: ' + e.message) }
    setSaving(false)
  }

  async function deleteAnn(id) {
    if (!window.confirm('Delete this announcement?')) return
    await deleteDoc(doc(db, 'announcements', id))
    showToast('Deleted')
  }

  // ── Links ──────────────────────────────────────────────────────────────────
  async function saveLink() {
    if (!linkForm.name.trim() || !linkForm.url.trim()) { showToast('Name and URL required'); return }
    let url = linkForm.url.trim()
    if (!url.startsWith('http')) url = 'https://' + url
    setSaving(true)
    try {
      if (editingItem?.type === 'link') {
        await updateDoc(doc(db, 'bulletinLinks', editingItem.id), { ...linkForm, url, updatedAt: Date.now() })
        setEditingItem(null)
      } else {
        await addDoc(collection(db, 'bulletinLinks'), {
          ...linkForm, url, orgId, createdBy: auth.user.email, createdAt: Date.now(),
        })
        setAddingLink(false)
      }
      setLinkForm(emptyLink())
      showToast(editingItem ? 'Link updated' : 'Link added')
    } catch (e) { showToast('Error: ' + e.message) }
    setSaving(false)
  }

  async function deleteLink(id) {
    if (!window.confirm('Delete this link?')) return
    await deleteDoc(doc(db, 'bulletinLinks', id))
    showToast('Deleted')
  }

  // ── Issues ─────────────────────────────────────────────────────────────────
  async function saveIssue() {
    if (!issueForm.title.trim()) { showToast('Title is required'); return }
    setSaving(true)
    try {
      if (editingItem?.type === 'issue') {
        await updateDoc(doc(db, 'bulletinIssues', editingItem.id), { ...issueForm, updatedAt: Date.now() })
        setEditingItem(null)
      } else {
        await addDoc(collection(db, 'bulletinIssues'), {
          ...issueForm, orgId, createdBy: auth.user.email, createdAt: Date.now(),
        })
        setAddingIssue(false)
      }
      setIssueForm(emptyIssue())
      showToast(editingItem ? 'Issue updated' : 'Issue added')
    } catch (e) { showToast('Error: ' + e.message) }
    setSaving(false)
  }

  async function toggleStatus(issue) {
    const newStatus = issue.status === 'open' ? 'resolved' : 'open'
    await updateDoc(doc(db, 'bulletinIssues', issue.id), { status: newStatus, updatedAt: Date.now() })
  }

  async function deleteIssue(id) {
    if (!window.confirm('Delete this issue?')) return
    await deleteDoc(doc(db, 'bulletinIssues', id))
    showToast('Deleted')
  }

  // ── Contacts ───────────────────────────────────────────────────────────────
  async function saveContact() {
    if (!contactForm.name.trim()) { showToast('Name is required'); return }
    setSaving(true)
    try {
      if (editingItem?.type === 'contact') {
        await updateDoc(doc(db, 'bulletinContacts', editingItem.id), { ...contactForm, updatedAt: Date.now() })
        setEditingItem(null)
      } else {
        await addDoc(collection(db, 'bulletinContacts'), {
          ...contactForm, orgId, createdBy: auth.user.email, createdAt: Date.now(),
        })
        setAddingContact(false)
      }
      setContactForm(emptyContact())
      showToast(editingItem ? 'Contact updated' : 'Contact added')
    } catch (e) { showToast('Error: ' + e.message) }
    setSaving(false)
  }

  async function deleteContact(id) {
    if (!window.confirm('Delete this contact?')) return
    await deleteDoc(doc(db, 'bulletinContacts', id))
    showToast('Deleted')
  }

  // ── Shared style helpers ───────────────────────────────────────────────────
  const inp = {
    width: '100%', padding: '9px 11px', border: '1px solid var(--border)',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff',
  }
  const label = (txt) => <div style={{ fontSize: 12, color: '#6B7F78', marginBottom: 4, fontWeight: 600 }}>{txt}</div>
  const editBtn = (onClick) => (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6B7F78', padding: '2px 6px', fontFamily: 'inherit' }}>Edit</button>
  )
  const delBtn = (onClick) => (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#E53E3E', padding: '2px 6px', fontFamily: 'inherit' }}>Delete</button>
  )

  if (loading) return <div style={{ padding: 24, color: '#6B7F78', fontSize: 13 }}>Loading…</div>

  const openIssues     = issues.filter(i => i.status === 'open')
  const resolvedIssues = issues.filter(i => i.status === 'resolved')

  return (
    <div style={{ maxWidth: 720 }}>

      {/* Edit mode toggle — super owner only */}
      {isSuperOwner && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => { setEditMode(v => !v); setAddingAnn(false); setAddingLink(false); setAddingIssue(false); setAddingContact(false); setEditingItem(null) }}
            style={{
              padding: '7px 16px', borderRadius: 20, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              background: editMode ? 'var(--dark)' : '#fff',
              color:      editMode ? '#fff'        : 'var(--text-muted)',
              border:     editMode ? 'none'        : '1px solid var(--border)',
            }}>
            {editMode ? '✓ Done Editing' : '✏️ Edit Bulletin'}
          </button>
        </div>
      )}

      {/* ── Section 1: Announcements ─────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <SectionHeader icon="📣" title="Announcements" count={announcements.length}
          onAdd={() => { setAddingAnn(true); setAnnForm(emptyAnn()); setEditingItem(null) }}
          editMode={editMode} />

        {addingAnn && (
          <InlineForm saving={saving} onSave={saveAnn} onCancel={() => { setAddingAnn(false); setAnnForm(emptyAnn()) }} fields={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                {label('Title')}
                <input style={inp} placeholder="Announcement title" value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                {label('Message')}
                <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} placeholder="Full message…" value={annForm.body} onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={annForm.pinned} onChange={e => setAnnForm(f => ({ ...f, pinned: e.target.checked }))} />
                Pin to top
              </label>
            </div>
          } />
        )}

        {sortedAnn.length === 0 && !addingAnn && (
          <div style={{ color: '#6B7F78', fontSize: 13, padding: '8px 0' }}>No announcements yet.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedAnn.map(ann => (
            <div key={ann.id}>
              {editingItem?.type === 'ann' && editingItem.id === ann.id ? (
                <InlineForm saving={saving} onSave={saveAnn} onCancel={() => { setEditingItem(null); setAnnForm(emptyAnn()) }} fields={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      {label('Title')}
                      <input style={inp} value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div>
                      {label('Message')}
                      <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={annForm.body} onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={annForm.pinned} onChange={e => setAnnForm(f => ({ ...f, pinned: e.target.checked }))} />
                      Pin to top
                    </label>
                  </div>
                } />
              ) : (
                <div style={{ padding: '12px 14px', background: ann.pinned ? '#FFFBF0' : '#FAFAF8', borderRadius: 10, border: ann.pinned ? '1px solid #F5D78A' : '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {ann.pinned && <span style={{ fontSize: 12 }}>📌</span>}
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)' }}>{ann.title}</span>
                      </div>
                      {ann.body && <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{ann.body}</div>}
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                        {ann.createdAt ? new Date(ann.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                        {ann.createdBy && ` · ${ann.createdBy}`}
                      </div>
                    </div>
                    {editMode && (
                      <div style={{ display: 'flex', flexShrink: 0 }}>
                        {editBtn(() => { setEditingItem({ type: 'ann', id: ann.id }); setAnnForm({ title: ann.title, body: ann.body || '', pinned: ann.pinned || false }) })}
                        {delBtn(() => deleteAnn(ann.id))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Documents & Links ────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <SectionHeader icon="🔗" title="Documents & Links" count={links.length}
          onAdd={() => { setAddingLink(true); setLinkForm(emptyLink()); setEditingItem(null) }}
          editMode={editMode} />

        {addingLink && (
          <InlineForm saving={saving} onSave={saveLink} onCancel={() => { setAddingLink(false); setLinkForm(emptyLink()) }} fields={
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                {label('Document / Link Name')}
                <input style={inp} placeholder="e.g. Opening Checklist SOP" value={linkForm.name} onChange={e => setLinkForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {label('URL')}
                <input style={inp} placeholder="https://docs.google.com/…" value={linkForm.url} onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))} />
              </div>
              <div>
                {label('Category')}
                <select style={inp} value={linkForm.category} onChange={e => setLinkForm(f => ({ ...f, category: e.target.value }))}>
                  {LINK_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          } />
        )}

        {links.length === 0 && !addingLink && (
          <div style={{ color: '#6B7F78', fontSize: 13, padding: '8px 0' }}>No links added yet.</div>
        )}

        {links.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px 6px 0', color: '#6B7F78', fontWeight: 600, whiteSpace: 'nowrap' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6B7F78', fontWeight: 600 }}>Category</th>
                  <th style={{ textAlign: 'left', padding: '6px 0', color: '#6B7F78', fontWeight: 600 }}>Link</th>
                  {editMode && <th />}
                </tr>
              </thead>
              <tbody>
                {links.map(lnk => (
                  <tr key={lnk.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    {editingItem?.type === 'link' && editingItem.id === lnk.id ? (
                      <td colSpan={editMode ? 4 : 3} style={{ padding: '8px 0' }}>
                        <InlineForm saving={saving} onSave={saveLink} onCancel={() => { setEditingItem(null); setLinkForm(emptyLink()) }} fields={
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                              {label('Name')}
                              <input style={inp} value={linkForm.name} onChange={e => setLinkForm(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              {label('URL')}
                              <input style={inp} value={linkForm.url} onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))} />
                            </div>
                            <div>
                              {label('Category')}
                              <select style={inp} value={linkForm.category} onChange={e => setLinkForm(f => ({ ...f, category: e.target.value }))}>
                                {LINK_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>
                        } />
                      </td>
                    ) : (
                      <>
                        <td style={{ padding: '10px 8px 10px 0', fontWeight: 600, color: 'var(--dark)' }}>{lnk.name}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#EFEBE0', color: '#6B7F78' }}>{lnk.category}</span>
                        </td>
                        <td style={{ padding: '10px 0' }}>
                          <a href={lnk.url} target="_blank" rel="noopener noreferrer"
                            style={{ color: '#C1683C', fontWeight: 600, textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                            Open ↗
                          </a>
                        </td>
                        {editMode && (
                          <td style={{ padding: '10px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {editBtn(() => { setEditingItem({ type: 'link', id: lnk.id }); setLinkForm({ name: lnk.name, url: lnk.url, category: lnk.category || 'SOP' }) })}
                            {delBtn(() => deleteLink(lnk.id))}
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 3: Issues & Notices ──────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <SectionHeader icon="⚠️" title="Issues & Notices"
          count={openIssues.length > 0 ? openIssues.length : undefined}
          onAdd={() => { setAddingIssue(true); setIssueForm(emptyIssue()); setEditingItem(null) }}
          editMode={editMode} />

        {addingIssue && (
          <InlineForm saving={saving} onSave={saveIssue} onCancel={() => { setAddingIssue(false); setIssueForm(emptyIssue()) }} fields={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                {label('Title')}
                <input style={inp} placeholder="e.g. POS system update required" value={issueForm.title} onChange={e => setIssueForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                {label('Description')}
                <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} placeholder="Details, steps needed, etc." value={issueForm.description} onChange={e => setIssueForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                {label('Status')}
                <select style={{ ...inp, width: 'auto' }} value={issueForm.status} onChange={e => setIssueForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>
          } />
        )}

        {issues.length === 0 && !addingIssue && (
          <div style={{ color: '#6B7F78', fontSize: 13, padding: '8px 0' }}>No issues logged.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...openIssues, ...resolvedIssues].map(issue => (
            <div key={issue.id}>
              {editingItem?.type === 'issue' && editingItem.id === issue.id ? (
                <InlineForm saving={saving} onSave={saveIssue} onCancel={() => { setEditingItem(null); setIssueForm(emptyIssue()) }} fields={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      {label('Title')}
                      <input style={inp} value={issueForm.title} onChange={e => setIssueForm(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div>
                      {label('Description')}
                      <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={issueForm.description} onChange={e => setIssueForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div>
                      {label('Status')}
                      <select style={{ ...inp, width: 'auto' }} value={issueForm.status} onChange={e => setIssueForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="open">Open</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                  </div>
                } />
              ) : (
                <div style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: issue.status === 'open' ? '#FFF5F5' : '#F0FFF4',
                  border: `1px solid ${issue.status === 'open' ? '#FEB2B2' : '#9AE6B4'}`,
                  opacity: issue.status === 'resolved' ? 0.75 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: issue.description ? 4 : 0 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                          background: issue.status === 'open' ? '#FC8181' : '#68D391',
                          color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>{issue.status}</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)' }}>{issue.title}</span>
                      </div>
                      {issue.description && (
                        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5, marginTop: 4 }}>{issue.description}</div>
                      )}
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                        {issue.createdAt ? new Date(issue.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {isSuperOwner && (
                        <button onClick={() => toggleStatus(issue)} style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                          fontFamily: 'inherit', fontWeight: 600,
                          background: issue.status === 'open' ? '#C6F6D5' : '#FED7D7',
                          color:      issue.status === 'open' ? '#276749' : '#C53030',
                          border: 'none',
                        }}>
                          {issue.status === 'open' ? '✓ Resolve' : '↩ Reopen'}
                        </button>
                      )}
                      {editMode && (
                        <>
                          {editBtn(() => { setEditingItem({ type: 'issue', id: issue.id }); setIssueForm({ title: issue.title, description: issue.description || '', status: issue.status }) })}
                          {delBtn(() => deleteIssue(issue.id))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 4: Vendor Contacts ───────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <SectionHeader icon="📞" title="Vendor Contacts" count={contacts.length}
          onAdd={() => { setAddingContact(true); setContactForm(emptyContact()); setEditingItem(null) }}
          editMode={editMode} />

        {addingContact && (
          <InlineForm saving={saving} onSave={saveContact} onCancel={() => { setAddingContact(false); setContactForm(emptyContact()) }} fields={
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                {label('Name')}
                <input style={inp} placeholder="e.g. Ben E. Keith" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                {label('Category')}
                <select style={inp} value={contactForm.category} onChange={e => setContactForm(f => ({ ...f, category: e.target.value }))}>
                  {CONTACT_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                {label('Phone')}
                <input style={inp} placeholder="(555) 123-4567" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                {label('Email')}
                <input style={inp} placeholder="rep@vendor.com" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {label('Notes')}
                <input style={inp} placeholder="Account #, delivery days, rep name…" value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          } />
        )}

        {contacts.length === 0 && !addingContact && (
          <div style={{ color: '#6B7F78', fontSize: 13, padding: '8px 0' }}>No contacts added yet.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contacts.map(c => (
            <div key={c.id}>
              {editingItem?.type === 'contact' && editingItem.id === c.id ? (
                <InlineForm saving={saving} onSave={saveContact} onCancel={() => { setEditingItem(null); setContactForm(emptyContact()) }} fields={
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      {label('Name')}
                      <input style={inp} value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      {label('Category')}
                      <select style={inp} value={contactForm.category} onChange={e => setContactForm(f => ({ ...f, category: e.target.value }))}>
                        {CONTACT_CATS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div>
                      {label('Phone')}
                      <input style={inp} value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div>
                      {label('Email')}
                      <input style={inp} value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      {label('Notes')}
                      <input style={inp} value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                } />
              ) : (
                <div style={{ padding: '12px 14px', background: '#FAFAF8', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)' }}>{c.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#EFEBE0', color: '#6B7F78' }}>{c.category}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {c.phone && (
                          <a href={`tel:${c.phone.replace(/\D/g,'')}`}
                            style={{ fontSize: 13, color: '#C1683C', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            📱 {c.phone}
                          </a>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`}
                            style={{ fontSize: 13, color: '#C1683C', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            ✉️ {c.email}
                          </a>
                        )}
                      </div>
                      {c.notes && (
                        <div style={{ fontSize: 12, color: '#6B7F78', marginTop: 4 }}>{c.notes}</div>
                      )}
                    </div>
                    {editMode && (
                      <div style={{ display: 'flex', flexShrink: 0 }}>
                        {editBtn(() => { setEditingItem({ type: 'contact', id: c.id }); setContactForm({ name: c.name, category: c.category || 'Food Supplier', phone: c.phone || '', email: c.email || '', notes: c.notes || '' }) })}
                        {delBtn(() => deleteContact(c.id))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
