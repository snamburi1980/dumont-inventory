// ══════════════════════════════════════════
// ONBOARDING MODULE
// ══════════════════════════════════════════

// ── Login/Signup screen toggles ──
window.showSignup = function() {
  document.getElementById('loginPanel').style.display  = 'none';
  document.getElementById('signupPanel').style.display = 'block';
  document.getElementById('pendingPanel').style.display = 'none';
};

window.showLogin = function() {
  document.getElementById('loginPanel').style.display  = 'block';
  document.getElementById('signupPanel').style.display = 'none';
  document.getElementById('pendingPanel').style.display = 'none';
};

window.showPending = function(storeName) {
  document.getElementById('loginPanel').style.display   = 'none';
  document.getElementById('signupPanel').style.display  = 'none';
  document.getElementById('pendingPanel').style.display = 'block';
  document.getElementById('pendingStoreName').textContent = '🏪 ' + storeName;
};

// ── Sign Up ──
window.doSignup = async function() {
  const name      = document.getElementById('signupName').value.trim();
  const email     = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password  = document.getElementById('signupPassword').value;
  const storeName = document.getElementById('signupStoreName').value.trim();
  const storeType = document.getElementById('signupStoreType').value;
  const city      = document.getElementById('signupCity').value.trim();
  const errEl     = document.getElementById('signupError');
  const btn       = document.getElementById('signupBtn');

  errEl.textContent = '';

  if (!name || !email || !password || !storeName || !storeType) {
    errEl.textContent = 'Please fill in all required fields'; return;
  }
  if (password.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters'; return;
  }

  btn.textContent = 'Creating account...';
  btn.disabled = true;

  try {
    // Create Firebase Auth account
    const { createUserWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js');
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;

    // Generate store ID from store name
    const storeId = storeName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30);

    // Write user profile with pending status
    const emailKey = email.replace(/\./g,'_').replace(/@/g,'_at_');
    await setDoc(doc(db, 'users', emailKey), {
      email, name, store: storeId, role: 'manager',
      status: 'pending',
      storeName, storeType, city,
      createdAt: Date.now()
    });

    // Write pending signup request for owner to review
    await setDoc(doc(db, 'signupRequests', emailKey), {
      email, name, storeName, storeType, city, storeId,
      status: 'pending',
      createdAt: Date.now(),
      uid
    });

    showPending(storeName);
    showToast('✅ Account created! Awaiting approval.');

  } catch(e) {
    btn.textContent = 'Request Access';
    btn.disabled = false;
    const msgs = {
      'auth/email-already-in-use': 'This email is already registered. Try signing in.',
      'auth/weak-password': 'Password is too weak. Use at least 8 characters.',
      'auth/invalid-email': 'Invalid email address.',
    };
    errEl.textContent = msgs[e.code] || e.message;
  }
};

// ── Check if user is pending on auth state change ──
async function checkPendingStatus(user) {
  const emailKey = user.email.replace(/\./g,'_').replace(/@/g,'_at_');
  try {
    const snap = await getDoc(doc(db, 'users', emailKey));
    if (snap.exists() && snap.data().status === 'pending') {
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
      showPending(snap.data().storeName || 'Your Store');
      return true; // is pending
    }
  } catch(e) {}
  return false; // not pending
}

// ── Setup Wizard ──
let wizStaffList = [];

window.wizNext = function(step) {
  // Save current step data before moving
  if (step === 2) {
    const storeName = document.getElementById('wiz1StoreName').value.trim();
    if (!storeName) { showToast('⚠️ Please enter your store name'); return; }
  }

  for (let i = 1; i <= 4; i++) {
    document.getElementById('wizStep' + i).style.display = i === step ? 'block' : 'none';
  }
  document.getElementById('wizardStepLabel').textContent = `Step ${step} of 4`;
  document.getElementById('wizardProgress').style.width = (step * 25) + '%';

  // Populate step 3 menu prices
  if (step === 3) renderWizMenuPrices();
};

