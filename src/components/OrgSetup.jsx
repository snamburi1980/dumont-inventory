import { useState } from 'react'
import { doc, setDoc, collection, addDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { DEFAULT_INVENTORY } from '../data/inventory'

const STEPS = ['Org Details', 'Inventory Template', 'Review & Create']

export default function OrgSetup({ onComplete, showToast, existingOrgs }) {
  const [step,       setStep]       = useState(0)
  const [saving,     setSaving]     = useState(false)
  const [orgForm,    setOrgForm]    = useState({ name:'', brandColor:'#2C1810', currency:'USD' })
  const [template,   setTemplate]   = useState('dumont') // dumont | blank | upload
  const [customItems,setCustomItems]= useState([])
  const [csvError,   setCsvError]   = useState('')

  function handleCSV(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const lines = ev.target.result.split('\n')
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        const items = []
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/"/g,''))
          if (!cols[0]) continue
          const item = {}
          headers.forEach((h, idx) => { item[h] = cols[idx] || '' })
          if (item.name) items.push({
            id:         String(Date.now() + i),
            name:       item.name,
            code:       item.code || '',
            cat:        item.category || item.cat || 'General',
            vendor:     item.vendor || '',
            uom:        item.uom || 'UNIT',
            cost_price: parseFloat(item.cost_price || item.cost || 0),
            sell_price: parseFloat(item.sell_price || 0),
            par:        parseInt(item.par || 1),
            case_size:  parseInt(item.case_size || 1),
            active:     true,
          })
        }
        setCustomItems(items)
        setCsvError('')
        showToast(`${items.length} items loaded from CSV`)
      } catch(err) {
        setCsvError('Error parsing CSV. Check format.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function createOrg() {
    if (!orgForm.name.trim()) { showToast('Org name required'); return }
    setSaving(true)
    try {
      const orgId = orgForm.name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')

      // Create org
      await setDoc(doc(db, 'orgs', orgId), {
        name:        orgForm.name,
        brandColor:  orgForm.brandColor,
        currency:    orgForm.currency,
        logoData:    orgForm.logoData || null,
        active:      true,
        createdAt:   Date.now(),
      })

      // Seed inventory based on template choice
      let itemsToSeed = []
      if (template === 'dumont') {
        itemsToSeed = DEFAULT_INVENTORY.map(item => ({
          id:          String(item.id),
          name:        item.name,
          code:        item.code || '',
          cat:         item.cat || 'General',
          vendor:      item.vendor || '',
          uom:         item.uom || 'UNIT',
          cost_price:  item.cost || 0,
          sell_price:  0,
          par:         item.par || 1,
          case_size:   item.case_size || 1,
          order_qty:   item.order_qty || '1',
          active:      true,
          scoops_per_bucket: item.scoops_per_bucket || null,
          updatedAt:   Date.now(),
        }))
      } else if (template === 'upload') {
        itemsToSeed = customItems
      }
      // blank = no items seeded

      for (const item of itemsToSeed) {
        await setDoc(doc(db, 'orgs', orgId, 'items', String(item.id)), item)
      }

      showToast(`Org "${orgForm.name}" created with ${itemsToSeed.length} items`)
      onComplete && onComplete(orgId)
    } catch(e) {
      showToast('Error creating org: ' + e.message)
    }
    setSaving(false)
  }

  const card  = { background:'#fff', border:'1px solid #EDE0CC', borderRadius:12, padding:16, marginBottom:12 }
  const input = { width:'100%', padding:'9px 10px', border:'1px solid #EDE0CC', borderRadius:8, fontFamily:'inherit', fontSize:13, marginBottom:10, boxSizing:'border-box', background:'#FDF6EC' }
  const label = { fontSize:11, fontWeight:600, color:'#8B7355', marginBottom:4, display:'block' }

  return (
    <div>
      {/* Progress steps */}
      <div style={{ display:'flex', alignItems:'center', marginBottom:20 }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', flex: i < STEPS.length-1 ? 1 : 0 }}>
            <div style={{
              width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0,
              background: i <= step ? '#2C1810' : '#EDE0CC',
              color: i <= step ? '#fff' : '#8B7355',
            }}>
              {i + 1}
            </div>
            <div style={{ fontSize:11, color: i === step ? '#2C1810' : '#8B7355', marginLeft:6, fontWeight: i === step ? 700 : 400, whiteSpace:'nowrap' }}>
              {s}
            </div>
            {i < STEPS.length-1 && (
              <div style={{ flex:1, height:2, background: i < step ? '#2C1810' : '#EDE0CC', margin:'0 8px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 — Org Details */}
      {step === 0 && (
        <div style={card}>
          <div style={{ fontSize:14, fontWeight:700, color:'#2C1810', marginBottom:12 }}>Organisation Details</div>

          <label style={label}>Organisation Name *</label>
          <input
            placeholder="e.g. Dumont Creamery, PB Brand"
            value={orgForm.name}
            onChange={e => setOrgForm(f=>({...f,name:e.target.value}))}
            style={input}
          />

          <label style={label}>Brand Color</label>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <input
              type="color"
              value={orgForm.brandColor}
              onChange={e => setOrgForm(f=>({...f,brandColor:e.target.value}))}
              style={{ width:48, height:36, borderRadius:6, border:'1px solid #EDE0CC', cursor:'pointer', padding:2 }}
            />
            <span style={{ fontSize:12, color:'#8B7355' }}>{orgForm.brandColor}</span>
          </div>

          <label style={label}>Currency</label>
          <select value={orgForm.currency} onChange={e => setOrgForm(f=>({...f,currency:e.target.value}))} style={input}>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (pound)</option>
            <option value="EUR">EUR (euro)</option>
            <option value="INR">INR (rupee)</option>
            <option value="CAD">CAD ($)</option>
          </select>

          <label style={label}>Logo (optional)</label>
          <label style={{ display:'block', cursor:'pointer', marginBottom:10 }}>
            <div style={{ border:'2px dashed #EDE0CC', borderRadius:8, padding:'12px', textAlign:'center' }}>
              {orgForm.logoData ? (
                <img src={orgForm.logoData} alt="Logo" style={{ height:48, objectFit:'contain' }} />
              ) : (
                <div style={{ fontSize:12, color:'#8B7355' }}>Click to upload logo (PNG, JPG)</div>
              )}
            </div>
            <input
              type="file" accept="image/*" style={{ display:'none' }}
              onChange={e => {
                const file = e.target.files[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => setOrgForm(f=>({...f, logoData: ev.target.result}))
                reader.readAsDataURL(file)
              }}
            />
          </label>

          <button
            onClick={() => { if (!orgForm.name.trim()) { showToast('Enter org name'); return } setStep(1) }}
            style={{ width:'100%', background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'12px', cursor:'pointer', fontSize:13, fontWeight:600 }}
          >
            Next: Inventory Template
          </button>
        </div>
      )}

      {/* Step 2 — Template */}
      {step === 1 && (
        <div>
          <div style={card}>
            <div style={{ fontSize:14, fontWeight:700, color:'#2C1810', marginBottom:12 }}>Choose Inventory Starting Point</div>

            {[
              { id:'dumont', title:'Start from Dumont Template', desc:`Copy all ${DEFAULT_INVENTORY.length} items from Dumont Creamery. Includes boba, tea, syrups, ice cream, coffee, dry stock. Edit after creation.`, badge:`${DEFAULT_INVENTORY.length} items` },
              { id:'blank',  title:'Start from Scratch',         desc:'Begin with an empty inventory. Add items one by one or upload via CSV.', badge:'0 items' },
              { id:'upload', title:'Upload CSV',                  desc:'Upload your own item list in CSV format. Download the template below.', badge:'Custom' },
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setTemplate(opt.id)}
                style={{
                  padding:'12px 14px', borderRadius:10, marginBottom:8, cursor:'pointer',
                  border: `2px solid ${template===opt.id ? '#2C1810' : '#EDE0CC'}`,
                  background: template===opt.id ? '#FDF6EC' : '#fff',
                }}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'#2C1810' }}>{opt.title}</span>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#EDE0CC', color:'#8B7355' }}>{opt.badge}</span>
                </div>
                <div style={{ fontSize:11, color:'#8B7355' }}>{opt.desc}</div>
              </div>
            ))}

            {/* CSV upload */}
            {template === 'upload' && (
              <div style={{ marginTop:10 }}>
                <a
                  href="data:text/csv;charset=utf-8,name,code,category,vendor,uom,cost_price,sell_price,par,case_size%0AExample Item,CODE1,Boba %26 Tea,KARAT,CASE,45.25,0,2,6"
                  download="inventory_template.csv"
                  style={{ fontSize:12, color:'#C8843A', fontWeight:600, display:'block', marginBottom:8 }}
                >
                  Download CSV Template
                </a>
                <label style={{ display:'block', border:'2px dashed #EDE0CC', borderRadius:8, padding:'16px', textAlign:'center', cursor:'pointer' }}>
                  <div style={{ fontSize:13, color:'#8B7355' }}>
                    {customItems.length > 0 ? `${customItems.length} items loaded` : 'Click to upload CSV'}
                  </div>
                  <input type="file" accept=".csv" onChange={handleCSV} style={{ display:'none' }} />
                </label>
                {csvError && <div style={{ fontSize:12, color:'#E74C3C', marginTop:4 }}>{csvError}</div>}
              </div>
            )}
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setStep(0)} style={{ flex:1, background:'#888', color:'#fff', border:'none', borderRadius:8, padding:'12px', cursor:'pointer', fontSize:13 }}>
              Back
            </button>
            <button
              onClick={() => {
                if (template === 'upload' && customItems.length === 0) { showToast('Upload a CSV first'); return }
                setStep(2)
              }}
              style={{ flex:2, background:'#2C1810', color:'#fff', border:'none', borderRadius:8, padding:'12px', cursor:'pointer', fontSize:13, fontWeight:600 }}
            >
              Next: Review
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Review */}
      {step === 2 && (
        <div>
          <div style={card}>
            <div style={{ fontSize:14, fontWeight:700, color:'#2C1810', marginBottom:12 }}>Review & Create</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
              {[
                { label:'Org Name',   value: orgForm.name },
                { label:'Currency',   value: orgForm.currency },
                { label:'Template',   value: template === 'dumont' ? `Dumont (${DEFAULT_INVENTORY.length} items)` : template === 'upload' ? `CSV Upload (${customItems.length} items)` : 'Blank' },
                { label:'Brand Color', value: (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:16, height:16, borderRadius:4, background:orgForm.brandColor, border:'1px solid #EDE0CC' }} />
                    {orgForm.brandColor}
                  </div>
                )},
              ].map(({ label: l, value: v }) => (
                <div key={l} style={{ background:'#FDF6EC', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'#8B7355', marginBottom:2 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#2C1810' }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ background:'#FFF3E0', borderRadius:8, padding:'10px 12px', marginBottom:16, fontSize:12, color:'#C8843A' }}>
              After creation you can add regions, stores, and users. Items can be edited at any time in Admin → Items.
            </div>
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setStep(1)} style={{ flex:1, background:'#888', color:'#fff', border:'none', borderRadius:8, padding:'12px', cursor:'pointer', fontSize:13 }}>
              Back
            </button>
            <button
              onClick={createOrg}
              disabled={saving}
              style={{ flex:2, background: saving ? '#aaa' : '#27AE60', color:'#fff', border:'none', borderRadius:8, padding:'12px', cursor: saving ? 'not-allowed' : 'pointer', fontSize:13, fontWeight:700 }}
            >
              {saving ? 'Creating...' : `Create ${orgForm.name}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
