# Dumont Inventory App — Claude Code Context

## What This Is
A custom SaaS inventory management app for **Dumont Creamery & Café** franchise stores in Texas.
Built by Sasikanth Namburi (owner) with Claude AI assistance.
This file gives Claude Code full context to continue development without repeating history.

---

## Owner & Contact
- **Owner:** Sasikanth Namburi
- **Email:** dumonttexas@gmail.com
- **Notification email:** txccpointwest@gmail.com (EmailJS recipient)

---

## Live URLs
- **Production:** https://snamburi1980.github.io/dumont-inventory/
- **Repo:** https://github.com/snamburi1980/dumont-inventory
- **Branch:** `main` = production (GitHub Actions auto-deploys)

---

## Local Dev
- **Machine:** MacBook Air
- **IDE:** VS Code
- **Dev server:** `npm run dev` → http://localhost:5173/dumont-inventory/
- **Deploy:** `npm run build && git add . && git commit -m "message" && git push origin main`

---

## Tech Stack
- **Frontend:** React + Vite
- **Backend:** Firebase/Firestore (no separate server)
- **PDF parsing:** pdfjs-dist (legacy build)
- **Error monitoring:** Sentry
- **Notifications:** EmailJS
- **Deployment:** GitHub Pages via GitHub Actions
- **PWA:** vite-plugin-pwa (installable on iPhone, Android, Mac)

---

## Firebase Config
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBofsUP3yf2OkaQVPav8rfxUiax39TkxYY",
  authDomain: "dumont-inventory.firebaseapp.com",
  projectId: "dumont-inventory",
  storageBucket: "dumont-inventory.firebasestorage.app",
  messagingSenderId: "208739741985",
  appId: "1:208739741985:web:85493fbe669b0e43b78e60"
}
```

---

## Third Party Keys
- **Sentry DSN:** https://4ec55a8eb23a22f5ee08daccd6e24018@o4511152029827072.ingest.us.sentry.io/4511152039395328
- **EmailJS:** service_hrmh6gj / template_qz6w4dk / public key: J6H5AoKpjqurMWiVd

---

## Current Stores
| Store | Status | Manager Email | Region ID |
|-------|--------|--------------|-----------|
| Coppell | Active | txccpointwest@gmail.com | bD3rtsbLlwqD0nzpbkXU |
| Aubrey | Active | — | bD3rtsbLlwqD0nzpbkXU |

Both under **Dumont Creamery & Cafe** org, Texas region.

---

## File Structure
```
src/
├── App.jsx                    — tab routing, auth gate, role logic
├── main.jsx
├── firebase/config.js
├── styles/global.css
├── data/
│   ├── inventory.js           — DEFAULT_INVENTORY fallback (54 ice cream items — DO NOT use as stock source)
│   └── recipes.js
├── hooks/
│   ├── useAuth.js             — Firebase auth + userConfig from Firestore
│   ├── useInventory.js        — loadInventory(storeId, orgId), saveInventory, adjustStock, setStock etc
│   ├── useOrgItems.js         — org-level item master
│   └── useToast.js
├── components/
│   ├── Layout.jsx             — sidebar (desktop) + mobile tab bar + role-based access
│   ├── Home.jsx               — dashboard, announcements, stock alerts
│   ├── Inventory.jsx          — table layout, lock/unlock, category summary
│   ├── Picks.jsx              — Ice Cream Log: 2-col grid, counter style, monthly usage report
│   ├── Checklist.jsx          — opening/closing, photo compression (3-stage), retry on submit
│   ├── Schedule.jsx           — responsive: week grid desktop, week/day toggle mobile
│   ├── Transfers.jsx          — inter-store transfer log, table form, edit/delete/CSV export
│   ├── CashRegister.jsx       — daily cash log, table form, monthly summary
│   ├── Admin.jsx              — cascade delete, manager limited view
│   ├── Orders.jsx             — (disabled — Commerce section)
│   ├── Sales.jsx              — (disabled — Commerce section)
│   ├── Delivery.jsx           — (disabled — Commerce section)
│   ├── COGS.jsx               — (disabled — Insights section)
│   ├── ErrorBoundary.jsx
│   ├── LoginScreen.jsx
│   ├── TipBanner.jsx          — floats right desktop, top mobile
│   ├── ThemeSwitcher.jsx
│   ├── ChangePassword.jsx
│   ├── ItemManager.jsx
│   ├── OrgSetup.jsx
│   ├── OrgSettings.jsx
│   ├── Pricing.jsx
│   └── SOPManager.jsx
└── utils/
    ├── auditLogger.js
    ├── exportInventory.js
    ├── themes.js
    ├── emailNotify.js
    └── stockAlert.js
