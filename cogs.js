// ══════════════════════════════════════════
// COGS MODULE
// ══════════════════════════════════════════

// Menu selling prices — loaded from Firestore, editable in UI
let menuPrices = {
  // Boba drinks
  "Taro Milk Tea": 7.50, "Matcha Milk Tea": 7.50, "Horchata Milk Tea": 7.50,
  "Tiger Stripes": 7.50, "Thai Milk Tea": 7.00, "Classic Milk Tea": 6.75,
  "Dirty Mad Tea": 7.50, "Mangoficient": 7.50, "Pink Lips": 7.50,
  "Passionate Love": 7.50, "Lychee Lust": 7.50,
  "Strawberry Burst": 7.00, "Mangonada": 7.50,
  "Mango Market Lemonade": 6.50, "Pineapple Island Lemonade": 6.50, "Passion World Lemonade": 6.50,
  "Taro Smoothie": 7.00, "Matcha Smoothie": 7.00,
  // Coffee
  "Latte Hot": 5.50, "Latte Iced": 6.00, "Iced Latte": 6.00,
  "Cappuccino Hot": 5.50, "Americano Hot": 4.50,
  "Dark Chocolate Mocha Hot": 6.50, "Dark Chocolate Mocha Iced": 6.50,
  "White Chocolate Mocha Hot": 6.50, "White Chocolate Mocha Iced": 6.50,
  "Pistachio White Mocha Hot": 7.00, "Pistachio White Mocha Iced": 7.00,
  "Blackberry White Mocha Iced": 7.00,
  "Date Cardamom Latte Hot": 7.00, "Date Cardamom Latte Iced": 7.00,
  "OG Cold Coffee": 6.50,
  "Affogato Single shot": 6.50, "Affogato Double Shot": 7.50, "Matcha Affogato": 7.00,
  // Milkshakes
  "Kheer Milkshake": 9.00, "Raspberry Mascarpone Milkshake": 9.00,
  "Strawberry Chunks Milkshake": 9.00, "Pistachio Milkshake": 9.00,
  // Ice cream scoops
  "Vanilla Bean kids": 4.50, "Vanilla Bean Regular": 6.50,
  "Classic Chocolate kids": 4.50, "Classic Chocolate Regular": 6.50,
  "Butterscotch kids": 4.50, "Butterscotch Regular": 6.50,
  "Pistachio kids": 4.50, "Pistachio Regular": 6.50,
  "Kheer kids": 4.50, "Kheer Regular": 6.50,
  "Salted Caramel kids": 4.50, "Salted Caramel Regular": 6.50,
  "Mango kids": 4.50, "Mango Regular": 6.50,
  "Biscoff kids": 4.50, "Biscoff Regular": 6.50,
  "Oreo Caramel Fudge kids": 4.50, "Oreo Caramel Fudge Regular": 6.50,
  "Strawberry Chunks kids": 4.50,
  "Filter Coffee kids": 4.50, "Filter Coffee Regular": 6.50,
  "La Ferrero kids": 4.50, "La Ferrero Regular": 6.50,
};

let cogsActiveCat = 'all';
let cogsLoaded = false;

async function loadCogsData() {
  try {
    const snap = await getDoc(doc(db, 'stores', viewingStore, 'cogs', 'menuPrices'));
    if (snap.exists()) {
      const saved = snap.data();
      Object.assign(menuPrices, saved);
    }
  } catch(e) {}
  cogsLoaded = true;
  renderCogs();
}

async function saveMenuPrice(menuItem, price) {
  menuPrices[menuItem] = price;
  try {
    await setDoc(doc(db, 'stores', viewingStore, 'cogs', 'menuPrices'), menuPrices);
  } catch(e) {}
}

