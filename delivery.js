// ══════════════════════════════════════════
// DELIVERY MODULE — Invoice PDF Parser
// ══════════════════════════════════════════

let parsedInvoiceLines = [];
let parsedInvoiceMeta  = {};   // { date, invoiceNumber, vendor, total }

// ── Render delivery log (summary cards with expand) ──
function renderDelivery() {
  const el = document.getElementById('deliveryList');
  if (!deliveryHistory.length) { el.innerHTML = '<div class="empty-state">No deliveries logged yet.</div>'; return; }

  // Group by invoiceId if available, else show individual items
  const invoices = {};
  deliveryHistory.forEach(d => {
    const key = d.invoiceId || ('manual-' + d.timestamp);
    if (!invoices[key]) invoices[key] = [];
    invoices[key].push(d);
  });

  el.innerHTML = Object.entries(invoices).map(([key, entries]) => {
    const first = entries[0];
    const isInvoice = !key.startsWith('manual-');
    const totalCost = entries.reduce((s, e) => s + (e.totalCost || 0), 0);
    const totalItems = entries.length;
    const dateStr = first.invoiceDate || first.timeStr || '';
    const vendor = first.vendor || 'Manual Entry';
    const invoiceNum = first.invoiceNumber || '';
    const displayTotal = totalCost > 0 ? `$${totalCost.toFixed(2)}` : '';

    const lineItemsHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px">
        <thead>
          <tr style="background:var(--cream)">
            <th style="text-align:left;padding:6px 8px;color:#8B7355;font-weight:600;border-bottom:1px solid var(--border)">#</th>
            <th style="text-align:left;padding:6px 8px;color:#8B7355;font-weight:600;border-bottom:1px solid var(--border)">Item</th>
            <th style="text-align:center;padding:6px 8px;color:#8B7355;font-weight:600;border-bottom:1px solid var(--border)">Qty</th>
            <th style="text-align:right;padding:6px 8px;color:#8B7355;font-weight:600;border-bottom:1px solid var(--border)">Unit $</th>
            <th style="text-align:right;padding:6px 8px;color:#8B7355;font-weight:600;border-bottom:1px solid var(--border)">Total</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((e,i) => `
          <tr style="border-bottom:1px solid var(--border);background:${i%2===0?'#fff':'var(--cream)'}">
            <td style="padding:6px 8px;color:#aaa">${i+1}</td>
            <td style="padding:6px 8px;color:var(--dark);font-weight:500">${e.itemName}</td>
            <td style="padding:6px 8px;text-align:center;color:#8B7355">${e.qty} ${e.uom||''}</td>
            <td style="padding:6px 8px;text-align:right;color:#8B7355">${e.unitCost ? '$'+e.unitCost.toFixed(2) : '—'}</td>
            <td style="padding:6px 8px;text-align:right;color:var(--caramel);font-weight:600">${e.totalCost ? '$'+e.totalCost.toFixed(2) : '—'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="background:var(--cream)">
            <td colspan="4" style="padding:8px;text-align:right;font-weight:700;color:var(--dark)">Total</td>
            <td style="padding:8px;text-align:right;font-weight:700;color:var(--caramel)">$${entries.reduce((s,e)=>s+(e.totalCost||0),0).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>`;

    return `<div class="del-invoice-card" id="inv-${key}">
      <div class="del-invoice-header" onclick="toggleInvoice('${key}')">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--dark)">${isInvoice ? '🧾' : '📦'} ${vendor} ${invoiceNum ? '· ' + invoiceNum : ''}</div>
          <div style="font-size:11px;color:#8B7355;margin-top:2px">${dateStr} · ${totalItems} item${totalItems>1?'s':''}</div>
        </div>
        ${displayTotal ? `<div style="font-size:16px;font-weight:700;color:var(--caramel);margin-right:8px">${displayTotal}</div>` : ''}
        <button onclick="event.stopPropagation();deleteDelivery('${key}')" style="background:none;border:none;cursor:pointer;font-size:16px;color:#C0392B;padding:4px 8px" title="Delete">🗑</button>
        <div style="font-size:18px;color:#8B7355;margin-left:4px" id="inv-arrow-${key}">▼</div>
      </div>
      <div class="del-invoice-items" id="inv-items-${key}" style="display:none">
        ${lineItemsHtml}
      </div>
    </div>`;
  }).join('');
}

window.toggleInvoice = function(key) {
  const items = document.getElementById('inv-items-' + key);
  const arrow = document.getElementById('inv-arrow-' + key);
  if (!items) return;
  const open = items.style.display !== 'none';
  items.style.display = open ? 'none' : 'block';
  arrow.textContent = open ? '▼' : '▲';
};

window.deleteDelivery = async function(key) {
  if (!confirm('Delete this delivery entry? This will NOT reverse stock changes.')) return;
  // Remove from local array
  deliveryHistory = deliveryHistory.filter(d => {
    const dk = d.invoiceId || ('manual-' + d.timestamp);
    return dk !== key;
  });
  // Remove from Firestore
  try {
    const snap = await getDocs(collection(db, 'stores', viewingStore, 'deliveries'));
    const toDelete = snap.docs.filter(d => {
      const data = d.data();
      const dk = data.invoiceId || ('manual-' + data.timestamp);
      return dk === key;
    });
    await Promise.all(toDelete.map(d => deleteDoc(doc(db, 'stores', viewingStore, 'deliveries', d.id))));
  } catch(e) { console.error(e); }
  renderDelivery();
  showToast('🗑 Delivery entry deleted');
};

// ── PDF Invoice Parser ──
window.parseInvoicePDF = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  const statusEl  = document.getElementById('invoiceParseStatus');
  const previewEl = document.getElementById('invoicePreview');
  statusEl.style.display = 'block';
  statusEl.innerHTML = '⏳ Reading invoice...';
  previewEl.style.display = 'none';

  try {
    // Load PDF.js
    if (!window.pdfjsLib) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Extract all text lines across all pages
    let allLines = [];
    let invoiceNumber = '', invoiceDate = '', vendor = 'Karat', total = 0;

    for (let p = 1; p <= pdf.numPages; p++) {
      const page  = await pdf.getPage(p);
      const tc    = await page.getTextContent();
      // Group text items by Y position (same Y = same line)
      const byY = {};
      tc.items.forEach(item => {
        const y = Math.round(item.transform[5]);
        if (!byY[y]) byY[y] = [];
        byY[y].push({ x: Math.round(item.transform[4]), str: item.str.trim() });
      });
      // Sort Y descending (top of page first), collect lines
      Object.keys(byY).sort((a,b) => b-a).forEach(y => {
        const lineStr = byY[y].sort((a,b) => a.x - b.x).map(i => i.str).join(' ').trim();
        if (lineStr) allLines.push(lineStr);
      });
    }

    // Extract meta from first page lines
    allLines.forEach((line, i) => {
      if (/invoice number/i.test(line)) {
        // Next token after "Invoice number" on same line or next line
        const m = line.match(/invoice number\s+(.+)/i);
        if (m) invoiceNumber = m[1].trim();
        else if (allLines[i+1]) invoiceNumber = allLines[i+1].trim();
      }
      if (/date of issue/i.test(line)) {
        const m = line.match(/date of issue\s+(.+)/i);
        if (m) invoiceDate = m[1].trim();
        else if (allLines[i+1]) invoiceDate = allLines[i+1].trim();
      }
      if (/amount due/i.test(line)) {
        const m = line.match(/\$([\d,]+\.\d{2})/);
        if (m) total = parseFloat(m[1].replace(',',''));
      }
      if (/karat/i.test(line)) vendor = 'Karat';
      if (/hyperpack/i.test(line)) vendor = 'Hyperpack';
      if (/sysco/i.test(line)) vendor = 'Sysco';
    });

    // Parse line items
    // Pattern: "Item Name  3  $45.25  $135.75"
    // Regex: line ending with $X.XX $X.XX preceded by a number
    const lineItemRegex = /^(.+?)\s+(\d+(?:\.\d+)?)\s+\$(\d+(?:,\d+)?(?:\.\d+)?)\s+\$(\d+(?:,\d+)?(?:\.\d+)?)$/;
    const parsed = [];

    allLines.forEach(line => {
      const m = line.match(lineItemRegex);
      if (!m) return;
      const name       = m[1].trim();
      const qty        = parseFloat(m[2]);
      const unit_price = parseFloat(m[3].replace(',',''));
      const lineTotal  = parseFloat(m[4].replace(',',''));
      // Skip header, totals, fees, refunds
      if (/^(description|subtotal|total|amount|qty|unit)/i.test(name)) return;
      if (/franchise|refund|fee/i.test(name)) return;
      if (lineTotal <= 0) return;
      parsed.push({ name, qty, unit_price, total: lineTotal });
    });

    if (!parsed.length) {
      statusEl.innerHTML = '⚠️ No line items found. The PDF may be image-based (scanned). Use manual entry below.';
      return;
    }

    parsedInvoiceMeta  = { invoiceNumber, date: invoiceDate, vendor, total };
    parsedInvoiceLines = parsed.map(line => {
      const nl = line.name.toLowerCase();
      const matched = DEFAULT_INVENTORY.find(inv => {
        const il = inv.name.toLowerCase();
        const words = nl.split(' ').filter(w => w.length > 3);
        return words.some(w => il.includes(w)) || il.split(' ').some(w => w.length > 3 && nl.includes(w));
      });
      return { ...line, inventoryId: matched?.id || null, inventoryName: matched?.name || null };
    });

    renderInvoicePreview();
    const mc = parsedInvoiceLines.filter(l => l.inventoryId).length;
    statusEl.innerHTML = `✅ Found ${parsedInvoiceLines.length} items · ${mc} matched to inventory · ${parsedInvoiceLines.length - mc} unmatched`;
    previewEl.style.display = 'block';

  } catch(e) {
    statusEl.innerHTML = '⚠️ Could not read PDF. Try uploading again or use manual entry below.';
    console.error('PDF parse error:', e.message, e.stack);
  }
};

