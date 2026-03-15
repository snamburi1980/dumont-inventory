// ══════════════════════════════════════════
// SCHEDULE MODULE
// ══════════════════════════════════════════

// State
let schedView = 'week';        // 'week' | 'day'
let schedOffset = 0;           // weeks or days from today
let schedStaff      = [];  // [{id, name, color, role}]
let schedShifts     = [];  // [{id, staffId, date, shiftTypeId}]
let schedShiftTypes = [];  // [{id, name, start, end, color}]
let schedSwaps      = [];  // [{id, fromStaffId, toStaffId, shiftId, status}]
let schedLoaded     = false;
// schedOffset declared above

const SHIFT_COLORS = ['#C8843A','#7BBFA5','#E8A598','#D4A843','#5B8DD9','#A56CC1','#E57373','#4DB6AC'];

const DEFAULT_SHIFT_TYPES = [
  { id:'st1', name:'Opening', start:'11:00', end:'16:00', color:'#7BBFA5' },
  { id:'st2', name:'Mid',     start:'13:00', end:'18:00', color:'#C8843A' },
  { id:'st3', name:'Closing', start:'17:00', end:'23:00', color:'#5B8DD9' },
  { id:'st4', name:'Full Day',start:'11:00', end:'23:00', color:'#D4A843' },
];

async function loadScheduleData() {
  if (!viewingStore) return;
  try {
    const snap = await getDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'));
    if (snap.exists()) {
      const d        = snap.data();
      schedStaff     = d.staff      || [];
      schedShifts    = d.shifts     || [];
      schedShiftTypes= d.shiftTypes || [...DEFAULT_SHIFT_TYPES];
      schedSwaps     = d.swaps      || [];
    } else {
      schedStaff = []; schedShifts = []; schedShiftTypes = [...DEFAULT_SHIFT_TYPES]; schedSwaps = [];
    }
  } catch(e) { schedShiftTypes = [...DEFAULT_SHIFT_TYPES]; }
  schedLoaded = true;
  renderSchedule();
}

async function saveScheduleData() {
  try {
    await setDoc(doc(db, 'stores', viewingStore, 'schedule', 'data'), {
      staff: schedStaff, shifts: schedShifts,
      shiftTypes: schedShiftTypes, swaps: schedSwaps,
      updatedAt: Date.now()
    });
  } catch(e) { showToast('⚠️ Schedule save failed'); }
}