function calcItemCOGS(menuItem) {
  const recipe = RECIPES[menuItem];
  if (!recipe) return null;
  let ingredientCost = 0;
  recipe.forEach(({id, a}) => {
    const item = DEFAULT_INVENTORY.find(i => i.id === id);
    if (item && item.cost) {
      ingredientCost += item.cost * a;
    }
  });
  const sellPrice = menuPrices[menuItem] || 0;
  const cogsPct = sellPrice > 0 ? (ingredientCost / sellPrice) * 100 : null;
  const margin = sellPrice > 0 ? sellPrice - ingredientCost : null;
  const marginPct = sellPrice > 0 ? ((sellPrice - ingredientCost) / sellPrice) * 100 : null;
  return { ingredientCost, sellPrice, cogsPct, margin, marginPct };
}

// Group menu items by category
const MENU_CATS = {
  'Milk Tea': ['Taro Milk Tea','Matcha Milk Tea','Horchata Milk Tea','Tiger Stripes','Thai Milk Tea','Classic Milk Tea','Dirty Mad Tea'],
  'Fruit Tea': ['Mangoficient','Pink Lips','Passionate Love','Lychee Lust'],
  'Slushies': ['Strawberry Burst','Mangonada'],
  'Lemonade': ['Mango Market Lemonade','Pineapple Island Lemonade','Passion World Lemonade'],
  'Coffee': ['Latte Hot','Latte Iced','Iced Latte','Cappuccino Hot','Americano Hot','Dark Chocolate Mocha Hot','Dark Chocolate Mocha Iced','White Chocolate Mocha Hot','White Chocolate Mocha Iced','Pistachio White Mocha Hot','Pistachio White Mocha Iced','Blackberry White Mocha Iced','Date Cardamom Latte Hot','Date Cardamom Latte Iced','OG Cold Coffee','Affogato Single shot','Affogato Double Shot','Matcha Affogato'],
  'Milkshakes': ['Kheer Milkshake','Raspberry Mascarpone Milkshake','Strawberry Chunks Milkshake','Pistachio Milkshake'],
  'Ice Cream': ['Vanilla Bean kids','Vanilla Bean Regular','Classic Chocolate kids','Classic Chocolate Regular','Butterscotch kids','Butterscotch Regular','Pistachio kids','Pistachio Regular','Kheer kids','Kheer Regular','Salted Caramel kids','Salted Caramel Regular','Mango kids','Mango Regular','Biscoff kids','Biscoff Regular','Oreo Caramel Fudge kids','Oreo Caramel Fudge Regular','La Ferrero kids','Filter Coffee kids','Filter Coffee Regular'],
};

