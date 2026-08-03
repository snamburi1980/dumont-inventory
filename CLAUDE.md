# Dumont Inventory App — Claude Code Context

## What This Is
A custom SaaS inventory management app for **Dumont Creamery & Café** franchise stores in Texas.
Built by Sasikanth Namburi (owner) with Claude AI assistance.
This file gives Claude Code full context to continue development without repeating history.
**Last verified against the actual code: Aug 2026.**

---

## Owner & Contact
- **Owner:** Sasikanth Namburi
- **Email:** dumonttexas@gmail.com (super_owner login)
- **Notification email:** txccpointwest@gmail.com (EmailJS recipient; Coppell manager login)

---

## Live URLs
- **Production:** https://snamburi1980.github.io/dumont-inventory/
- **Repo:** https://github.com/snamburi1980/dumont-inventory
- **Branch:** `main` = production (GitHub Actions auto-deploys)
- **Deploy status:** https://github.com/snamburi1980/dumont-inventory/actions

---

## Local Dev
- **Machine:** MacBook Air
- **IDE:** VS Code / Claude Code
- **Dev server:** `npm run dev` → http://localhost:5173/dumont-inventory/ (vite auto-increments port if busy)
- **Firebase CLI:** installed and logged in as sasikanth.namburi@gmail.com; `firebase.json` configured for firestore rules + functions

---

