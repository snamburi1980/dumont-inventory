import { useState, useEffect } from 'react'
import { collection, addDoc, getDocs, deleteDoc, doc, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { logAudit, AUDIT_ACTIONS } from '../utils/auditLogger'

const SOP_TEMPLATE = `Name,Clover Item Name,Category,Ingredients,Qty Per Serving,Unit,Notes
Kids Scoop,{Flavor} kids,Ice Cream,{Flavor} Ice Cream,1,scoop,60 scoops per tub
Regular Scoop,{Flavor} regular,Ice Cream,{Flavor} Ice Cream,2,scoop,
Milkshake,{Flavor} Milkshake,Ice Cream,{Flavor} Ice Cream,4,scoop,Add milk 200ml
Taro Milk Tea,Taro Milk Tea,Milk Tea,Taro Powder,25,g,Add NDC 30ml + Milk 200ml + Fructose 20ml
`

export default function SOPManager({ viewingOrg, viewingStore, auth, showToast }) {
  const [sops,      setSOPs]      = useState([])
  const [loading,   setLoading]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [view,      setView]      = useState('list') // list | manual
  const [manualCOGS, setManualCOGS] = useState({ category:'', cost:0, sell:0, note:'' })

  useEffect(() => { loadSOPs() }, [viewingOrg])

  async function loadSOPs() {
    setLoading(true)
    try {
      const q    = query(collection(db, 'orgs', viewingOrg, 'sops'), orderBy('uploadedAt', 'desc'))
      const snap = await getDocs(q)
      setSOPs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch(e) {
      console.warn('SOP load error:', e)
    }
    setLoading(false)
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const content   = ev.target.result
        const fileType  = file.name.endsWith('.pdf') ? 'pdf' : 'csv'
        const entry = {
          fileName:   file.name,
          fileType,
          fileData:   fileType === 'csv' ? content : btoa(content), // base64 for PDF
          size:       file.size,
          uploadedAt: Date.now(),
          uploadedBy: auth.userConfig?.email || 'unknown',
          orgId:      viewingOrg,
          parsed:     fileType === 'csv' ? parseSOPCSV(content) : null,
        }
        await addDoc(collection(db, 'orgs', viewingOrg, 'sops'), entry)
        await logAudit({
          action: AUDIT_ACTIONS.SOP_UPLOADED,
          orgId:  viewingOrg,
          userEmail: auth.userConfig?.email,
          details: { fileName: file.name, fileType }
        })
        showToast(`SOP uploaded: ${file.name}`)
        loadSOPs()
        setUploading(false)
      }
      if (file.name.endsWith('.pdf')) reader.readAsBinaryString(file)
      else reader.readAsText(file)
    } catch(err) {
      showToast('Error uploading SOP')
      setUploading(false)
    }
    e.target.value = ''
  }

  function parseSOPCSV(content) {
    const lines   = content.split('\n').map(l => l.trim()).filter(Boolean)
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const rows    = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g,''))
      if (!cols[0]) continue
      const row = {}
      headers.forEach((h, idx) => { row[h] = cols[idx] || '' })
      rows.push(row)
    }
    return { headers, rows, count: rows.length }
  }

  async function deleteSOP(sop) {
    if (!window.confirm(`Delete SOP: ${sop.fileName}?`)) return
    await deleteDoc(doc(db, 'orgs', viewingOrg, 'sops', sop.id))
    await logAudit({
      action:    AUDIT_ACTIONS.SOP_DELETED,
      orgId:     viewingOrg,
      userEmail: auth.userConfig?.email,
      details:   { fileName: sop.fileName }
    })
    showToast('SOP deleted')
    loadSOPs()
  }

  function downloadTemplate() {
    const blob = new Blob([SOP_TEMPLATE], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'sop_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const card  = { background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:'14px 16px', marginBottom:10 }
  const input = { width:'100%', padding:'9px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, marginBottom:8, boxSizing:'border-box', background:'#FDF6EC' }

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <button
          className={`cat-btn ${view==='list'?'active':''}`}
          onClick={() => setView('list')}
        >SOP Files</button>
        <button
          className={`cat-btn ${view==='manual'?'active':''}`}
          onClick={() => setView('manual')}
        >Manual COGS Entry</button>
      </div>

      {view === 'list' && (
        <div>
          {/* Info box */}
          <div style={{ ...card, background:'#FFF3E0', border:'1px solid #FFE0B2' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#C8843A', marginBottom:6 }}>About SOPs</div>
            <div style={{ fontSize:12, color:'#8B7355', lineHeight:1.6 }}>
              SOPs define how inventory is deducted from Clover sales.
              Upload a CSV with your recipes, or use Manual COGS Entry
              for items where you want to directly specify cost percentages.
            </div>
          </div>

          {/* Upload zone */}
          <div style={card}>
            <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:10 }}>Upload SOP</div>
            <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
              <button
                onClick={downloadTemplate}
                style={{ fontSize:12, color:'#C8843A', background:'#FDF6EC', border:'1px solid #C8843A', borderRadius:6, padding:'6px 12px', cursor:'pointer' }}
              >
                Download CSV Template
              </button>
            </div>
            <label style={{ display:'block', border:'2px dashed #EDE0CC', borderRadius:10, padding:'20px', textAlign:'center', cursor:'pointer' }}>
              <div style={{ fontSize:13, color:'#8B7355' }}>
                {uploading ? 'Uploading...' : 'Upload SOP (CSV or PDF)'}
              </div>
              <div style={{ fontSize:11, color:'#aaa', marginTop:4 }}>Supported: .csv, .pdf</div>
              <input type="file" accept=".csv,.pdf" onChange={handleFileUpload} style={{ display:'none' }} disabled={uploading} />
            </label>
          </div>

          {/* SOP list */}
          {loading && <div style={{textAlign:'center',padding:16,color:'#8B7355'}}>Loading...</div>}
          {!loading && sops.length === 0 && (
            <div style={{textAlign:'center',padding:24,color:'#8B7355',fontSize:13}}>
              No SOPs uploaded yet
            </div>
          )}
          {sops.map(sop => (
            <div key={sop.id} style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#2C1810' }}>{sop.fileName}</div>
                  <div style={{ fontSize:11, color:'#8B7355', marginTop:2 }}>
                    {sop.fileType?.toUpperCase()}
                    {sop.parsed ? ` · ${sop.parsed.count} recipes` : ''}
                    {' · '}{new Date(sop.uploadedAt).toLocaleDateString()}
                    {' · '}{sop.uploadedBy}
                  </div>
                  {sop.parsed?.rows && (
                    <div style={{ marginTop:6, fontSize:11, color:'#8B7355' }}>
                      {sop.parsed.rows.slice(0,3).map((r,i) => (
                        <div key={i}>{r.name || r['clover item name'] || 'Item '+(i+1)}</div>
                      ))}
                      {sop.parsed.rows.length > 3 && <div>+{sop.parsed.rows.length-3} more...</div>}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {sop.fileType === 'csv' && sop.fileData && (
                    <button
                      onClick={() => {
                        const blob = new Blob([sop.fileData], {type:'text/csv'})
                        const url  = URL.createObjectURL(blob)
                        const a    = document.createElement('a')
                        a.href = url; a.download = sop.fileName; a.click()
                        URL.revokeObjectURL(url)
                      }}
                      style={{ fontSize:11, padding:'5px 10px', background:'#E3F2FD', border:'1px solid #90CAF9', borderRadius:6, cursor:'pointer', color:'#2980B9' }}
                    >
                      Download
                    </button>
                  )}
                  <button
                    onClick={() => deleteSOP(sop)}
                    style={{ fontSize:11, padding:'5px 10px', background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:6, cursor:'pointer', color:'#E74C3C' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'manual' && (
        <div>
          <div style={{ ...card, background:'#FFF3E0', border:'1px solid #FFE0B2', marginBottom:12 }}>
            <div style={{ fontSize:12, color:'#8B7355', lineHeight:1.6 }}>
              Use Manual COGS Entry when you don't have a CSV SOP or want to override
              a category's cost %. Enter cost and sell price to calculate COGS.
              This will be used in the COGS report for this org.
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize:13, fontWeight:700, color:'#2C1810', marginBottom:10 }}>Add Manual COGS Entry</div>
            <input
              placeholder="Category (e.g. Ice Cream, Milk Tea)"
              value={manualCOGS.category}
              onChange={e => setManualCOGS(m=>({...m,category:e.target.value}))}
              style={input}
            />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div>
                <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>Avg Cost Price ($)</div>
                <input type="number" value={manualCOGS.cost}
                  onChange={e => setManualCOGS(m=>({...m,cost:parseFloat(e.target.value)||0}))}
                  style={input} step="0.01" min="0" />
              </div>
              <div>
                <div style={{ fontSize:11, color:'#8B7355', marginBottom:4 }}>Avg Sell Price ($)</div>
                <input type="number" value={manualCOGS.sell}
                  onChange={e => setManualCOGS(m=>({...m,sell:parseFloat(e.target.value)||0}))}
                  style={input} step="0.01" min="0" />
              </div>
            </div>
            <input
              placeholder="Note (optional)"
              value={manualCOGS.note}
              onChange={e => setManualCOGS(m=>({...m,note:e.target.value}))}
              style={input}
            />
            {manualCOGS.cost > 0 && manualCOGS.sell > 0 && (
              <div style={{ display:'flex', gap:12, padding:'10px 12px', background:'#F0F9F0', borderRadius:8, marginBottom:10, fontSize:12 }}>
                <span style={{color:'#E74C3C'}}>COGS: {(manualCOGS.cost/manualCOGS.sell*100).toFixed(1)}%</span>
                <span style={{color:'#27AE60'}}>Margin: {((manualCOGS.sell-manualCOGS.cost)/manualCOGS.sell*100).toFixed(1)}%</span>
                <span style={{color:'#C8843A'}}>Profit: ${(manualCOGS.sell-manualCOGS.cost).toFixed(2)}</span>
              </div>
            )}
            <button
              onClick={async () => {
                if (!manualCOGS.category) { showToast('Enter category'); return }
                await addDoc(collection(db, 'orgs', viewingOrg, 'manualCOGS'), {
                  ...manualCOGS,
                  cogsPercent: manualCOGS.sell > 0 ? (manualCOGS.cost/manualCOGS.sell*100) : 0,
                  createdAt:  Date.now(),
                  createdBy:  auth.userConfig?.email
                })
                showToast('COGS entry saved')
                setManualCOGS({ category:'', cost:0, sell:0, note:'' })
              }}
              style={{ width:'100%', background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'11px', cursor:'pointer', fontSize:13, fontWeight:600 }}
            >
              Save COGS Entry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