// ── Time helpers ──
function fmt12(t) {
  if (!t) return '';
  const [h,m] = t.split(':').map(Number);
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}
function shiftHours(st) {
  if (!st?.start || !st?.end) return 0;
  const [sh,sm] = st.start.split(':').map(Number);
  const [eh,em] = st.end.split(':').map(Number);
  return Math.max(0, (eh*60+em - sh*60-sm) / 60);
}
function getWeekStart(offset) {
  const d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - d.getDay() + offset*7);
  return d;
}
function getDateStr(d) { return d.toISOString().split('T')[0]; }
function fmtDate(d)    { return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function fmtDay(d)     { return d.toLocaleDateString('en-US',{weekday:'short'}); }

// ── Main render ──
function renderSchedule() {
  if (!schedLoaded) { loadScheduleData(); return; }
  const isManager = isStoreOwner(currentUserConfig) || isSuperOwner(currentUserConfig);
  const mt = document.getElementById('schedManagerTools');
  if (mt) mt.style.display = isManager ? 'flex' : 'none';
  renderShiftLegend();
  renderWeekGrid();
  renderSwaps();
  renderHoursSummary();
}

function renderShiftLegend() {
  const el = document.getElementById('schedLegend');
  if (!el) return;
  el.innerHTML = schedShiftTypes.map(st => `
    <div class="shift-type-pill" style="background:${st.color}22;color:${st.color};border-color:${st.color}44">
      <span style="width:8px;height:8px;border-radius:50%;background:${st.color};display:inline-block"></span>
      ${st.name} <span style="font-weight:400;opacity:0.8">${fmt12(st.start)}–${fmt12(st.end)}</span>
    </div>`).join('');
}

window.schedNav = function(dir) { schedOffset += dir; renderSchedule(); };

function renderWeekGrid() {
  const ws   = getWeekStart(schedOffset);
  const days = Array.from({length:7},(_,i) => { const d=new Date(ws); d.setDate(ws.getDate()+i); return d; });
  const today = new Date(); today.setHours(0,0,0,0);

  document.getElementById('schedTitle').textContent =
    fmtDate(days[0]) + ' – ' + fmtDate(days[6]);

  const isManager = isStoreOwner(currentUserConfig) || isSuperOwner(currentUserConfig);
  let html = '<colgroup><col style="width:110px">';
  days.forEach(() => html += '<col>');
  html += '<col style="width:50px"></colgroup>';

  // Header row
  html += '<thead><tr><th class="sched-day-header" style="text-align:left;padding-left:10px">Staff</th>';
  days.forEach(d => {
    const isToday = d.getTime() === today.getTime();
    html += `<th class="sched-day-header${isToday?' sched-today':''}" style="${isToday?'color:var(--caramel)':''}">
      <div style="font-size:12px;font-weight:700">${fmtDay(d)}</div>
      <div style="font-size:10px;font-weight:400">${fmtDate(d)}</div>
    </th>`;
  });
  html += '<th class="sched-day-header" style="text-align:right;padding-right:8px">Hrs</th></tr></thead><tbody>';

  if (!schedStaff.length) {
    html += `<tr><td colspan="9" style="text-align:center;padding:40px;color:#8B7355;font-size:13px">
      No staff yet. Tap ⚙️ Shifts to set up shift types, then 👥 Staff to add your team.
    </td></tr>`;
  } else {
    schedStaff.forEach((staff, si) => {
      const rowBg = si%2===0 ? '#fff' : 'var(--cream)';
      html += `<tr style="background:${rowBg}">`;
      // Staff name cell
      html += `<td class="sched-name-cell">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:8px;height:8px;border-radius:50%;background:${staff.color};flex-shrink:0"></div>
          <div>
            <div style="font-size:12px;font-weight:700">${staff.name}</div>
            <div style="font-size:10px;color:#8B7355">${staff.role||''}</div>
          </div>
        </div>
      </td>`;

      // Day cells
      let totalHrs = 0;
      days.forEach(d => {
        const ds        = getDateStr(d);
        const isToday   = d.getTime() === today.getTime();
        const dayShifts = schedShifts.filter(s => s.staffId===staff.id && s.date===ds);
        const st        = dayShifts.length ? schedShiftTypes.find(t=>t.id===dayShifts[0].shiftTypeId) : null;
        if (st) totalHrs += shiftHours(st);

        html += `<td class="sched-day-cell${isToday?' sched-today':''}" onclick="${isManager?`cellClick('${staff.id}','${ds}')`:''}" >`;
        if (st) {
          html += `<div class="sched-shift-bar" style="background:${st.color}22;border:1.5px solid ${st.color};color:${st.color}"
            onclick="event.stopPropagation();${isManager?`removeShift('${dayShifts[0].id}','${staff.id}','${ds}')`:''}"
            title="Click to remove">
            <div>${st.name}</div>
            <div class="sched-shift-time">${fmt12(st.start)}–${fmt12(st.end)}</div>
          </div>`;
        } else if (isManager) {
          html += `<div style="font-size:18px;color:#DDD;line-height:40px;text-align:center">+</div>`;
        }
        html += '</td>';
      });

      // Hours total
      html += `<td class="sched-hours"><strong style="color:var(--caramel)">${totalHrs>0?totalHrs+'h':''}</strong></td>`;
      html += '</tr>';
    });

    // Daily totals row
    html += '<tr style="background:var(--card-bg);border-top:2px solid var(--border)">';
    html += '<td style="padding:6px 10px;font-size:11px;font-weight:700;color:#8B7355">STAFF/DAY</td>';
    days.forEach(d => {
      const ds    = getDateStr(d);
      const count = schedStaff.filter(staff => schedShifts.some(s=>s.staffId===staff.id&&s.date===ds)).length;
      html += `<td style="text-align:center;padding:6px;font-size:12px;font-weight:700;color:${count>0?'var(--caramel)':'#DDD'}">${count>0?count:''}</td>`;
    });
    html += '<td></td></tr>';
  }

  html += '</tbody>';
  document.getElementById('weekGrid').innerHTML = html;

  // Hours summary
  const totalShifts = schedShifts.filter(s => {
    const d = new Date(s.date); d.setHours(0,0,0,0);
    return d >= ws && d <= days[6];
  }).length;
  const el = document.getElementById('schedSummary');
  if (el) el.innerHTML = totalShifts > 0
    ? `<div style="font-size:12px;color:#8B7355;text-align:right">${totalShifts} shift${totalShifts!==1?'s':''} this week</div>`
    : '';
}

// ── Cell click — show shift picker ──
window.cellClick = function(staffId, dateStr) {
  const existing = schedShifts.find(s => s.staffId===staffId && s.date===dateStr);
  if (existing) return; // already has shift - click the bar to remove

  if (!schedShiftTypes.length) { showToast('⚠️ Add shift types first (tap ⚙️ Shifts)'); return; }

  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div class="modal-title">Assign Shift</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div style="font-size:12px;color:#8B7355;margin-bottom:12px">${schedStaff.find(s=>s.id===staffId)?.name} · ${new Date(dateStr+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</div>
    ${schedShiftTypes.map(st => `
      <div onclick="assignShift('${staffId}','${dateStr}','${st.id}')"
        style="display:flex;align-items:center;gap:12px;padding:12px;border:1.5px solid ${st.color}44;border-radius:10px;margin-bottom:8px;cursor:pointer;background:${st.color}11;transition:all 0.15s"
        onmouseover="this.style.background='${st.color}22'" onmouseout="this.style.background='${st.color}11'">
        <div style="width:12px;height:12px;border-radius:50%;background:${st.color};flex-shrink:0"></div>
        <div>
          <div style="font-size:14px;font-weight:700;color:${st.color}">${st.name}</div>
          <div style="font-size:12px;color:#8B7355">${fmt12(st.start)} – ${fmt12(st.end)} · ${shiftHours(st)}h</div>
        </div>
      </div>`).join('')}
  `);
};

window.assignShift = async function(staffId, dateStr, shiftTypeId) {
  closeModal();
  const id = 'sh_' + Date.now();
  schedShifts.push({ id, staffId, date: dateStr, shiftTypeId });
  renderSchedule();
  await saveScheduleData();
  logAudit('shift_assigned', { staffId, date: dateStr, shiftTypeId });
};

window.removeShift = async function(shiftId, staffId, dateStr) {
  if (!confirm('Remove this shift?')) return;
  schedShifts = schedShifts.filter(s => s.id !== shiftId);
  renderSchedule();
  await saveScheduleData();
};

// ── Copy last week ──
window.copyLastWeek = async function() {
  const ws       = getWeekStart(schedOffset);
  const lastWs   = getWeekStart(schedOffset - 1);
  const days     = Array.from({length:7},(_,i)=>{ const d=new Date(ws); d.setDate(ws.getDate()+i); return d; });
  const lastDays = Array.from({length:7},(_,i)=>{ const d=new Date(lastWs); d.setDate(lastWs.getDate()+i); return d; });

  const thisWeekDates = days.map(getDateStr);
  const lastWeekDates = lastDays.map(getDateStr);

  // Remove this week's existing shifts
  schedShifts = schedShifts.filter(s => !thisWeekDates.includes(s.date));

  // Copy last week's shifts to this week
  let copied = 0;
  lastWeekDates.forEach((lastDate, i) => {
    const thisDate    = thisWeekDates[i];
    const dayShifts   = schedShifts.filter(s => s.date === lastDate); // already removed this week
    // Actually get from original
    const orig = schedShifts; // we need to get from saved data
    copied += dayShifts.length;
  });

  // Simpler approach: copy by day-of-week
  const lastWeekShifts = schedShifts.filter(s => lastWeekDates.includes(s.date));
  lastWeekShifts.forEach(s => {
    const dayIdx   = lastWeekDates.indexOf(s.date);
    const newDate  = thisWeekDates[dayIdx];
    if (newDate && !schedShifts.find(x => x.staffId===s.staffId && x.date===newDate)) {
      schedShifts.push({ id:'sh_'+Date.now()+'_'+Math.random(), staffId:s.staffId, date:newDate, shiftTypeId:s.shiftTypeId });
      copied++;
    }
  });

  renderSchedule();
  await saveScheduleData();
  showToast(`✅ Copied ${copied} shifts from last week`);
};

// ── Manage shift types ──
window.openManageShiftTypes = function() {
  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div class="modal-title">⚙️ Shift Types</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div style="font-size:12px;color:#8B7355;margin-bottom:12px">Define your store's shift times. These show in the schedule grid.</div>

    ${schedShiftTypes.map((st,i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--cream);border-radius:10px;margin-bottom:8px;border-left:4px solid ${st.color}">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:${st.color}">${st.name}</div>
          <div style="font-size:11px;color:#8B7355">${fmt12(st.start)} – ${fmt12(st.end)} · ${shiftHours(st)}h</div>
        </div>
        <button onclick="deleteShiftType('${st.id}')" style="background:none;border:none;color:#C0392B;cursor:pointer;font-size:16px">×</button>
      </div>`).join('')}

    <div style="margin-top:16px;font-size:13px;font-weight:600;color:var(--dark);margin-bottom:8px">Add New Shift Type</div>
    <input class="modal-input" id="newStName" placeholder="Shift name (e.g. Opening)">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div>
        <div class="modal-label">Start Time</div>
        <input class="modal-input" type="time" id="newStStart" value="11:00" style="margin-bottom:0">
      </div>
      <div>
        <div class="modal-label">End Time</div>
        <input class="modal-input" type="time" id="newStEnd" value="17:00" style="margin-bottom:0">
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap" id="stColorPicker">
      ${SHIFT_COLORS.map(c=>`<div onclick="selectStColor('${c}')" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid transparent" id="stc-${c.replace('#','')}"></div>`).join('')}
    </div>
    <button class="modal-btn" onclick="addShiftType()">+ Add Shift Type</button>
  `);
  // Pre-select first color
  selectedStColor = SHIFT_COLORS[0];
  const el = document.getElementById('stc-' + SHIFT_COLORS[0].replace('#',''));
  if (el) el.style.borderColor = 'var(--dark)';
};

let selectedStColor = SHIFT_COLORS[0];
window.selectStColor = function(c) {
  selectedStColor = c;
  SHIFT_COLORS.forEach(col => {
    const el = document.getElementById('stc-' + col.replace('#',''));
    if (el) el.style.borderColor = col===c ? 'var(--dark)' : 'transparent';
  });
};

window.addShiftType = async function() {
  const name  = document.getElementById('newStName').value.trim();
  const start = document.getElementById('newStStart').value;
  const end   = document.getElementById('newStEnd').value;
  if (!name)  { showToast('⚠️ Enter shift name'); return; }
  if (!start || !end) { showToast('⚠️ Set start and end times'); return; }
  schedShiftTypes.push({ id:'st_'+Date.now(), name, start, end, color: selectedStColor });
  await saveScheduleData();
  closeModal();
  renderSchedule();
  showToast(`✅ "${name}" shift added`);
};

window.deleteShiftType = async function(id) {
  if (schedShifts.some(s=>s.shiftTypeId===id)) {
    showToast('⚠️ Cannot delete — shift type is in use'); return;
  }
  schedShiftTypes = schedShiftTypes.filter(s=>s.id!==id);
  await saveScheduleData();
  closeModal();
  renderSchedule();
};

// ── Manage staff (keep existing openAddStaff) ──
window.openAddStaff = function() {
  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div class="modal-title">👥 Manage Staff</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    ${schedStaff.map((s,i)=>`
      <div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--cream);border-radius:8px;margin-bottom:6px">
        <div style="width:10px;height:10px;border-radius:50%;background:${s.color}"></div>
        <span style="flex:1;font-size:13px"><strong>${s.name}</strong> <span style="color:#8B7355">${s.role||''}</span></span>
        <button onclick="removeStaff('${s.id}')" style="background:none;border:none;color:#C0392B;cursor:pointer;font-size:16px">×</button>
      </div>`).join('')}
    <div style="margin-top:12px;font-size:13px;font-weight:600;color:var(--dark);margin-bottom:8px">Add Staff Member</div>
    <input class="modal-input" id="newStaffName" placeholder="Name">
    <input class="modal-input" id="newStaffRole" placeholder="Role (e.g. Barista, Cashier)">
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" id="staffColorPicker">
      ${SHIFT_COLORS.map(c=>`<div onclick="selectStaffColor('${c}')" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid transparent" id="sfc-${c.replace('#','')}"></div>`).join('')}
    </div>
    <button class="modal-btn" onclick="addStaffMember()">+ Add</button>
  `);
  selectedStaffColor = SHIFT_COLORS[schedStaff.length % SHIFT_COLORS.length];
  const el = document.getElementById('sfc-' + selectedStaffColor.replace('#',''));
  if (el) el.style.borderColor = 'var(--dark)';
};

let selectedStaffColor = SHIFT_COLORS[0];
window.selectStaffColor = function(c) {
  selectedStaffColor = c;
  SHIFT_COLORS.forEach(col => {
    const el = document.getElementById('sfc-' + col.replace('#',''));
    if (el) el.style.borderColor = col===c ? 'var(--dark)' : 'transparent';
  });
};

window.addStaffMember = async function() {
  const name = document.getElementById('newStaffName').value.trim();
  const role = document.getElementById('newStaffRole').value.trim();
  if (!name) { showToast('⚠️ Enter name'); return; }
  schedStaff.push({ id:'staff_'+Date.now(), name, role, color: selectedStaffColor });
  await saveScheduleData();
  closeModal();
  renderSchedule();
};

window.removeStaff = async function(id) {
  schedStaff  = schedStaff.filter(s=>s.id!==id);
  schedShifts = schedShifts.filter(s=>s.staffId!==id);
  await saveScheduleData();
  closeModal();
  renderSchedule();
};

// ── Publish ──
window.publishSchedule = async function() {
  showToast('✅ Schedule published!');
  logAudit('schedule_published', { week: getDateStr(getWeekStart(schedOffset)) });
};

// ── Swap requests (simplified) ──
function renderSwaps() {
  const pending = schedSwaps.filter(s=>s.status==='pending');
  const el = document.getElementById('swapSection');
  const list = document.getElementById('swapList');
  if (!el || !list) return;
  el.style.display = pending.length ? 'block' : 'none';
  if (!pending.length) return;
  const isManager = isStoreOwner(currentUserConfig) || isSuperOwner(currentUserConfig);
  list.innerHTML = pending.map(sw => {
    const from = schedStaff.find(s=>s.id===sw.fromStaffId);
    const to   = schedStaff.find(s=>s.id===sw.toStaffId);
    return `<div class="swap-card">
      <div style="font-size:13px">${from?.name||'?'} wants to swap with ${to?.name||'?'}</div>
      ${isManager ? `<div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-log" style="width:auto;padding:5px 14px;font-size:12px;background:var(--green-ok)" onclick="handleSwap('${sw.id}','approved')">✅ Approve</button>
        <button class="btn-log" style="width:auto;padding:5px 14px;font-size:12px;background:#C0392B" onclick="handleSwap('${sw.id}','declined')">✕ Decline</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

window.handleSwap = async function(swapId, status) {
  const swap = schedSwaps.find(s=>s.id===swapId);
  if (!swap) return;
  if (status === 'approved') {
    const shift = schedShifts.find(s=>s.id===swap.shiftId);
    if (shift) shift.staffId = swap.toStaffId;
  }
  swap.status = status;
  await saveScheduleData();
  renderSchedule();
  showToast(status==='approved'?'✅ Swap approved!':'Swap declined');
};

// Keep openAddShift for backward compat
window.openAddShift = window.openManageShiftTypes;

// ── Export schedule image (uses existing exportScheduleImage fn) ──



// ══════════════════════════════════════════
// HOURS SUMMARY MODULE
// ══════════════════════════════════════════

let hrsPeriod = 'week';

window.setHrsPeriod = function(p) {
  hrsPeriod = p;
  document.getElementById('hrsWeekBtn').classList.toggle('active', p==='week');
  document.getElementById('hrsMonthBtn').classList.toggle('active', p==='month');
  renderHoursSummary();
};

function renderHoursSummary() {
  const el    = document.getElementById('schedHoursReport');
  const table = document.getElementById('schedHoursTable');
  const totEl = document.getElementById('schedHoursTotals');
  if (!el || !table) return;

  if (!schedStaff.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';

  // Get date range
  let startDate, endDate;
  const now = new Date();

  if (hrsPeriod === 'week') {
    startDate = getWeekStart(schedOffset);
    endDate   = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
  } else {
    // Full month containing current week
    const ws = getWeekStart(schedOffset);
    startDate = new Date(ws.getFullYear(), ws.getMonth(), 1);
    endDate   = new Date(ws.getFullYear(), ws.getMonth() + 1, 0);
  }

  // Build list of dates in range
  const dates = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    dates.push(getDateStr(new Date(cur)));
    cur.setDate(cur.getDate() + 1);
  }

  // Calculate hours per staff member
  const staffHours = schedStaff.map(staff => {
    const shifts = schedShifts.filter(s =>
      s.staffId === staff.id && dates.includes(s.date)
    );
    const totalHrs = shifts.reduce((sum, s) => {
      const st = schedShiftTypes.find(t => t.id === s.shiftTypeId);
      return sum + (st ? shiftHours(st) : 0);
    }, 0);
    const shiftCount = shifts.length;

    // Weekly breakdown for month view
    const weeklyHrs = {};
    if (hrsPeriod === 'month') {
      shifts.forEach(s => {
        const d    = new Date(s.date + 'T12:00:00');
        const wk   = getWeekStart(0);
        wk.setDate(wk.getDate() - wk.getDay());
        // Get week label
        const wkStart = new Date(d);
        wkStart.setDate(d.getDate() - d.getDay());
        const wkLabel = fmtDate(wkStart);
        if (!weeklyHrs[wkLabel]) weeklyHrs[wkLabel] = 0;
        const st = schedShiftTypes.find(t => t.id === s.shiftTypeId);
        if (st) weeklyHrs[wkLabel] += shiftHours(st);
      });
    }

    return { staff, totalHrs, shiftCount, weeklyHrs };
  }).sort((a, b) => b.totalHrs - a.totalHrs);

  const totalAllHrs   = staffHours.reduce((s, r) => s + r.totalHrs, 0);
  const totalAllShifts= staffHours.reduce((s, r) => s + r.shiftCount, 0);
  const avgHrs        = staffHours.length > 0 ? totalAllHrs / staffHours.length : 0;

  // Render table
  const periodLabel = hrsPeriod === 'week'
    ? `Week of ${fmtDate(startDate)}`
    : startDate.toLocaleDateString('en-US', {month:'long', year:'numeric'});

  table.innerHTML = `
    <div style="font-size:11px;color:#8B7355;margin-bottom:8px">${periodLabel}</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--dark)">
          <th style="padding:8px 10px;text-align:left;color:#D4A843;font-weight:600">Staff</th>
          <th style="padding:8px 10px;text-align:center;color:#D4A843;font-weight:600">Shifts</th>
          <th style="padding:8px 10px;text-align:right;color:#D4A843;font-weight:600">Hours</th>
          <th style="padding:8px 10px;text-align:right;color:#D4A843;font-weight:600">% of Total</th>
        </tr>
      </thead>
      <tbody>
        ${staffHours.map((r, i) => {
          const pct     = totalAllHrs > 0 ? (r.totalHrs / totalAllHrs * 100) : 0;
          const barWidth= Math.round(pct);
          return `<tr style="background:${i%2===0?'#fff':'var(--cream)'}">
            <td style="padding:8px 10px;border-bottom:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:6px">
                <div style="width:8px;height:8px;border-radius:50%;background:${r.staff.color}"></div>
                <span style="font-weight:600">${r.staff.name}</span>
                <span style="font-size:11px;color:#8B7355">${r.staff.role||''}</span>
              </div>
              <div style="margin-top:4px;background:#EDE0CC;border-radius:4px;height:4px;width:100%">
                <div style="background:${r.staff.color};height:4px;border-radius:4px;width:${barWidth}%"></div>
              </div>
            </td>
            <td style="padding:8px 10px;text-align:center;border-bottom:1px solid var(--border);color:#8B7355">${r.shiftCount}</td>
            <td style="padding:8px 10px;text-align:right;border-bottom:1px solid var(--border);font-weight:700;color:var(--caramel)">${r.totalHrs}h</td>
            <td style="padding:8px 10px;text-align:right;border-bottom:1px solid var(--border);color:#8B7355">${pct.toFixed(0)}%</td>
          </tr>`;
        }).join('')}
        <tr style="background:var(--card-bg);border-top:2px solid var(--border)">
          <td style="padding:8px 10px;font-weight:700;color:var(--dark)">Total</td>
          <td style="padding:8px 10px;text-align:center;font-weight:700;color:var(--dark)">${totalAllShifts}</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--caramel);font-size:16px">${totalAllHrs}h</td>
          <td style="padding:8px 10px;text-align:right;font-size:11px;color:#8B7355">avg ${avgHrs.toFixed(1)}h</td>
        </tr>
      </tbody>
    </table>`;

  // Totals card
  totEl.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <div class="stat-card" style="padding:12px">
        <div style="font-size:20px;font-weight:700;color:var(--caramel)">${totalAllHrs}h</div>
        <div style="font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:0.5px">Total Hours</div>
      </div>
      <div class="stat-card" style="padding:12px">
        <div style="font-size:20px;font-weight:700;color:var(--dark)">${totalAllShifts}</div>
        <div style="font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:0.5px">Total Shifts</div>
      </div>
      <div class="stat-card" style="padding:12px">
        <div style="font-size:20px;font-weight:700;color:var(--green-ok)">${avgHrs.toFixed(1)}h</div>
        <div style="font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:0.5px">Avg Per Staff</div>
      </div>
    </div>`;
}
// ── Admin: Add Region ──
window.addRegion = async function() {
  const name  = document.getElementById('newRegionName')?.value.trim();
  const orgId = document.getElementById('newRegionOrg')?.value || 'dumont';
  const email = document.getElementById('newRegionOwnerEmail')?.value.trim().toLowerCase();
  if (!name) { showToast('⚠️ Enter region name'); return; }
  const regionId = name.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').slice(0,20);
  try {
    await setDoc(doc(db,'regions',regionId), { id:regionId, name, orgId, createdAt:Date.now() });
    if (typeof REGIONS !== 'undefined') REGIONS[regionId] = { id:regionId, name, orgId };
    if (typeof liveRegions !== 'undefined') liveRegions[regionId] = { id:regionId, name, orgId };
    if (email) {
      const ek = email.replace(/\./g,'_').replace(/@/g,'_at_');
      await setDoc(doc(db,'users',ek), { role:'regional_owner', orgId, regionId, status:'approved', updatedAt:Date.now() }, { merge:true });
    }
    showToast('✅ Region "' + name + '" created!');
    document.getElementById('newRegionName').value = '';
    document.getElementById('newRegionOwnerEmail').value = '';
    if (typeof renderOrgTree === 'function') renderOrgTree();
    if (typeof updateAdminDropdowns === 'function') updateAdminDropdowns();
  } catch(e) { showToast('⚠️ ' + e.message); }
};