## Tech Stack
- **Frontend:** React + Vite (JSX, inline styles everywhere — no CSS modules)
- **Backend:** Firebase/Firestore + Cloud Functions (functions/index.js, Node 22, us-central1)
- **Auth:** Firebase Auth (email/password) + Custom Claims (role/storeId/orgId stamped into JWT)
- **Excel parsing:** xlsx package (Clover sales exports)
- **Error monitoring:** Sentry (initialized in main.jsx)
- **Notifications:** EmailJS (client-side email sending)
- **Deployment:** GitHub Pages via GitHub Actions; Firebase deploys via CLI
- **PWA:** vite-plugin-pwa (installable; theme color #1A4C48)

---

## Brand (applied Aug 2026 from "DUMONT USA - Brand Guidelines.pdf")
- **Colors:** primary deep green `#1A4C48` + peach `#E39C74` (deepened to `#C1683C` for text on light);
  cream `#EEE3D3`; light bg `#F6F4ED`; borders `#E3DDD0`; muted text `#6B7F78`; brick red `#C53D18`; gold `#FBBC55`
- **Fonts (Google):** Anton (`--font-display`, hero), Bebas Neue (`--font-serif`/`--font-heading`, wordmark + headings), Quicksand (`--font`, body)
- **Mascot:** Monty the astronaut — `src/assets/monty.png` (transparent PNG extracted from brand PDF). Used on LoginScreen (corner) and TipBanner ("Monty says:")
- **Graphic language:** 4-point sparkle SVGs, dotted orbit arcs, checkered strips, retro peach offset text-shadow on headings
- CSS variables live in `src/styles/global.css` (:root) AND `src/utils/themes.js` (THEMES.warm = "Dumont Brand", the default). Both must stay in sync.

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

## Third Party Keys
- **Sentry DSN:** https://4ec55a8eb23a22f5ee08daccd6e24018@o4511152029827072.ingest.us.sentry.io/4511152039395328
- **EmailJS:** service_hrmh6gj / template_qz6w4dk / public key: J6H5AoKpjqurMWiVd

---

## Current Data (snapshot Aug 2026)
Org: **Dumont Creamery & Cafe** (`dumont_creamery__cafe`), region **Texas**, 126 items in org catalog.
| Store | Status | Notes |
|-------|--------|-------|
| Coppell | Real, active | manager: txccpointwest@gmail.com; has inventory + schedule data |
| Test store | TEST DATA | owner nvs.prakash@hotmail.com — candidate for Clear Store |
| Aubret Dumont | TEST DATA | owner nsknamburi@gmail.com (Sasi's alt email) — candidate for Clear Store |

Note: some code paths hardcode orgId `'dumont'` as fallback (Bulletin, Invoices filter on `orgId=='dumont'`) while the real org doc id is `dumont_creamery__cafe`. Bulletin/Invoices data is therefore keyed to literal 'dumont'.

---

## App Structure — Two Modes

### Store Ops mode (Layout.jsx) — everyone
Tabs in App.jsx (ordered by daily workflow):
```
home         Home.jsx        — greeting, today's checklists, announcements, stock alerts, quick stats, issues
bulletin     Bulletin.jsx    — org-wide announcements/links/issues/vendor contacts (real-time onSnapshot; super_owner edits)
checklist    Checklist.jsx   — opening (30 items) / closing (22 items), photos, history
icecreamlog  Picks.jsx       — "Scoops": tap-to-log ice cream buckets used, monthly usage report
inventory    Inventory.jsx   — lock/unlock table, category pills, inline stock/PAR edit
schedule     Schedule.jsx    — week grid (desktop) / week+day toggle (mobile), presets, hours summary
records      Records.jsx     — wrapper with subtabs: 💵 Cash | ↔️ Transfers | 🧾 Invoices | 📊 COGS (invoices/cogs manager+)
pnl          PLSimulator.jsx — P&L simulator, pure localStorage (no Firestore)
admin        Admin.jsx       — role-scoped admin
```
**Staff** see only: home, bulletin, checklist, icecreamlog, inventory (enforced in App.jsx `staffAllowedTabs` + Layout tabGroups).
Sidebar groups (Layout.jsx): Operations / Insights (pnl) / Admin.

### HQ mode (HQLayout.jsx) — super_owner only
Super owner lands in HQ mode (`hqMode` state in App.jsx). Tabs:
```
hq_dashboard HQDashboard.jsx — all-store cards: monthly cash total, last checklist, low stock count, pending invites
hq_stores    Admin defaultView="stores"   — create store & send invitation
hq_analytics Commerce.jsx    — per selected store: Clover sales upload (xlsx), deliveries log, menu margins
hq_users     Admin defaultView="users"
hq_settings  Admin defaultView="settings"
```
"View Store Ops" button switches to Store Ops mode for the selected store; "Back to HQ" returns.

### Legacy / NOT imported anywhere (dead code, keep or delete)
`Delivery.jsx, Sales.jsx, Orders.jsx, Dashboard.jsx` — old Commerce tabs, superseded by Commerce.jsx/Records.
`utils/stockAlert.js` (checkAndAlertLowStock) and `sendChecklistNotification` — written but never called.
`src/hooks/inventory.js` — duplicate of data/inventory.js.

---

## Roles & Security Model (locked down Aug 2026)
Roles: `super_owner` > `regional_owner` > `store_owner` > `manager` > `staff`.
- dumonttexas@gmail.com is the only HARDCODED user (super_owner) in useAuth.js.
- Roles live in Firestore `users/{emailKey}` (email with `.`→`_`, `@`→`_at_`), and are stamped
  into JWT custom claims by Cloud Functions (`ensureClaims` on login, `syncUserClaims` on user-doc write).
- **User management is super_owner ONLY.** Store owners/managers see a "contact HQ" note in Admin → Users
  (read-only list of their store's users). Enforced in UI, Cloud Functions, AND Firestore rules.
- Invite flow: super_owner creates store + invitation doc (72h token) → EmailJS sends link →
  OnboardingScreen validates the invitation doc (source of truth for role/store — NOT URL params),
  invitee sets password, user doc written with `inviteToken`; rules verify the invitation matches.
- Firestore rules highlights: users can self-update only `forcePasswordChange`/`name`; invitations
  creatable only by super_owner (invitee may mark accepted); stores editable only by their own owner;
  self-created user docs require a valid pending invitation.
- **Cloud Functions** (functions/index.js): `ensureClaims`, `syncUserClaims`, `deleteAuthUser`,
  `createAuthUser` (super_owner only), `clearStoreData({storeId, deleteUsers})` — recursive-deletes the
  store doc + all subcollections + its invitations, optionally its users (Firestore docs + Auth accounts;
  never deletes super_owner). Wired to Admin store/region/org Delete buttons.
- Deploy backend: `firebase deploy --only firestore:rules` / `--only functions`
- Login screen has "Forgot password?" (sendPasswordResetEmail; deliberately vague response to avoid email enumeration).

---

## Firestore Collections & Data Model
```
orgs/{orgId}                          — org meta (name, brandColor, logoData)
orgs/{orgId}/items/{itemId}           — item master (name, code, cat, uom, cost_price, sell_price, par, active…)
regions/{id}                          — {name, orgId, active}
stores/{storeId}                      — {name, regionId, orgId, status, address, phone, ownerEmail…}
stores/{storeId}/inventory/stock      — ONE FLAT DOC: {itemId}: number (stock),
                                        par_{itemId}, par_override_{itemId}, active_{itemId}
stores/{storeId}/stockLog/{id}        — Picks logs: {itemId, itemName, delta(neg), stockAfter, userName,
                                        timestamp, date, month, monthKey "YYYY-MM"}
stores/{storeId}/checklists/{id}      — {type: opening|closing, date(locale string), items[{label,checked,remarks,photo(b64)}], …}
stores/{storeId}/schedule/data        — ONE DOC: {members, presets, shifts: {weekOffset: {…}}}
stores/{storeId}/cashRegister/{id}    — {date, openingCash, closingCash, difference, comments, monthKey}
stores/{storeId}/salesLedger/{id}     — Clover upload summaries {revenue, itemsSold, period, rows[], appliedAt}
stores/{storeId}/deliveries/{id}      — delivery log entries (Commerce → Deliveries)
stores/{storeId}/issues/{id}          — Home tab issues {title, description, status open|resolved}
transfers/{id}                        — GLOBAL inter-store transfers (all stores see all)
invoices/{id}                         — GLOBAL invoice log, orgId=='dumont', approval flow (manager+ read)
announcements/{id}                    — Home (postedAt) + Bulletin (createdAt, orgId=='dumont') both use this
bulletinLinks|bulletinIssues|bulletinContacts/{id} — Bulletin sections, orgId=='dumont'
users/{emailKey}                      — user config + role (see Roles)
invitations/{token}                   — invite docs (see Roles)
signupRequests/{id}                   — legacy pending-approval queue (mostly unused)
auditLog/{id}                         — audit trail (utils/auditLogger.js), super_owner read
_invoiceMeta/{id}                     — invoice pipeline metadata (Cloud Function only)
```

### Inventory data-model quirk (IMPORTANT)
`useInventory.loadInventory(storeId, orgId)` merges **org item master** (orgs/{orgId}/items; falls back to
DEFAULT_INVENTORY in src/data/inventory.js if empty — 54 ice cream items, fallback ONLY) with the flat
stock doc. `useOrgItems.loadItems(orgId)` **seeds** the org catalog from DEFAULT_INVENTORY on first load if empty.
Always pass orgId; without it components show fallback data. Picks re-loads inventory on mount for this reason.

---

## Key Component Behaviors
- **Inventory:** lock/unlock with 5-min auto-lock; debounced save (1.2 s) with Saving…/✓ Saved status;
  tap stock or PAR to edit inline; deactivate needs confirm; staff cannot deactivate.
- **Picks (Scoops):** date-selectable logging (writes stockLog with chosen date's monthKey); decrements
  stock and saves; "Clear Month" deletes that month's logs AND restores the stock counts.
- **Checklist:** hardcoded OPENING_ITEMS (30) / CLOSING_ITEMS (22); photo compression 3-stage
  (400px/q0.5 → q0.3 → 60% dims, ~80 KB target, 1 MB Firestore doc limit); submit retries 3× with 1.5 s delay;
  unchecked-items warning before submit; 30-day history with expand.
- **Schedule:** single doc, shifts keyed by week offset; `save()` re-reads doc and only overwrites current
  week (offsetRef avoids stale-closure writes); mobile week/day toggle; html2canvas snapshot (fails on Safari).
- **Records → Cash:** monthly summary (days logged, avg closing, total diff). **Records → COGS:** static
  MENU_MARGINS table + revenue-split estimates; needs salesLedger data for real numbers.
- **Commerce (HQ Analytics):** upload Clover .xlsx → parseCloverWorkbook (header auto-detect) → save
  summary to salesLedger; deliveries logging; margins table. No inventory mutation.
- **Bulletin:** four real-time sections; super_owner edit mode; pinned announcements sort first.
- **PLSimulator:** all state in localStorage keys `pls5_*`; products/opex/mix editable; no backend.
- **HQDashboard:** per-store metrics; NOTE its lowStock calc reads the flat stock doc as if values were
  objects (`i.qty`, `i.par`) — metric is wrong/always 0 (known bug, harmless).

---

## Critical Architecture Decisions (DO NOT CHANGE)
0. **No time clock / attendance feature** — staff clock in/out happens in Clover POS; never rebuild it here
1. **Transfers are log-only** — no automatic inventory deduction
2. **Stripe billing deferred** — offline invoicing until adoption grows
3. **Photos as base64 in Firestore** — compressed aggressively, ~80 KB max per photo
4. **Ice Cream Log (Picks) is separate from Inventory** — Inventory for managers, Picks for daily staff use
5. **DEFAULT_INVENTORY is fallback/seed only** — always pass orgId to loadInventory
6. **User management is super_owner only** — store owners/managers request HQ (see Roles)
7. **Inline styles, no CSS framework** — match existing style; use CSS vars (--dark, --caramel, etc.)

---

## Responsive Design Rules
- Desktop (>768 px): sidebar only, no top tab bar. Mobile (<768 px): top tab bar only, no sidebar.
- Schedule uses a `useIsMobile()` hook (window resize listener) for its own layout switching.

---

## Pending / Roadmap
### Known issues
- [x] HQDashboard lowStock metric — FIXED (parses flat stock doc correctly)
- [x] Bulletin/Invoices hardcoded orgId — FIXED (viewingOrg prop threaded through; App resolves
      first real org when user doc lacks orgId; super_owner doc now has orgId set)
- [ ] Ghost catalog `orgs/dumont/items` (108 stale items, accidentally seeded when super_owner's
      viewingOrg defaulted to 'dumont') still exists in Firestore — nothing references it after the
      orgId fix; superseded by orgs/dumont_creamery__cafe/items (126, actively used). Safe to purge.
- [ ] Inventory sync conflict — last write wins when 2 devices edit simultaneously
- [ ] Firebase offline queue — changes lost if connection drops mid-save
- [ ] Schedule snapshot fails on Safari (html2canvas)
- [ ] Two test stores + owners in prod data (use Admin → Delete store to clear)
- [ ] Dead code: Delivery/Sales/Orders/Dashboard components, stockAlert util, hooks/inventory.js

### Next phase
- [x] Waste log — DONE: Scoops has Used/Waste toggle; waste entries carry entryType+reason
      (Melted/Dropped/Expired/Freezer issue/Other); monthly report splits Used vs Wasted
- [x] Missed-checklist alert — DONE: `checkOpeningChecklists` scheduled function, daily 12:30 PM
      Central, emails dumonttexas@gmail.com if an active store has no opening checklist that day.
      Requires EmailJS "Allow API for non-browser applications" enabled (Account → Security).
- [x] Temperature logs — DONE: checklist records walk-in/dipping/cake temps (°F), flags out-of-range
- [x] Order list — DONE: Inventory → Order List button, below-PAR items w/ suggested qty, copy-to-share
- [ ] Expiry date tracker
- [ ] Clover API integration (replace XLSX upload)
- [ ] Multi-store comparison dashboard
- [ ] More brand styling on inner pages (sticker badges, arch cards)

---

## Development Principles
1. **Always prefer simple over complex** — working solution over feature-complete but fragile
2. **Test locally first** — `npm run dev` before pushing to prod
3. **Mobile first** — test on iPhone and Android, not just desktop
4. **Firestore rules** — update firestore.rules AND deploy (`firebase deploy --only firestore:rules`) when adding collections
5. **No breaking changes** — existing data in Firestore must remain compatible

---

## Auto Deploy Rule
After every code change:
1. Run `npm run build`
2. If the build succeeds, run `git add . && git commit -m "fix: <short description>" && git push origin main`
3. Report the live URL so I can test: https://snamburi1980.github.io/dumont-inventory/
4. If the build fails, fix the errors and retry — do not push a broken build.
5. If firestore.rules or functions/ changed, also run the matching `firebase deploy --only …`.

Never ask me to run build, commit, or push manually.