window.wiz2AddStaff = function() {
  const name = document.getElementById('wiz2Name').value.trim();
  const role = document.getElementById('wiz2Role').value.trim() || 'Staff';
  if (!name) { showToast('⚠️ Enter a name'); return; }
  const colors = ['#C8843A','#7BBFA5','#5B8DD9','#D4A843','#E8A598','#9B59B6'];
  wizStaffList.push({ id: 'ws' + Date.now(), name, role, color: colors[wizStaffList.length % colors.length] });
  document.getElementById('wiz2Name').value = '';
  document.getElementById('wiz2Role').value = '';
  renderWiz2Staff();
};

function renderWiz2Staff() {
  document.getElementById('wiz2StaffList').innerHTML = wizStaffList.length === 0
    ? '<div style="font-size:12px;color:#8B7355;margin-bottom:8px">No staff added yet — add at least one</div>'
    : wizStaffList.map((s,i) => `<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--card-bg);border-radius:8px;margin-bottom:6px">
        <div style="width:10px;height:10px;border-radius:50%;background:${s.color}"></div>
        <span style="flex:1;font-size:13px">${s.name} <span style="color:#8B7355">${s.role}</span></span>
        <span onclick="wizStaffList.splice(${i},1);renderWiz2Staff()" style="cursor:pointer;color:#C0392B">×</span>
      </div>`).join('');
}