function renderInvoicePreview() {
  const meta = parsedInvoiceMeta;
  document.getElementById('invoiceTotalBadge').textContent =
    meta.total ? `Total: $${meta.total.toFixed(2)}` : '';

  // Show date + vendor summary
  const summaryHtml = `
    <div class="cogs-card" style="margin-bottom:12px;padding:10px 14px">
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div class="cogs-detail-item">Vendor: <span class="cogs-detail-val">${meta.vendor || '—'}</span></div>
        <div class="cogs-detail-item">Date: <span class="cogs-detail-val">${meta.date || '—'}</span></div>
        <div class="cogs-detail-item">Invoice #: <span class="cogs-detail-val">${meta.invoiceNumber || '—'}</span></div>
        <div class="cogs-detail-item">Total: <span class="cogs-detail-val" style="color:var(--caramel)">$${meta.total ? meta.total.toFixed(2) : '—'}</span></div>
      </div>
    </div>`;

  document.getElementById('invoiceLineItems').innerHTML = summaryHtml + parsedInvoiceLines.map((line, idx) => `
    <div class="invoice-line">
      <div class="invoice-line-name">${line.name}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="invoice-line-meta">×<input type="number" value="${line.qty}" min="0" step="0.5"
          style="width:60px;padding:4px 6px;border-radius:6px;border:1px solid var(--border);background:var(--cream);font-family:inherit;font-size:13px"
          onchange="parsedInvoiceLines[${idx}].qty=parseFloat(this.value)||0"></span>
        <span class="invoice-line-meta">@ $<input type="number" value="${line.unit_price}" min="0" step="0.01"
          style="width:70px;padding:4px 6px;border-radius:6px;border:1px solid var(--border);background:var(--cream);font-family:inherit;font-size:13px"
          onchange="parsedInvoiceLines[${idx}].unit_price=parseFloat(this.value)||0"></span>
        <span class="invoice-line-meta" style="font-weight:600;color:var(--dark)">= $${line.total.toFixed(2)}</span>
        ${line.inventoryId
          ? `<span class="invoice-line-matched">✓ ${line.inventoryName}</span>`
          : `<span class="invoice-line-unmatched">⚠ No match</span>`}
      </div>
    </div>`).join('');
}