// ── Admin: Add Store + Manager ──
window.adminAddStoreAndManager = async function() {
  const regionId = document.getElementById('newStoreRegion')?.value || 'texas';
  const name     = document.getElementById('newStoreName')?.value.trim();
  const city     = document.getElementById('newStoreCity')?.value.trim();
  const email    = document.getElementById('newUserEmail')?.value.trim().toLowerCase();
  const password = document.getElementById('newUserPassword')?.value;
  if (!name)     { showToast('⚠️ Enter store name'); return; }
  if (!email)    { showToast('⚠️ Enter manager email'); return; }
  if (!password) { showToast('⚠️ Enter temp password'); return; }
  const sid = name.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').slice(0,25);
  try {
    const newStore = { name, city, regionId };
    if (typeof allStores !== 'undefined') allStores[sid] = newStore;
    if (typeof STORES !== 'undefined')    STORES[sid]    = newStore;
    if (typeof STORE_REGIONS !== 'undefined') STORE_REGIONS[sid] = regionId;
    const snap = await getDoc(doc(db,'config','stores'));
    const existing = snap.exists() ? snap.data() : {};
    existing[sid] = newStore;
    await setDoc(doc(db,'config','stores'), existing);
    const ek = email.replace(/\./g,'_').replace(/@/g,'_at_');
    await setDoc(doc(db,'users',ek), {
      email, store:sid, role:'store_owner', orgId:'dumont', regionId,
      status:'invited', storeName:name, createdAt:Date.now()
    });
    document.getElementById('newStoreName').value  = '';
    document.getElementById('newStoreCity').value  = '';
    document.getElementById('newUserEmail').value  = '';
    document.getElementById('newUserPassword').value = '';
    if (typeof renderAdminStoreList === 'function') renderAdminStoreList();
    if (typeof renderOrgTree === 'function') renderOrgTree();
    showToast('✅ Store "' + name + '" + manager added!');
  } catch(e) { showToast('⚠️ ' + e.message); }
};