```

---

## Tab Structure (App.jsx)
```javascript
const tabs = [
  { id:'home',         label:'Home'          },
  { id:'inventory',    label:'Inventory'     },
  { id:'icecreamlog',  label:'Ice Cream Log' },  // renders Picks component
  { id:'checklist',    label:'Checklist'     },
  { id:'schedule',     label:'Schedule'      },
  { id:'transfers',    label:'Transfers'     },
  { id:'cashregister', label:'Cash Register' },
  { id:'sales',        label:'Sales'         },  // disabled - Commerce
  { id:'orders',       label:'Orders'        },  // disabled - Commerce
  { id:'delivery',     label:'Delivery'      },  // disabled - Commerce
  { id:'cogs',         label:'COGS'          },  // disabled - Insights
  { id:'admin',        label:'Admin'         },
]
```

---

## Sidebar Groups (Layout.jsx)
```javascript
const tabGroups = [
  { label: 'Operations', ids: ['home','inventory','icecreamlog','checklist','schedule','transfers','cashregister'], disabled: false },
  { label: 'Commerce',   ids: ['sales','orders','delivery'], disabled: true },   // greyed out, Soon badge
  { label: 'Insights',   ids: ['cogs'],                      disabled: true },   // greyed out, Soon badge
  { label: 'Admin',      ids: ['admin'],                     disabled: false },
]
```

---

## Role Hierarchy & Access Control
Roles stored in Firestore `users` collection.

**User management is super_owner ONLY** (as of Aug 2026):
- Only super_owner can invite/edit/deactivate/delete users. Store owners and managers see a "contact HQ (dumonttexas@gmail.com)" note in Admin → Users instead of an invite form.
- Firestore rules enforce this server-side: user docs can only be created by super_owner or by an invitee holding a valid pending invitation token (role/store come from the invitation doc, not URL params). Users can only update `forcePasswordChange`/`name` on their own doc.
- Cloud Function `clearStoreData({ storeId, deleteUsers })` (super_owner only): recursively wipes a store's doc + all subcollections + its invitations, and optionally its users (Firestore docs + Auth accounts). Wired to Admin store/region/org Delete buttons.
- Deploy backend changes with `firebase deploy --only firestore:rules` / `--only functions` (firebase.json is configured).

| Role | Access |
|------|--------|
| `super_owner` | Everything (dumonttexas@gmail.com hardcoded) |
| `regional_owner` | All stores in their region |
| `store_owner` | Their store only, all tabs |
| `manager` | Their store: Home, Inventory, Ice Cream Log, Checklist, Schedule, Transfers, Cash Register, Admin |
| `staff` | Their store: Home, Inventory, Ice Cream Log, Checklist only |

**To add a user manually in Firestore:**
Collection: `users`
Document ID: email with `.` → `_` and `@` → `_at_`
Example: `txccpointwest_at_gmail_com`
Fields:
```
name: "Staff Name"
role: "staff" | "manager" | "store_owner" | "regional_owner"
storeId: "firestore-store-document-id"
orgId: "dumont"
active: true
```

---

## Firestore Collections
```
orgs/{orgId}/items/{itemId}          — item master (name, category, cost, par, uom)
stores/{storeId}/inventory/stock     — stock levels per store
stores/{storeId}/deliveries/{id}
stores/{storeId}/salesLedger/{id}
stores/{storeId}/schedule/data       — single doc: { members, presets, shifts:{offset: {...}} }
stores/{storeId}/checklists/{id}     — opening/closing checklist submissions
stores/{storeId}/issues/{id}
stores/{storeId}/stockLog/{id}       — Ice Cream Log picks (monthKey, itemName, delta, etc)
stores/{storeId}/cashRegister/{id}   — daily cash entries
announcements/{id}
users/{emailKey}                     — user config + role
regions/{id}
transfers/{id}                       — global inter-store transfers
auditLog/{id}
```

### Required Firestore Rules (add in Firebase Console)
```
match /stores/{storeId}/cashRegister/{id} { allow read, write: if isAuth(); }
match /transfers/{id} { allow read, write: if isAuth(); }
match /stores/{storeId}/stockLog/{id} { allow read, write: if isAuth(); }
```

---

## Key Component Details

### Inventory (Inventory.jsx)
- Table layout (not card grid) — Item | Stock | PAR | Status | +/−
- Lock/unlock with 5-min auto-lock
- Save status indicator: Saving... → ✓ Saved → clears
- Category pills with value per category
- Tap stock number to edit inline, tap PAR to edit inline
- Status dots: green OK, orange Low, red Critical

### Ice Cream Log (Picks.jsx)
- Reads from `inventory` prop (filtered to `cat === 'Ice Cream'`)
- MUST call `invHook.loadInventory(viewingStore, viewingOrg)` on mount — otherwise shows DEFAULT_INVENTORY (54 items) not actual stock
- 2-column grid, counter style: `[flavor name]  [count]  [+][−]`
- + adds back (max = original stock), − picks one (min = 0)
- Save writes to `stockLog` collection and updates inventory
- Monthly usage report with Clear button (deletes stockLog docs)
- **Known issue:** stock total must match Inventory tab — always pass `viewingOrg` prop

### Checklist (Checklist.jsx)
- 30 opening items, 22 closing items
- Photo compression: 3-stage aggressive (400px max, 0.5 quality, then 0.3, then 60% dimensions)
- Max ~80KB per photo — Firestore 1MB doc limit
- Submit retries 3 times on failure with 1.5s delay
- History: last 30 days, tap to expand

### Schedule (Schedule.jsx)
- Desktop: full week grid table
- Mobile: Week View (mini scrollable grid) / Day View (day-by-day list) toggle
- `loadSchedule()` clears shifts first — prevents stale data on week navigation
- `save()` preserves ALL weeks, only updates current offset week
- `saveMetaOnly()` for staff/preset changes — doesn't touch shifts
- Clear Week button — clears current week only
- Hours summary shows current week only

### Transfers (Transfers.jsx)
- Table form: From | To | Category | Item | Desc | Qty | Cost | Save
- Edit and Delete per row
- CSV export
- Monthly total footer
- Global collection (not per-store) — all stores see all transfers

### Cash Register (CashRegister.jsx)
- Table form: Date (pre-filled, editable) | Opening $ | Closing $ | Difference (live) | Comments | + Add
- Delete per row
- Monthly summary: days logged, avg closing, total diff

---

## Responsive Design Rules
- Desktop (>768px): Sidebar only, NO top tab bar
- Mobile (<768px): Top tab bar only, NO sidebar
- CSS in Layout.jsx:
```css
.sidebar { display: flex; flex-direction: column; }
.mobile-tabs { display: none !important; }
@media (max-width: 768px) {
  .sidebar { display: none !important; }
  .mobile-tabs { display: flex !important; overflow-x: auto; }
}
```

---

## Critical Architecture Decisions (DO NOT CHANGE)
1. **No automatic inventory update from PDF** — Delivery tab is read-only invoice log
2. **Transfers are log-only** — no automatic inventory deduction
3. **Stripe billing deferred** — offline invoicing until adoption grows
4. **Photos as base64 in Firestore** — compressed aggressively, ~80KB max per photo
5. **Ice Cream Log is separate from Inventory** — Inventory for managers, Ice Cream Log for daily staff use
6. **DEFAULT_INVENTORY is fallback only** — always pass orgId to loadInventory

---

## PDF Parsing Constraint
pdfjs extracts text as flat space-separated string with NO newlines.
Any parser must use regex on normalized flat strings, not newline splitting.

---

## Themes
Defined in `src/utils/themes.js`
CSS variables used throughout: `var(--dark)`, `var(--caramel)`, `var(--cream)`, `var(--border)`, `var(--text-muted)`, `var(--green-ok)`, `var(--red-alert)`
Default theme: `warm`

---

## Pending / Roadmap
### Immediate fixes needed
- [x] Ice Cream Log — date picker added to header; logs use selected date for monthKey
- [x] COGS tab — enabled (Menu Margins live; COGS Report needs Sales data)
- [ ] Enable Commerce (Sales tab) so COGS Report has real data
- [ ] Test Cash Register Firestore rule is deployed

### Next phase — Enterprise & Multi-store
- [x] Tighten Admin — Users tab added (list/edit role+store, activate/deactivate)
- [ ] Staff attendance (clock in/out vs scheduled)
- [ ] Expiry date tracker
- [ ] COGS report — Revenue minus ingredient cost = gross margin
- [ ] Multi-store comparison dashboard
- [ ] Clover API integration (skip CSV upload for sales)
- [ ] Vendor contact book
- [ ] Enable Commerce section (Sales, Orders, Delivery)

### Technical debt
- [ ] Inventory sync conflict — last write wins when 2 devices edit simultaneously
- [ ] Firebase offline queue — changes lost if connection drops mid-save
- [ ] Session expiry — no clear message when Firebase auth token expires
- [ ] Schedule snapshot fails on Safari (html2canvas issue)

---

## How to Run
```bash
cd ~/dumont-inventory
npm run dev          # local dev at localhost:5173/dumont-inventory/
npm run build        # production build
git add .
git commit -m "description"
git push origin main # triggers GitHub Actions deploy
```

## Check deploy status
https://github.com/snamburi1980/dumont-inventory/actions

---

## Development Principles
1. **Always prefer simple over complex** — working solution over feature-complete but fragile
2. **Full file delivery** — always provide complete files, not snippets or diffs
3. **Test locally first** — `npm run dev` before pushing to prod
4. **Mobile first** — test on iPhone and Android, not just desktop
5. **Firestore rules** — always check rules when adding new collections
6. **No breaking changes** — existing data in Firestore must remain compatible

---

## Auto Deploy Rule
After every code change:
1. Run `npm run build`
2. If the build succeeds, run `git add . && git commit -m "fix: <short description>" && git push origin main`
3. Report the live URL so I can test: https://snamburi1980.github.io/dumont-inventory/
4. If the build fails, fix the errors and retry — do not push a broken build.

Never ask me to run build, commit, or push manually.