function renderCogs() {
  if (!cogsLoaded) { loadCogsData(); return; }

  // Category filter
  const cats = ['all', ...Object.keys(MENU_CATS)];
  document.getElementById('cogsCatFilter').innerHTML = cats.map(c =>
    `<button class="cat-btn ${cogsActiveCat===c?'active':''}" onclick="setCogscat('${c}')">${c==='all'?'All':c}</button>`
  ).join('');

  // Calc all items
  const allItems = cogsActiveCat === 'all'
    ? Object.keys(RECIPES)
    : (MENU_CATS[cogsActiveCat] || []);

  const results = allItems.map(name => ({ name, ...calcItemCOGS(name) })).filter(r => r.ingredientCost !== undefined);

  // Summary stats
  const withPrices = results.filter(r => r.cogsPct !== null);
  if (withPrices.length) {
    const avgCogs = withPrices.reduce((s,r) => s + r.cogsPct, 0) / withPrices.length;
    document.getElementById('cogsAvgPct').textContent = avgCogs.toFixed(1) + '%';
    const best = withPrices.reduce((a,b) => (a.marginPct > b.marginPct ? a : b));
    const worst = withPrices.reduce((a,b) => (a.cogsPct > b.cogsPct ? a : b));
    document.getElementById('cogsBestItem').textContent = best.name.split(' ').slice(0,3).join(' ');
    document.getElementById('cogsWorstItem').textContent = worst.name.split(' ').slice(0,3).join(' ');
  }

  // Render cards
  document.getElementById('cogsTable').innerHTML = results.map(r => {
    const hasCogs = r.cogsPct !== null;
    const pctClass = !hasCogs ? '' : r.cogsPct < 20 ? 'good' : r.cogsPct < 32 ? 'warn' : 'bad';
    const barClass = !hasCogs ? 'margin-bar-warn' : r.cogsPct < 20 ? 'margin-bar-good' : r.cogsPct < 32 ? 'margin-bar-warn' : 'margin-bar-bad';
    const barWidth = hasCogs ? Math.min(100, r.cogsPct * 2) : 0;
    return `<div class="cogs-card">
      <div class="cogs-top">
        <span class="cogs-name">${r.name}</span>
        <span class="cogs-pct ${pctClass}">${hasCogs ? r.cogsPct.toFixed(1)+'%' : '—'}</span>
      </div>
      <div class="cogs-bar"><div class="cogs-bar-fill ${barClass}" style="width:${barWidth}%"></div></div>
      <div class="cogs-details">
        <div class="cogs-detail-item">Ingredient cost: <span class="cogs-detail-val">$${r.ingredientCost.toFixed(3)}</span></div>
        <div class="cogs-detail-item">
          Sell price: $<input class="cogs-price-input" type="number" step="0.25" min="0"
            value="${r.sellPrice || ''}" placeholder="0.00"
            onchange="updateMenuPrice('${r.name.replace(/'/g,"\\'")}', this.value)"
            onclick="this.select()">
        </div>
        <div class="cogs-detail-item">Margin: <span class="cogs-detail-val ${pctClass}">${hasCogs ? '$'+r.margin.toFixed(2)+' ('+r.marginPct.toFixed(1)+'%)' : 'Enter price →'}</span></div>
      </div>
    </div>`;
  }).join('');
}

window.setCogscat = function(cat) { cogsActiveCat = cat; renderCogs(); };

window.updateMenuPrice = async function(menuItem, val) {
  const price = parseFloat(val);
  if (isNaN(price) || price <= 0) return;
  await saveMenuPrice(menuItem, price);
  renderCogs();
  showToast(`✅ Price updated for ${menuItem}`);
};


// ── ADMIN PANEL ──

// allStores defined in core.js

async function loadAdminStores() {
  // Load any extra stores saved to Firestore
  try {
    const snap = await getDoc(doc(db, 'config', 'stores'));
    if (snap.exists()) {
      const extra = snap.data();
      Object.assign(allStores, extra);
      // Merge into STORES and USERS store switcher
      Object.keys(extra).forEach(sid => {
        if (!STORES[sid]) STORES[sid] = extra[sid];
      });
    }
  } catch(e) {}
  renderAdminStoreList();
  populateAdminStoreSelect();
}

function populateAdminStoreSelect() {
  const sel = document.getElementById('newUserStore');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Assign to store —</option>' +
    Object.keys(allStores).map(sid => `<option value="${sid}">${allStores[sid].name}</option>`).join('');
}

window.adminAddStore = async function() {
  const sid = document.getElementById('newStoreId').value.trim().toLowerCase().replace(/\s+/g,'-');
  const name = document.getElementById('newStoreName').value.trim();
  const city = document.getElementById('newStoreCity').value.trim();
  if (!sid || !name) { showToast('⚠️ Store ID and name required'); return; }
  if (allStores[sid]) { showToast('⚠️ Store ID already exists'); return; }
  const newStore = { name, city };
  allStores[sid] = newStore;
  STORES[sid] = newStore;
  // Save to Firestore config
  try {
    const snap = await getDoc(doc(db, 'config', 'stores'));
    const existing = snap.exists() ? snap.data() : {};
    existing[sid] = newStore;
    await setDoc(doc(db, 'config', 'stores'), existing);
  } catch(e) {}
  // Add to owner switcher bar
  const bar = document.getElementById('ownerBar');
  const btn = document.createElement('button');
  btn.className = 'store-tab-btn';
  btn.textContent = name;
  btn.onclick = () => window.switchViewStore(sid);
  bar.appendChild(btn);
  document.getElementById('newStoreId').value = '';
  document.getElementById('newStoreName').value = '';
  document.getElementById('newStoreCity').value = '';
  populateAdminStoreSelect();
  renderAdminStoreList();
  showToast(`✅ Store "${name}" added!`);
};