function renderWizMenuPrices() {
  const cats = ['Milk Tea', 'Coffee', 'Ice Cream', 'Milkshakes'];
  const items = Object.keys(RECIPES).slice(0, 20); // first 20 items
  document.getElementById('wiz3MenuItems').innerHTML = items.map(name => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:13px;color:var(--dark)">${name}</span>
      <div style="display:flex;align-items:center;gap:4px">
        <span style="font-size:12px;color:#8B7355">$</span>
        <input type="number" step="0.25" min="0" placeholder="0.00"
          value="${menuPrices[name] || ''}"
          onchange="menuPrices['${name.replace(/'/g,"\\'")}'] = parseFloat(this.value)||0"
          style="width:70px;padding:6px 8px;border-radius:6px;border:1px solid var(--border);font-family:inherit;font-size:13px;text-align:right">
      </div>
    </div>`).join('');
}

window.completeWizard = async function() {
  // Save wizard data
  const storeName = document.getElementById('wiz1StoreName').value.trim();
  const city = document.getElementById('wiz1City').value.trim();

  // Get selected categories
  const cats = [...document.querySelectorAll('#wiz1Categories input:checked')].map(c => c.value);

  // Save staff to schedule
  if (wizStaffList.length > 0) {
    schedStaff = wizStaffList;
    await saveScheduleData();
  }

  // Save menu prices
  await saveMenuPrice('_wizard_complete_', 1);

  // Mark setup as complete in Firestore
  const emailKey = currentUser.email.replace(/\./g,'_').replace(/@/g,'_at_');
  try {
    await setDoc(doc(db, 'users', emailKey), {
      setupComplete: true,
      storeName, city,
      customCategories: cats.filter(c => !['Boba','Coffee','Ice Cream','Dry Stock','Condiments'].includes(c))
    }, { merge: true });
  } catch(e) {}

  // Hide wizard and show app
  document.getElementById('setupWizard').style.display = 'none';
  showToast('🎉 Setup complete! Welcome to your store.');
  logAudit('setup_complete', { storeName, staffCount: wizStaffList.length });
};

// ── Show wizard for new users ──
async function checkNeedsSetup() {
  if (!currentUser) return;
  const emailKey = currentUser.email.replace(/\./g,'_').replace(/@/g,'_at_');
  try {
    const snap = await getDoc(doc(db, 'users', emailKey));
    if (snap.exists() && !snap.data().setupComplete && snap.data().status === 'approved') {
      // Pre-fill wizard with signup data
      const d = snap.data();
      document.getElementById('wiz1StoreName').value = d.storeName || '';
      document.getElementById('wiz1City').value = d.city || '';
      document.getElementById('setupWizard').style.display = 'block';
    }
  } catch(e) {}
}


// ══════════════════════════════════════════
// AUDIT TRAIL MODULE
// ══════════════════════════════════════════

async function logAudit(action, details = {}) {
  if (!currentUser) return;
  try {
    await addDoc(collection(db, 'stores', viewingStore, 'auditLog'), {
      action,
      details,
      userEmail: currentUser.email,
      userName:  currentUserConfig?.name || currentUser.email,
      storeId:   viewingStore,
      timestamp: Date.now(),
      dateStr:   new Date().toLocaleString()
    });
  } catch(e) {
    // Audit logging should never break the app
    console.warn('Audit log failed:', e);
  }
}


// ══════════════════════════════════════════
// ADD ITEM / ADD CATEGORY MODULE
// ══════════════════════════════════════════

// Custom categories added by manager (persisted to Firestore)
let customCategories = [];
let customItems = []; // items added via the UI

async function loadCustomItems() {
  try {
    const snap = await getDoc(doc(db, 'stores', viewingStore, 'inventory', 'custom'));
    if (snap.exists()) {
      const d = snap.data();
      customCategories = d.categories || [];
      customItems      = d.items      || [];
      // Merge custom items into inventory if not already present
      customItems.forEach(ci => {
        if (!inventory.find(i => i.id === ci.id)) {
          inventory.push(ci);
        }
      });
    }
  } catch(e) {}
  renderStockValueBanner();
  renderInventory();
}

async function saveCustomItems() {
  try {
    await setDoc(doc(db, 'stores', viewingStore, 'inventory', 'custom'), {
      categories: customCategories,
      items: customItems
    });
  } catch(e) { showToast('⚠️ Save failed'); }
}

// ── Stock Value Banner ──
function renderStockValueBanner() {
  const cats = [...new Set(inventory.map(i => i.cat))];
  const el = document.getElementById('stockValueBanner');
  if (!el) return;

  // Total value
  let totalVal = 0;
  inventory.forEach(i => { if (i.cost) totalVal += i.stock * i.cost; });

  let html = `<div class="stock-val-card" style="border-color:var(--caramel);background:rgba(200,132,58,0.06)">
    <div class="stock-val-cat">Total Stock</div>
    <div class="stock-val-amt">$${totalVal.toFixed(0)}</div>
    <div class="stock-val-count">${inventory.length} items</div>
  </div>`;

  cats.forEach(cat => {
    const items = inventory.filter(i => i.cat === cat);
    const val = items.reduce((s,i) => s + (i.cost ? i.stock * i.cost : 0), 0);
    const count = items.length;
    html += `<div class="stock-val-card">
      <div class="stock-val-cat">${cat}</div>
      <div class="stock-val-amt">$${val.toFixed(0)}</div>
      <div class="stock-val-count">${count} items</div>
    </div>`;
  });

  el.innerHTML = html;
}

// ── Add Category Modal ──
window.openAddCategory = function() {
  const allCats = [...new Set(inventory.map(i => i.cat)), ...customCategories];
  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="modal-title">+ Add Category</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div style="margin-bottom:14px">
      ${allCats.map(c => `<div style="display:inline-flex;align-items:center;gap:6px;background:var(--cream);border:1px solid var(--border);border-radius:20px;padding:5px 12px;margin:4px;font-size:13px">
        ${c}
        ${customCategories.includes(c) ? `<span onclick="removeCategory('${c}')" style="cursor:pointer;color:#C0392B;font-size:16px">×</span>` : ''}
      </div>`).join('')}
    </div>
    <div class="modal-label">New Category Name</div>
    <input class="modal-input" id="newCatName" placeholder="e.g. Bakery, Falooda, Seasonal">
    <button class="modal-btn" onclick="addCategory()">+ Add Category</button>
  `);
};

