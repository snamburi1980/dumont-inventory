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

Note: orgId now resolves dynamically (see Roles section) — Bulletin/Invoices/COGS all key off the real org id.

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
records      Records.jsx     — wrapper with subtabs: 💵 Cash | ↔️ Transfers | 🧾 Invoices | 📊 Sales & COGS (manager+)
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
stores/{storeId}/cashMovements/{id}   — cash in/out log: {type:'in'|'out', amount, reason, note, loggedBy,
                                        timestamp, dateRaw "YYYY-MM-DD", monthKey} (Records → Cash → In/Out tab)
stores/{storeId}/salesLedger/{id}     — Clover upload summaries {revenue, itemsSold, period, rows[], appliedAt}
stores/{storeId}/deliveries/{id}      — delivery log entries (Commerce → Deliveries)
stores/{storeId}/issues/{id}          — Home tab issues {title, description, status open|resolved}
transfers/{id}                        — GLOBAL inter-store transfers (all stores see all)
invoices/{id}                         — invoice log tagged with storeId+orgId+category (COGS vs opex);
                                        approval flow; managers see own store only, super/regional see all;
                                        optional fileData (photo/PDF attachment, ~250KB max)
announcements/{id}                    — Home (postedAt) + Bulletin (createdAt, orgId=='dumont') both use this
bulletinLinks|bulletinIssues|bulletinContacts/{id} — Bulletin sections, orgId=='dumont'
users/{emailKey}                      — user config + role (see Roles)
invitations/{token}                   — invite docs (see Roles)
signupRequests/{id}                   — legacy pending-approval queue (mostly unused)
auditLog/{id}                         — audit trail (utils/auditLogger.js), super_owner read
_invoiceMeta/{id}                     — invoice pipeline metadata (Cloud Function only)
```

### Clover Item Sales export format (IMPORTANT — src/utils/cloverParser.js)
Verified against a real Jul 2026 export. The file is NOT a flat table:
- ~15 rows of **preamble** (title, date range, filters, and a summary block that contains a literal
  "Net Sales" label cell) sit above the real header row. Header detection therefore requires ≥3
  recognised column names on the same row — matching one keyword alone hits the summary block.
- **Categories are section rows**, not a column: `Ice Cream` alone in col 0, then item rows with a
  blank col 0, then `Total (Ice Cream)`, ending with a `TOTAL` grand-total row.
- **Modifier rows** (Sprinkles, Waffle Cone, Oat Milk…) are sub-rows with a blank item name. Their
  amounts are ALREADY included in the parent item's Net Sales — counting them double-counts revenue.
- Money cells arrive as `"$24,051.07"`, `-$5.75`, `-`, or `" "` (xlsx may pre-convert to numbers).
Parser reconciles: item rows sum to each category total, categories sum to the grand total, and
`reconciled`/`grandTotal`/`catSum` are returned so the UI can warn on mismatch. Real-file check:
revenue $23,643.56, 3,925 items, 150 products, 11 categories — all exact.
`revGroup()` in COGS.jsx maps Clover categories → COGS groups (Specialty Beverages → drinks, Sides → other).

### Inventory data-model quirk (IMPORTANT)
`useInventory.loadInventory(storeId, orgId)` merges **org item master** (orgs/{orgId}/items; falls back to
DEFAULT_INVENTORY in src/data/inventory.js if empty — 54 ice cream items, fallback ONLY) with the flat
stock doc. `useOrgItems.loadItems(orgId)` **seeds** the org catalog from DEFAULT_INVENTORY on first load if empty.
Always pass orgId; without it components show fallback data. Picks re-loads inventory on mount for this reason.

---

## Reliability Conventions (established Aug 2026 reliability pass)
- **`src/utils/withRetry.js`** — wraps a write in up to 2 retries with backoff (skips retry on
  permission-denied/invalid-argument/unauthenticated, since retrying those just delays the same failure).
  Used on essentially every addDoc/updateDoc/setDoc/deleteDoc in the app now — store wifi drops
  constantly, and a single blip used to mean silently redoing the work. `setDoc`/`updateDoc` with a
  fixed doc id are always safe to retry (idempotent); `addDoc` (auto-generated id) has a theoretical
  tiny duplicate risk on a true false-negative ack, accepted app-wide as the right tradeoff.
- **Every `saving`/`uploading`-flag write path MUST have try/catch around the write**, with the flag
  reset in both success and catch branches (or a `finally`). Several places didn't (Setup Wizard's Add
  Region/Assign User, Users tab edit-save, Home's announcement/issue post, SOP upload) — a failed write
  left the button permanently disabled until reload. Fixed, but watch for this pattern in new code.
- **Debounced saves must read state via a ref, not the closure.** Inventory's auto-save (`scheduleSave`
  in Inventory.jsx) used to close over `inventory` from the render where the timer was scheduled — since
  React re-renders AFTER an event handler returns, that closure predates the very tap that triggered it.
  Result: the LAST stock adjustment in every editing session silently never reached Firestore, even
  though the UI showed "✓ Saved". Fixed via `invRef` kept current by a `useEffect`. Same trap applies to
  any future debounced/delayed save — never close over component state directly inside a `setTimeout`.
- **Sequential replace-then-delete writes must save the NEW record before deleting the OLD one**, not
  the reverse — a mid-sequence failure should never leave a store with zero data for a period. Applied to
  monthly sales upload replacement (COGS.jsx, Commerce.jsx).
- **Unbounded onSnapshot listeners get a `limit()`** once a collection has no natural per-store scope
  (Bulletin's 4 org-wide collections, the Invoices browse list) — otherwise months of multi-store use
  turn a live listener into an ever-growing download. Collections used for financial totals (COGS's
  invoice query) stay uncapped on purpose — correctness there matters more than a growth ceiling.

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
- **Records → Cash:** monthly summary (days logged, avg closing, total diff). Cash Movements sub-tab
  logs every cash-out/cash-in from the Clover drawer (bank deposit, supplies, tips, etc. — see reasons
  in CashRegister.jsx) with daily/monthly totals, separate from the daily open/close register.
- **Records → Invoices:** log purchases with photo/PDF attachment (compressed client-side, ~250KB cap)
  OR manual entry; each invoice tagged to a store + COGS category (Ice Cream/Dairy, Boba & Drinks,
  Coffee, Bakery, Packaging, Operating Expense, Other). Operating Expense is excluded from COGS math
  but still tracked for total spend visibility. store_owner+ approves; manager can log but not approve.
- **Records → Sales & COGS** (COGS.jsx, formerly just "COGS"): three sub-views.
  - **Upload Sales:** managers upload the Clover **Reporting → Revenue → Item Sales** export (CSV or
    Excel) monthly; parsed into revenue, item rows, and byCategory breakdown; saved to `salesLedger`
    keyed by monthKey. Month auto-detects from the report's date-range line. Re-uploading a month
    prompts to replace. (Commerce.jsx's HQ upload uses the same parser + schema.)
  - **COGS Report:** revenue by category (from upload) + COGS by category (approved invoice purchases
    ÷ matching revenue category, via `revGroup()` keyword-matching in COGS.jsx) + vendor spend +
    month-over-month trend table. Formula: **COGS % = approved COGS-tagged invoices ÷ uploaded revenue**
    for the selected month (simple purchases/revenue model — no beginning/ending inventory count, by
    design/user choice). Benchmark shown: ≤30% excellent, 30–40% watch, >40% high (ice cream shop norms).
  - **Menu Margins:** unchanged — static MENU_MARGINS table, theoretical cost vs sell price per item.
- **Bulletin:** four real-time sections; super_owner edit mode; pinned announcements sort first.
- **PLSimulator:** all state in localStorage keys `pls5_*`; products/opex/mix editable; no backend.
- **HQDashboard:** per-store metrics; lowStock calc fixed to parse the flat stock doc correctly.

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
- [x] Inventory debounced-save data loss — FIXED Aug 2026 (stale closure bug; see Reliability
      Conventions above). This was likely the #1 cause of the app "feeling unreliable."
- [x] Firebase offline queue — Firestore's `persistentLocalCache` already queues writes made while
      offline and flushes on reconnect (see firebase/config.js); `OfflineBanner.jsx` surfaces status.
      Every write across the app now also retries on transient failure (see Reliability Conventions).
- [ ] Inventory sync conflict — last write wins when 2 devices edit simultaneously (unrelated to the
      debounce bug above; this is true concurrent-edit conflict resolution, not yet built)
- [ ] Schedule snapshot fails on Safari (html2canvas)
- [ ] Two test stores + owners in prod data (use Admin → Delete store to clear)
- [ ] Dead code: Delivery/Sales/Orders/Dashboard components, stockAlert util, hooks/inventory.js

### Next phase
- [x] Sales & COGS module — DONE Aug 2026: Invoices now take photo/PDF upload OR manual entry, tagged
      by store + COGS category; Records → Sales & COGS has Clover sales upload (revenue by category +
      MoM trend) and a COGS report (purchases ÷ revenue, by category, vendor spend). Clover API
      integration is still manual-upload only (see below) — that's the acknowledged interim step.
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
2. If firestore.rules changed, run `npm run test:rules` (needs Java on PATH — see Testing section)
3. If the build/tests succeed, run `git add . && git commit -m "fix: <short description>" && git push origin main`
4. Report the live URL so I can test: https://snamburi1980.github.io/dumont-inventory/
5. If the build or tests fail, fix the errors and retry — do not push broken code.
6. If firestore.rules or functions/ changed, also run the matching `firebase deploy --only …`.

Never ask me to run build, commit, or push manually.

GitHub Actions now also runs the full test suite (unit + Firestore rules) on every push to
`main` and every PR — `deploy` only fires if `test` passes (`.github/workflows/deploy.yml`).
This is a real gate, not just a local courtesy: a push that breaks a test will build fine
here, get committed, get pushed, and then **not** reach production — check the Actions tab
if a deploy doesn't show up after a push.

---

## Testing (added Aug 2026, Phase 1 of the SaaS roadmap — see below)
- **`npm test`** — Vitest unit tests (`tests/unit/`). Currently covers `cloverParser.js` (the
  Clover export parser, using a fixture that mirrors the real file's preamble/category-section/
  modifier-row structure) and `withRetry.js` (retry count, backoff, no-retry-on-permission-denied).
- **`npm run test:rules`** — runs the REAL `firestore.rules` against a local Firestore emulator
  (`tests/rules/`) via `@firebase/rules-unit-testing@2.0.7` (pinned — the current version needs
  firebase SDK v12, this app is still on v9). Spins the emulator up and down automatically
  (`firebase emulators:exec`), no login, no real GCP project touched, zero cost.
  - **Needs Java on PATH** (the emulator is a JVM process). Installed via `brew install openjdk`
    (keg-only, not symlinked system-wide — deliberately skipped the `sudo` step since it's not
    needed). Run tests with: `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH" && npm run test:rules`.
    GitHub Actions installs its own Java via `actions/setup-java`, no local setup needed there.
  - Covers: store-level data isolation (Store A can never read/write Store B), store-doc update
    scoping (store_owner can only edit their own store), role permission boundaries (staff can't
    approve invoices, manager can't delete a store, only super_owner creates regions), and
    privilege-escalation attempts on `/users` (can't grant yourself a role, can't forge an
    invitation, can't reuse an expired one).
  - **`npm run test:all`** runs both suites.

### KNOWN GAP surfaced by the rules tests — read before starting Phase 2
Two tests in `Cross-org isolation (Phase 2 readiness check)` are written against the behavior a
multi-tenant SaaS needs and **pass today only because the current behavior matches a single-tenant
app**, not because isolation is enforced:
- `isSuperOwner()` and `isRegionalOwner()` in firestore.rules are **platform-wide, not scoped to
  one org** — any user with `role: 'super_owner'` (or `role: 'regional_owner'`) can read/write
  every store in the database, regardless of which org owns it. Fine when there's one tenant
  (Dumont). Breaks completely the moment a second paying org exists, because their top admin would
  get the same unscoped role and could read Dumont's data (and vice versa).
- Fix requires adding org-scoping to these two helper functions (e.g. compare the store's `orgId`
  against an `orgId` custom claim) and deciding whether "super_owner" stays a single platform-wide
  role (with a NEW org-scoped role for tenant admins) or becomes org-scoped itself with a separate
  platform-operator concept layered on top. This is a real design decision, not a one-line fix —
  it touches onboarding, Cloud Functions claim-stamping, and Admin.jsx's role assumptions. **This
  is the first item of Phase 2.**

---

## SaaS Roadmap (multi-tenant platform — "Option B", decided Aug 2026)
Sasi is building toward selling this to other franchise/creamery operators, not just running
Dumont's own stores. Four phases, in order — don't skip ahead to billing/self-serve signup before
the foundation is trustworthy:
- **Phase 1 — Trust the foundation:** automated tests + CI gate (DONE, this section) + a staging
  Firebase project separate from production (NOT done — no new cloud project created yet, needs
  Sasi's explicit go-ahead since it's a real cloud resource with billing implications).
- **Phase 2 — True multi-tenancy audit:** fix the cross-org isolation gap above; separate
  "platform operator" (Sasi) from "tenant admin" (a customer's own top user) — today they're the
  same `super_owner` role.
- **Phase 3 — Self-serve:** tenant signup/provisioning flow, Stripe billing (explicitly deferred
  until now — see Critical Architecture Decisions), white-labeling (orgs already have
  logo/brandColor fields; UI doesn't consistently use them yet, still has hardcoded Dumont
  branding/Monty in places).
- **Phase 4 — Enterprise trust features:** SSO/SAML, granular permissions beyond the 5 fixed
  roles, formal audit/compliance posture, SLA monitoring. Only matters once selling to larger
  operators, not the first few franchise customers.