window.adminAddUser = async function() {
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const storeId = document.getElementById('newUserStore').value;
  const msgEl = document.getElementById('adminUserMsg');
  msgEl.textContent = '';
  if (!email || !password || !storeId) { msgEl.style.color='#C0392B'; msgEl.textContent = '⚠️ All fields required'; return; }
  if (password.length < 6) { msgEl.style.color='#C0392B'; msgEl.textContent = '⚠️ Password must be at least 6 characters'; return; }
  try {
    msgEl.style.color = '#8B7355';
    msgEl.textContent = '⏳ Creating account...';
    // Create user in Firebase Auth
    await createUserWithEmailAndPassword(auth, email, password);
    // Save manager config to Firestore
    await setDoc(doc(db, 'users', email.replace(/\./g,'_')), { email, store: storeId, role: 'manager' });
    // Add to local USERS map
    USERS[email] = { store: storeId, role: 'manager', name: email.split('@')[0] };
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserStore').value = '';
    msgEl.style.color = '#27AE60';
    msgEl.textContent = `✅ Account created! Share with manager: ${email} / [temp password]`;
    renderAdminStoreList();
    // Sign back in as owner (creating a user signs you in as them)
    showToast('✅ Manager account created!');
  } catch(e) {
    msgEl.style.color = '#C0392B';
    msgEl.textContent = e.code === 'auth/email-already-in-use' ? '⚠️ Email already exists' : e.message;
  }
};



// ══════════════════════════════════════════
// COGS REPORT MODULE
// ══════════════════════════════════════════

let cogsView = 'report';   // 'report' | 'margins'
let cogsPeriod = 'day';    // 'day' | 'week' | 'month'
let cogsOffset = 0;        // 0 = current, -1 = previous, etc.
let salesLedger = [];      // loaded from Firestore
let costLedger  = [];      // loaded from Firestore

window.setCogsView = function(v) {
  cogsView = v;
  document.getElementById('cogsViewReport').classList.toggle('active', v === 'report');
  document.getElementById('cogsViewMargins').classList.toggle('active', v === 'margins');
  document.getElementById('cogsReportView').style.display = v === 'report' ? 'block' : 'none';
  document.getElementById('cogsMarginView').style.display = v === 'margins' ? 'block' : 'none';
  if (v === 'margins' && !cogsLoaded) { cogsLoaded = false; loadCogsData(); }
  if (v === 'report') renderCogsReport();
};

window.setCogsPeriod = function(p) {
  cogsPeriod = p; cogsOffset = 0;
  ['Day','Week','Month'].forEach(x =>
    document.getElementById('cogsPeriod'+x).classList.toggle('active', p === x.toLowerCase()));
  renderCogsReport();
};

window.cogsNavPeriod = function(dir) {
  cogsOffset += dir;
  renderCogsReport();
};