window.confirmDelivery = async function() {
  if (!parsedInvoiceLines.length) return;
  const invoiceId = 'inv-' + Date.now();
  const meta = parsedInvoiceMeta;
  let stockUpdated = 0;

  for (const line of parsedInvoiceLines) {
    const entry = {
      invoiceId,
      invoiceNumber: meta.invoiceNumber || '',
      invoiceDate: meta.date || new Date().toLocaleDateString(),
      vendor: meta.vendor || 'Unknown',
      invoiceTotal: meta.total || 0,
      itemName: line.name,
      qty: line.qty,
      unitCost: line.unit_price,
      totalCost: line.qty * line.unit_price,
      uom: line.inventoryId ? (DEFAULT_INVENTORY.find(i => i.id === line.inventoryId)?.uom || '') : '',
      timeStr: new Date().toLocaleString(),
      timestamp: Date.now()
    };

    // Update stock if matched
    if (line.inventoryId) {
      const item = inventory.find(i => i.id === line.inventoryId);
      if (item) {
        item.stock = Math.round((item.stock + line.qty) * 10) / 10;
        // Update actual cost
        item.cost = line.unit_price;
        stockUpdated++;
      }
    }

    deliveryHistory.unshift(entry);
    try {
      await addDoc(collection(db, 'stores', viewingStore, 'deliveries'), entry);
      // Save to COGS cost ledger
      await addDoc(collection(db, 'stores', viewingStore, 'costLedger'), {
        date: meta.date || new Date().toLocaleDateString(),
        dateTs: Date.now(),
        invoiceId,
        vendor: meta.vendor || '',
        amount: line.qty * line.unit_price,
        itemName: line.name
      });
    } catch(e) {}
  }

  await saveStock();

  // Hide preview, reset
  document.getElementById('invoicePreview').style.display = 'none';
  document.getElementById('invoiceParseStatus').innerHTML =
    `✅ Delivery confirmed — ${stockUpdated} inventory items updated, ${parsedInvoiceLines.length} cost entries recorded`;
  parsedInvoiceLines = [];
  parsedInvoiceMeta = {};

  renderDashboard(); renderInventory(); renderOrders(); renderDelivery();
  showToast(`✅ Invoice logged — ${stockUpdated} items updated`);
  logAudit('delivery_confirmed', { invoiceId, vendor: meta.vendor, total: meta.total, itemCount: parsedInvoiceLines.length, stockUpdated });
};