// ── Admin: Assign Regional Owner ──
window.assignRegionalOwner = async function() {
  const email    = document.getElementById('assignEmail')?.value.trim().toLowerCase();
  const regionId = document.getElementById('assignRegion')?.value;
  if (!email || !regionId) { showToast('⚠️ Enter email and region'); return; }
  const ek = email.replace(/\./g,'_').replace(/@/g,'_at_');
  try {
    await setDoc(doc(db,'users',ek), {
      role:'regional_owner', orgId:'dumont', regionId,
      status:'approved', updatedAt:Date.now()
    }, { merge:true });
    showToast('✅ ' + email + ' assigned as Regional Owner');
    document.getElementById('assignEmail').value = '';
  } catch(e) { showToast('⚠️ ' + e.message); }
};


window.setRegPeriod = function(p) {
  if (typeof regPeriod !== 'undefined') regPeriod = p;
  document.getElementById('regPeriodWeek')?.classList.toggle('active', p==='week');
  document.getElementById('regPeriodMonth')?.classList.toggle('active', p==='month');
  if (typeof loadRegionalData === 'function') loadRegionalData();
};




// ══════════════════════════════════════════
// SCHEDULE EXPORT MODULE
// ══════════════════════════════════════════

window.exportScheduleImage = async function() {
  // Load html2canvas if not loaded
  if (!window.html2canvas) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // Make sure we're in weekly view
  setSchedView('week');
  await new Promise(r => setTimeout(r, 300));

  // Build a clean standalone schedule table for export
  const { weekDates, weekLabels } = getExportWeekDates();
  const storeName = STORES[viewingStore]?.name || viewingStore;

  // Create export container
  const exportDiv = document.createElement('div');
  exportDiv.style.cssText = `
    position:fixed; left:-9999px; top:0;
    background:#FDF6EC; padding:24px; font-family:Arial,sans-serif;
    width:900px; border-radius:12px;
  `;

  // Header
  const weekStart = weekDates[0];
  const weekEnd   = weekDates[6];
  const headerLabel = `${weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${weekEnd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;

  exportDiv.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <div style="font-size:22px;font-weight:900;color:#3D2B1F;font-family:serif">Dumont</div>
        <div style="font-size:13px;color:#8B7355;text-transform:uppercase;letter-spacing:1px">${storeName} — Staff Schedule</div>
      </div>
      <div style="font-size:14px;font-weight:700;color:#C8843A;background:#FFF8EE;padding:8px 16px;border-radius:20px;border:1px solid #E8D5B0">
        📅 ${headerLabel}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#3D2B1F">
          <th style="padding:10px 12px;text-align:left;color:#D4A843;font-weight:700;width:140px">Staff</th>
          ${weekDates.map((d,i) => {
            const isToday = d.toDateString() === new Date().toDateString();
            return `<th style="padding:10px 8px;text-align:center;color:${isToday?'#FFD700':'#D4A843'};font-weight:700;background:${isToday?'rgba(200,132,58,0.3)':'transparent'}">
              <div>${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}</div>
              <div style="font-size:11px;opacity:0.8">${d.getDate()}</div>
            </th>`;
          }).join('')}
        </tr>
      </thead>
      <tbody>
        ${schedStaff.length === 0
          ? `<tr><td colspan="8" style="padding:32px;text-align:center;color:#8B7355">No staff added yet</td></tr>`
          : schedStaff.map((staff, si) => {
              const rowBg = si % 2 === 0 ? '#FFFFFF' : '#FDF6EC';
              return `<tr style="background:${rowBg}">
                <td style="padding:10px 12px;border-right:2px solid #E8D5B0">
                  <div style="display:flex;align-items:center;gap:6px">
                    <div style="width:10px;height:10px;border-radius:50%;background:${staff.color};flex-shrink:0"></div>
                    <div>
                      <div style="font-weight:700;color:#1A1209;font-size:12px">${staff.name}</div>
                      <div style="font-size:10px;color:#8B7355">${staff.role||''}</div>
                    </div>
                  </div>
                </td>
                ${weekDates.map(d => {
                  const ds = d.toISOString().split('T')[0];
                  const isToday = d.toDateString() === new Date().toDateString();
                  const dayShifts = schedShifts.filter(s => s.staffId === staff.id && s.date === ds);
                  const cellBg = isToday ? 'rgba(200,132,58,0.06)' : 'transparent';
                  return `<td style="padding:6px;text-align:center;border:1px solid #EDE0CC;background:${cellBg};min-width:100px;vertical-align:top">
                    ${dayShifts.length === 0
                      ? '<div style="color:#DDD;font-size:18px;line-height:32px">—</div>'
                      : dayShifts.map(shift => {
                          const st = schedShiftTypes.find(t => t.id === shift.shiftTypeId) || {name:shift.shiftTypeId, color:'#999', start:'', end:''};
                          return `<div style="background:${st.color}22;border:1px solid ${st.color}55;border-radius:6px;padding:4px 6px;margin-bottom:3px">
                            <div style="font-weight:700;color:${st.color};font-size:11px">${st.name}</div>
                            <div style="font-size:10px;color:#8B7355">${fmt12(st.start)}–${fmt12(st.end)}</div>
                          </div>`;
                        }).join('')
                    }
                  </td>`;
                }).join('')}
              </tr>`;
            }).join('')
        }
      </tbody>
    </table>
    <div style="margin-top:16px;display:flex;justify-content:space-between;font-size:11px;color:#8B7355">
      <span>Generated by Dumont Inventory App · ${new Date().toLocaleString()}</span>
      <span>${schedStaff.length} staff · ${schedShifts.filter(s => {
        const wd = weekDates.map(d => d.toISOString().split('T')[0]);
        return wd.includes(s.date);
      }).length} shifts this week</span>
    </div>
  `;

  document.body.appendChild(exportDiv);

  try {
    const canvas = await html2canvas(exportDiv, {
      scale: 2,
      backgroundColor: '#FDF6EC',
      logging: false,
      useCORS: true
    });

    document.body.removeChild(exportDiv);

    // Convert to blob and download
    canvas.toBlob(blob => {
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = `Dumont_${storeName}_Schedule_${headerLabel.replace(/[^a-z0-9]/gi,'_')}.png`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('✅ Schedule image downloaded — share on WhatsApp!');
    }, 'image/png');

  } catch(e) {
    document.body.removeChild(exportDiv);
    showToast('⚠️ Could not export. Try again.');
    console.error(e);
  }
};

function getExportWeekDates() {
  const now  = new Date();
  const day  = now.getDay();
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - day + i);
    d.setHours(0,0,0,0);
    weekDates.push(d);
  }
  return { weekDates, weekLabels: weekDates.map(d => d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})) };
}