function getPeriodRange() {
  const now = new Date();
  let start, end, label;
  if (cogsPeriod === 'day') {
    start = new Date(now); start.setDate(start.getDate() + cogsOffset);
    start.setHours(0,0,0,0);
    end = new Date(start); end.setHours(23,59,59,999);
    label = cogsOffset === 0 ? 'Today' : start.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  } else if (cogsPeriod === 'week') {
    const day = now.getDay();
    start = new Date(now); start.setDate(now.getDate() - day + (cogsOffset * 7));
    start.setHours(0,0,0,0);
    end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
    label = `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
  } else {
    start = new Date(now.getFullYear(), now.getMonth() + cogsOffset, 1);
    end   = new Date(now.getFullYear(), now.getMonth() + cogsOffset + 1, 0, 23, 59, 59);
    label = start.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  }
  return { start, end, label };
}

let stockSnapshots = [];

async function loadCogsLedgers() {
  try {
    const salesSnap = await getDocs(collection(db, 'stores', viewingStore, 'salesLedger'));
    salesLedger = salesSnap.docs.map(d => d.data());
    const costSnap = await getDocs(collection(db, 'stores', viewingStore, 'costLedger'));
    costLedger = costSnap.docs.map(d => d.data());
    const snapSnap = await getDocs(collection(db, 'stores', viewingStore, 'snapshots'));
    stockSnapshots = snapSnap.docs.map(d => d.data());
  } catch(e) {}
  renderCogsReport();
}

function renderCogsReport() {
  const { start, end, label } = getPeriodRange();
  document.getElementById('cogsPeriodLabel').textContent = label;

  // ── Revenue from Clover sales uploads ──
  const revenue = salesLedger
    .filter(s => s.dateTs >= start.getTime() && s.dateTs <= end.getTime())
    .reduce((sum, s) => sum + (s.revenue || 0), 0);

  // ── METHOD 2: Opening Stock + Purchases - Closing Stock = COGS ──
  const weekKey = getSnapshotWeekKey();
  const openSnap  = stockSnapshots.find(s => s.type === 'open'  && s.weekStart === weekKey);
  const closeSnap = stockSnapshots.find(s => s.type === 'close' && s.weekStart === weekKey);
  const purchases = costLedger
    .filter(c => c.dateTs >= start.getTime() && c.dateTs <= end.getTime())
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  // Show snapshot info
  const snapEl = document.getElementById('snapshotInfo');
  if (openSnap || closeSnap) {
    snapEl.style.display = 'block';
    snapEl.innerHTML = `
      ${openSnap  ? `📸 Opening stock: <strong>$${openSnap.value.toFixed(2)}</strong> recorded on ${openSnap.date}` : '⚠️ No opening stock recorded yet — tap "Record Opening Stock"'}
      ${openSnap && closeSnap ? '<br>' : ''}
      ${closeSnap ? `📸 Closing stock: <strong>$${closeSnap.value.toFixed(2)}</strong> recorded on ${closeSnap.date}` : openSnap ? '<br>⚠️ No closing stock yet — record at end of week' : ''}
    `;
  } else {
    snapEl.style.display = 'block';
    snapEl.innerHTML = `💡 To calculate real COGS: tap <strong>Record Opening Stock</strong> at start of week, then <strong>Record Closing Stock</strong> at end of week.`;
  }

  // Calculate COGS using Method 2 if both snapshots exist
  let cost = 0;
  let method = 'purchases'; // fallback to delivery spend
  if (openSnap && closeSnap) {
    cost = openSnap.value + purchases - closeSnap.value;
    method = 'method2';
    if (cost < 0) cost = 0; // can't be negative
  } else {
    cost = purchases; // fallback: show delivery spend
  }

  const profit = revenue - cost;
  const pct    = revenue > 0 ? (cost / revenue * 100) : 0;

  document.getElementById('cogsRevenue').textContent = '$' + revenue.toFixed(0);
  document.getElementById('cogsCost').textContent    = '$' + cost.toFixed(0);
  document.getElementById('cogsProfit').textContent  = (profit >= 0 ? '$' : '-$') + Math.abs(profit).toFixed(0);
  document.getElementById('cogsProfit').style.color  = profit >= 0 ? 'var(--green-ok)' : 'var(--red-alert)';

  const pctEl = document.getElementById('cogsReportPct');
  const barEl = document.getElementById('cogsReportBar');
  const varEl = document.getElementById('cogsVarianceAlert');

  if (revenue > 0 && cost > 0) {
    pctEl.textContent = pct.toFixed(1) + '%';
    pctEl.style.color = pct < 25 ? 'var(--green-ok)' : pct < 32 ? 'var(--amber-alert)' : 'var(--red-alert)';
    barEl.style.width = Math.min(100, pct * 2) + '%';
    barEl.className   = 'cogs-bar-fill ' + (pct < 25 ? 'margin-bar-good' : pct < 32 ? 'margin-bar-warn' : 'margin-bar-bad');
    if (pct > 32) {
      varEl.style.display = 'block';
      varEl.innerHTML = `⚠️ COGS is ${pct.toFixed(1)}% — above 32% target. ${method === 'method2' ? 'Check wastage or pricing.' : 'Note: based on delivery spend, not actual usage.'}`;
    } else {
      varEl.style.display = 'none';
    }
  } else {
    pctEl.textContent = '—';
    varEl.style.display = 'block';
    varEl.innerHTML = revenue === 0
      ? '💡 Upload a Clover sales report in the Sales tab to see revenue.'
      : '💡 Record opening and closing stock to calculate real COGS.';
  }

  // ── Weekly breakdown ──
  const breakdownEl = document.getElementById('cogsDailyBreakdown');
  if (cogsPeriod === 'day') { breakdownEl.innerHTML = ''; return; }

  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    const ds = new Date(cur); ds.setHours(0,0,0,0);
    const de = new Date(cur); de.setHours(23,59,59,999);
    const dayRev  = salesLedger.filter(s => s.dateTs >= ds.getTime() && s.dateTs <= de.getTime()).reduce((s,x) => s+(x.revenue||0), 0);
    const dayCost = costLedger.filter(c => c.dateTs >= ds.getTime() && c.dateTs <= de.getTime()).reduce((s,x) => s+(x.amount||0), 0);
    if (dayRev > 0 || dayCost > 0) {
      days.push({ label: cur.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), rev: dayRev, cost: dayCost, pct: dayRev > 0 ? dayCost/dayRev*100 : 0 });
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (!days.length) { breakdownEl.innerHTML = '<div class="sync-info" style="margin-top:8px">No daily data yet for this period.</div>'; return; }
  breakdownEl.innerHTML = `<div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--dark)">Daily Breakdown</div>` +
    days.map(d => `<div class="cogs-day-row">
      <div class="cogs-day-date">${d.label}</div>
      <div class="cogs-day-stat"><span style="color:var(--green-ok)">$${d.rev.toFixed(0)}</span>Revenue</div>
      <div class="cogs-day-stat"><span style="color:var(--red-alert)">$${d.cost.toFixed(0)}</span>Purchases</div>
      <div class="cogs-day-stat"><span style="color:${d.pct<25?'var(--green-ok)':d.pct<32?'var(--amber-alert)':'var(--red-alert)'}">${d.pct > 0 ? d.pct.toFixed(1)+'%' : '—'}</span>COGS</div>
    </div>`).join('');
}