window.cancelInvoice = function() {
  parsedInvoiceLines = [];
  parsedInvoiceMeta = {};
  document.getElementById('invoicePreview').style.display = 'none';
  document.getElementById('invoiceParseStatus').style.display = 'none';
};

// ── Manual single item log ──
window.logDelivery = async function() {
  const itemId = parseInt(document.getElementById('delivItem').value);
  const qty    = parseFloat(document.getElementById('delivQty').value) || 0;
  const cost   = parseFloat(document.getElementById('delivCost').value) || 0;
  const note   = document.getElementById('delivNote').value.trim();
  if (!itemId || qty <= 0) { showToast('⚠️ Select an item and enter qty'); return; }
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  item.stock = Math.round((item.stock + qty) * 10) / 10;
  if (cost > 0) item.cost = cost;
  const entry = {
    itemId, itemName: item.name, qty, uom: item.uom,
    unitCost: cost, totalCost: cost * qty, note,
    vendor: 'Manual', invoiceDate: new Date().toLocaleDateString(),
    timeStr: new Date().toLocaleString(), timestamp: Date.now()
  };
  deliveryHistory.unshift(entry);
  try {
    await addDoc(collection(db, 'stores', viewingStore, 'deliveries'), entry);
    if (cost > 0) {
      await addDoc(collection(db, 'stores', viewingStore, 'costLedger'), {
        date: new Date().toLocaleDateString(), dateTs: Date.now(),
        vendor: 'Manual', amount: cost * qty, itemName: item.name
      });
    }
  } catch(e) {}
  await saveStock();
  document.getElementById('delivQty').value = '';
  document.getElementById('delivCost').value = '';
  document.getElementById('delivNote').value = '';
  renderDashboard(); renderInventory(); renderOrders(); renderDelivery();
  showToast(`✅ +${qty} ${item.uom} of ${item.name} logged`);
};