window.addCategory = async function() {
  const name = document.getElementById('newCatName').value.trim();
  if (!name) { showToast('⚠️ Enter a category name'); return; }
  if (customCategories.includes(name)) { showToast('⚠️ Already exists'); return; }
  customCategories.push(name);
  await saveCustomItems();
  showToast(`✅ Category "${name}" added!`);
  closeModal();
  renderInventory();
};

window.removeCategory = async function(name) {
  customCategories = customCategories.filter(c => c !== name);
  await saveCustomItems();
  openAddCategory();
  renderInventory();
};

// ── Add Item Modal ──
window.openAddItem = function() {
  const allCats = [...new Set(inventory.map(i => i.cat)), ...customCategories];
  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="modal-title">+ Add Inventory Item</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>

    <div class="modal-label">Item Name *</div>
    <input class="modal-input" id="aiName" placeholder="e.g. Croissant, Rose Syrup">

    <div class="modal-label">Category *</div>
    <select class="modal-input" id="aiCat">
      <option value="">— Select category —</option>
      ${allCats.map(c => `<option value="${c}">${c}</option>`).join('')}
    </select>

    <div class="modal-label">Vendor / Supplier</div>
    <input class="modal-input" id="aiVendor" placeholder="e.g. Walmart, Local Bakery">

    <div class="modal-label">Unit of Measure</div>
    <select class="modal-input" id="aiUom">
      <option>CASE</option><option>BAG</option><option>BOTTLE</option>
      <option>JAR</option><option>TUB</option><option>BOX</option>
      <option>PKT</option><option>CAN</option><option>EACH</option><option>LBS</option>
    </select>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px">
      <div>
        <div class="modal-label">Current Stock</div>
        <input class="modal-input" id="aiStock" type="number" min="0" value="0" step="0.5">
      </div>
      <div>
        <div class="modal-label">Par Level</div>
        <input class="modal-input" id="aiPar" type="number" min="0" value="1" step="0.5">
      </div>
      <div>
        <div class="modal-label">Unit Cost ($)</div>
        <input class="modal-input" id="aiCost" type="number" min="0" value="" step="0.01" placeholder="0.00">
      </div>
    </div>

    <div class="modal-label">Order Quantity</div>
    <input class="modal-input" id="aiOrderQty" placeholder="e.g. 1 CASE, 2 BAGS">

    <button class="modal-btn" onclick="addCustomItem()">+ Add to Inventory</button>
  `);
};

window.addCustomItem = async function() {
  const name     = document.getElementById('aiName').value.trim();
  const cat      = document.getElementById('aiCat').value;
  const vendor   = document.getElementById('aiVendor').value.trim() || 'Other';
  const uom      = document.getElementById('aiUom').value;
  const stock    = parseFloat(document.getElementById('aiStock').value) || 0;
  const par      = parseFloat(document.getElementById('aiPar').value) || 1;
  const cost     = parseFloat(document.getElementById('aiCost').value) || 0;
  const orderQty = document.getElementById('aiOrderQty').value.trim() || `1 ${uom}`;

  if (!name || !cat) { showToast('⚠️ Name and category required'); return; }

  // Generate unique id (use timestamp-based high number to avoid conflicts)
  const newId = 9000 + customItems.length + 1;
  const newItem = { id:newId, name, cat, vendor, uom, stock, par, cost, order_qty:orderQty, code:`CUSTOM-${newId}` };

  customItems.push(newItem);
  inventory.push(newItem);

  // Also save stock to main stock doc
  await saveStock();
  await saveCustomItems();

  closeModal();
  renderInventory();
  renderStockValueBanner();
  renderDashboard();
  showToast(`✅ "${name}" added to ${cat}!`);
};