// ══════════════════════════════════════════
// STOCK SNAPSHOT MODULE (Method 2 COGS)
// ══════════════════════════════════════════

window.takeStockSnapshot = async function takeStockSnapshot(type) {
  // Calculate current total stock value
  const totalValue = inventory.reduce((sum, item) => {
    return sum + (item.stock * (item.cost || 0));
  }, 0);

  const categoryValues = {};
  inventory.forEach(item => {
    if (!categoryValues[item.cat]) categoryValues[item.cat] = 0;
    categoryValues[item.cat] += item.stock * (item.cost || 0);
  });

  const snapshot = {
    type,           // 'open' or 'close'
    value: totalValue,
    categoryValues,
    date: new Date().toLocaleDateString(),
    dateTs: Date.now(),
    itemCount: inventory.length,
    weekStart: getSnapshotWeekKey()
  };

  try {
    await setDoc(doc(db, 'stores', viewingStore, 'snapshots', `${type}-${snapshot.weekStart}`), snapshot);
    showToast(`✅ ${type === 'open' ? 'Opening' : 'Closing'} stock recorded — $${totalValue.toFixed(2)}`);
    loadCogsLedgers();
  } catch(e) {
    showToast('⚠️ Could not save snapshot');
    console.error(e);
  }
}

function getSnapshotWeekKey() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  const weekStart = new Date(now.setDate(diff));
  return weekStart.toISOString().split('T')[0];
}