// ── Load Pending Signups (owner only) ──
async function loadPendingSignups() {
  const el = document.getElementById('pendingSignupsList');
  if (!el) return;
  try {
    const snap = await getDocs(collection(db, 'signupRequests'));
    const pending = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                             .filter(s => s.status === 'pending');
    if (!pending.length) {
      el.innerHTML = '<div style="font-size:12px;color:#8B7355">No pending signups.</div>';
      return;
    }
    el.innerHTML = pending.map(s => `
      <div style="background:var(--cream);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--dark)">${s.name}</div>
            <div style="font-size:12px;color:#8B7355">${s.email}</div>
            <div style="font-size:12px;color:#8B7355;margin-top:2px">🏪 ${s.storeName} · ${s.storeType} · ${s.city || ''}</div>
            <div style="font-size:11px;color:#aaa;margin-top:2px">${new Date(s.createdAt).toLocaleDateString()}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-log" style="width:auto;padding:6px 14px;font-size:12px;background:var(--green-ok)"
              onclick="approveSignup('${s.id}','${s.storeId}','${s.storeName}','${s.email}')">✅ Approve</button>
            <button class="btn-log" style="width:auto;padding:6px 14px;font-size:12px;background:#C0392B"
              onclick="rejectSignup('${s.id}','${s.email}')">✕ Reject</button>
          </div>
        </div>
      </div>`).join('');
  } catch(e) {
    el.innerHTML = '<div style="font-size:12px;color:#8B7355">Could not load signups.</div>';
  }
}

window.approveSignup = async function(reqId, storeId, storeName, email) {
  try {
    const emailKey = email.replace(/\./g,'_').replace(/@/g,'_at_');

    // Update signup request status
    await setDoc(doc(db, 'signupRequests', reqId), { status: 'approved' }, { merge: true });

    // Update user profile to approved
    await setDoc(doc(db, 'users', emailKey), {
      status: 'approved',
      role: 'manager',
      store: storeId,
      approvedAt: Date.now(),
      approvedBy: currentUser.email
    }, { merge: true });

    // Create store in config
    const configSnap = await getDoc(doc(db, 'config', 'stores'));
    const existing = configSnap.exists() ? configSnap.data() : {};
    existing[storeId] = { name: storeName, id: storeId, createdAt: Date.now() };
    await setDoc(doc(db, 'config', 'stores'), existing);

    showToast(`✅ ${storeName} approved!`);
    logAudit('signup_approved', { email, storeId, storeName });
    loadPendingSignups();
  } catch(e) {
    showToast('⚠️ Approval failed: ' + e.message);
  }
};

window.rejectSignup = async function(reqId, email) {
  if (!confirm(`Reject signup from ${email}?`)) return;
  try {
    await setDoc(doc(db, 'signupRequests', reqId), { status: 'rejected' }, { merge: true });
    const emailKey = email.replace(/\./g,'_').replace(/@/g,'_at_');
    await setDoc(doc(db, 'users', emailKey), { status: 'rejected' }, { merge: true });
    showToast('Signup rejected');
    loadPendingSignups();
  } catch(e) {}
};

