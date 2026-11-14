# Workshop Check-In: Frontend Specification

| | |
|---|---|
| Document | `docs/SPEC-FRONTEND.md` |
| Build order | **2 of 2.** Start only after `docs/SPEC-BACKEND.md` phase 8 (hand-off) is complete. |
| Product stage | Proof of value (PoV) for one auto repair shop in Ontario, Canada. |
| Executor | Claude Code (CLI), working phase by phase. |
| UI reference | `docs/prototype/workshop-prototype.html`: the clickable prototype the customer approved. Match its flows, wording, layout and visual style unless this spec says otherwise. |
| Version | 1.0, 2026-11-13 |

---

## 0. How Claude Code must use this spec

Kickoff prompt:

```
Read docs/SPEC-FRONTEND.md and docs/SPEC-BACKEND.md (sections 7, 8, 11, 12, 13 are the
contract). Open docs/prototype/workshop-prototype.html as the UI reference.
Build the frontend phase by phase. After each phase run its verification, fix
failures, and commit "frontend: phase N - <name>". Stop and ask me whenever the
spec says HUMAN. Do not change backend contracts; if one is missing, stop and ask.
```

Rules:

1. Use the backend RPC names, argument names, JSON keys and error codes exactly as in `SPEC-BACKEND.md` section 8.
2. All runtime settings come from `/config.json` (backend spec section 12). Nothing environment-specific is compiled into the bundle.
3. Keep the prototype's wording for customer-facing screens. Canadian English ("licence plate", "kilometres", "tire").
4. Record any decision not covered here in `docs/DECISIONS.md`.
5. No secrets in the frontend. Only the Supabase **publishable** key and public Cognito IDs.

---

## 1. Users, devices and screens

| Role | Device and size to design for | Home route |
|---|---|---|
| Kiosk | 10–11" tablet, portrait or landscape, touch only, used by customers | `/kiosk` |
| Front desk | Laptop/desktop 1280×800+, also tablet | `/desk` |
| Workshop | Phone 390×844 and tablet, often greasy gloves: large touch targets (≥ 48 px) | `/workshop` |
| Display panel | TV 1920×1080, no input after setup, always dark | `/display` |
| Administrator | Laptop/desktop, phone usable | `/admin` |

---

## 2. Technology

| Concern | Choice |
|---|---|
| Build | Vite 5, TypeScript 5 strict, ES2022 |
| UI | React 18, React Router 6 (data routers not required) |
| Server state | TanStack Query 5 |
| Data | `@supabase/supabase-js` v2 using the third-party `accessToken` option |
| Auth | `aws-amplify` v6, **Auth category only** (`signInWithRedirect`, `fetchAuthSession`, `signOut`), configured at runtime from `/config.json` |
| Forms/validation | zod for parsing RPC responses at the boundary and for form validation |
| Styling | Plain CSS with CSS custom properties (design tokens from the prototype), CSS modules per component. No CSS framework. |
| Fonts | Self-hosted via `@fontsource/barlow`, `@fontsource/barlow-condensed`, `@fontsource/jetbrains-mono` (no Google Fonts requests, CSP-friendly) |
| QR | `qrcode` (generate SVG), `jsqr` (decode fallback); native `BarcodeDetector` when available |
| Speech | Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) when available; keyboard dictation otherwise |
| Tests | Vitest + Testing Library (unit/component), Playwright (end-to-end, accessibility via `@axe-core/playwright`, screenshots) |
| Lint/format | ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier |

---

## 3. Project layout

```
frontend/
├─ public/
│  ├─ config.json              # written by backend/scripts/write-frontend-config.ts (not committed)
│  └─ config.example.json      # committed sample with authMode "dev"
├─ src/
│  ├─ main.tsx, App.tsx, routes.tsx
│  ├─ config/loadConfig.ts     # fetch('/config.json', {cache:'no-store'}) + zod schema
│  ├─ auth/                    # AuthAdapter interface, CognitoAuth, DevAuth, AuthProvider
│  ├─ session/                 # device session store, RoleGuard, midnight expiry, quick switch
│  ├─ api/
│  │  ├─ supabase.ts           # client factory
│  │  ├─ rpc.ts                # typed wrappers for every backend RPC
│  │  ├─ intake.ts             # calls to the intake HTTP API
│  │  ├─ errors.ts             # error code → user message mapping (section 10)
│  │  ├─ realtime.ts           # subscriptions → query invalidation
│  │  └─ types.ts              # Job, JobSummary, Customer, Vehicle, Staff, Shop…
│  ├─ design/                  # tokens.css, base.css, print.css
│  ├─ components/              # PlateChip, StatusPill, UrgencyPill, Drawer, Dialog, Toast,
│  │                           # Tabs, Tile, Chip, Field, YearMakeModel, SignaturePad,
│  │                           # VoiceBox, TotalsBox, EventLog, QrCode, QrScanner, Clock …
│  ├─ features/
│  │  ├─ login/  role/  kiosk/  desk/  workshop/  display/  admin/
│  │  └─ shared/ (JobDrawer, VehicleDrawer, CustomerDrawer, StaffDrawer, JobTagDialog, Find)
│  ├─ data/vehicle-catalog.json # makes → models, ported from the prototype
│  └─ lib/ (format.ts: phone, plate, money CAD, km, dates en-CA; normalize.ts; time.ts)
├─ tests/ (unit) and e2e/ (Playwright)
├─ scripts/mock-intake-server.ts  # local stand-in for the intake API (dev + e2e)
├─ scripts/deploy.ts              # build output → S3 + CloudFront invalidation
├─ index.html, vite.config.ts, playwright.config.ts, package.json, README.md
```

---

## 4. Runtime configuration and authentication

### 4.1 Config

`loadConfig()` runs before React renders. Schema = backend spec section 12, plus `authMode: "cognito" | "dev"`. In `dev` mode two extra optional keys are allowed: `devTokenUrl` (default `http://localhost:8787/token`) and `devStaffEmails` (string array for the dev login list). If loading fails, render a plain error page: "This screen can't start. Check the network and reload."

### 4.2 Auth adapter

```ts
interface AuthAdapter {
  signIn(): Promise<void>;                 // Cognito: signInWithRedirect({ provider: 'Google' })
  handleCallback(): Promise<void>;         // Cognito: Amplify completes the code exchange on /auth/callback
  getAccessToken(): Promise<string | null>;// Cognito: (await fetchAuthSession()).tokens?.accessToken?.toString()
  signOut(): Promise<void>;                // Cognito: signOut() (hosted UI logout)
}
```

- `CognitoAuth`: `Amplify.configure` from config (`loginWith.oauth` with the domain, scopes `openid email profile`, redirect URLs, `responseType: 'code'`). Refresh is handled by `fetchAuthSession`.
- `DevAuth` (`authMode: "dev"` only): the login page shows a list of `devStaffEmails` buttons; choosing one fetches `GET {devTokenUrl}?email=` and keeps the token in memory + `sessionStorage`. Must be impossible to enable when `stage !== "dev"` and `supabaseUrl` is not localhost (throw at startup).

### 4.3 Supabase client

```ts
createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
  accessToken: () => auth.getAccessToken(),
  realtime: { params: { eventsPerSecond: 5 } },
});
```

One client per app instance. Call RPCs with `supabase.rpc(name, args)`. Read views with `supabase.from('v_display_board').select()`.

### 4.4 Intake API client

`POST {apiUrl}/intake/visit` and `/intake/registration` with `Authorization: Bearer <access token>`, JSON body per backend 11.1, 25 s timeout with `AbortController`. Map HTTP errors to section 10 messages.

---

## 5. Device sessions, roles and switching

State kept in `localStorage['workshop.session']`: `{ id, role, expires_at, staff_id }` (per device). Behaviour:

1. **Boot:** load config → auth adapter. No token → `/login`.
2. With a token: call `me()`.
   - `NOT_STAFF` → page "This Google account isn't set up as staff. Ask the shop owner to add you." with Sign out.
   - If a stored session exists for this staff id → `get_session`. Valid → go to that role's home. `SESSION_EXPIRED`/`SESSION_INVALID` → clear it.
   - No valid session: if the staff member has **one** role → `start_session(role, deviceLabel)` and go home. Several roles → `/role` picker.
3. **Role picker** (`/role`): greeting "Hi {first name}. Which role is this device for?", one tile per role with the prototype's descriptions, a "Device name" text field (default from `localStorage['workshop.deviceLabel']` or "This device"), Sign out link. Explain: "To use a different role later, sign out and sign in again" and, if `quick_switch` has 2+ roles, "or switch between the roles your administrator allows".
4. **PIN set-up:** if `me().staff.has_pin` is false, after choosing a role ask once for a 4–6 digit PIN (twice) → `set_my_pin`. Required before a kiosk or display session starts; skippable ("Later") for other roles.
5. **Midnight:** schedule a timer for `expires_at`. When it fires (or any RPC returns `SESSION_EXPIRED`): clear the session, sign out, show "Signed out at midnight. Sign in to start the day." on `/login`.
6. **Role guard:** each home route requires the session role; otherwise redirect to the session's home route.
7. **Top bar (staff roles):** role chip, staff name, "Switch role" button, "Sign out" button, connection status (Live / Reconnecting / Offline).
8. **Switch role dialog:** list the person's roles. Current role: disabled "Current role". Roles where both the current role and the target are in `quick_switch`: "Switch now" → `switch_role` → navigate. Others: disabled, "Sign out and sign in again to use this role". Plus a "Sign out" button.
9. **Kiosk and display lock:** no top-bar controls except a clock and a small "Staff" button. "Staff" opens a PIN dialog → `verify_pin`. On success show the Switch role dialog (same rules). `PIN_INVALID` → "Wrong PIN." `PIN_LOCKED` → "Too many tries. Wait {n} seconds." Escape or tapping outside closes the dialog.
10. **Sign out:** `end_session` (ignore errors) → clear session → `auth.signOut()` → `/login`.

---

## 6. Design system

Port the prototype's design exactly as a starting point (`docs/prototype/workshop-prototype.html`, `<style>` block):

- **Tokens:** `--paper, --surface, --ink, --muted, --line, --line-strong, --label-bg, --field, --accent (#1c4ba3), --accent-ink, --accent-soft, --ok, --warn, --crit, --info, --queue` and their `-soft` variants, light and dark sets (dark via `prefers-color-scheme` and `[data-theme="dark"]`).
- **Type:** display = Barlow Condensed 600/700 (headings, labels, uppercase section titles), body = Barlow 400–700, mono = JetBrains Mono (order numbers, plates, clock, numbers). Tabular numerals in tables and totals.
- **Ontario licence plate chip** (`PlateChip`): white plate, blue (#1c3f8c) border and text, small "ONTARIO" line, mono plate text, formatted `ABCD 123` when the plate is 4 letters + 3 digits; sizes `sm | md | lg`. Same look in light and dark themes.
- **Status pills** (dot + label) with tones: checked_in → info "Waiting for keys" (staff) / "Checked in" (display); accepted → queue "In queue" / "In the queue"; in_progress → accent "In progress" / "Being worked on"; waiting_parts → warn "Waiting on parts"; ready → ok "Ready for pickup"; picked_up → muted "Picked up"; cancelled → muted "Cancelled".
- **Urgency pill:** unsafe → crit "Safety concern"; soon → warn "Needs attention soon"; routine → ok "Routine".
- **Work order "ticket"** grid with grey label cells (mirrors the shop's paper form): Client name, Client phone, Year make & model, Licence plate #, VIN, Engine size, Odometer (km), Order received by, Pick-up date, Technician.
- **Drawer:** right-side sheet (full screen under 720 px), sticky header with Back/Close, sticky footer for actions, unsaved-changes bar ("You have unsaved changes. Discard changes / Keep editing").
- **Display panel:** always dark (force tokens on `body[data-role=display]`), large type, colour stripe per status, ready rows highlighted green.
- Respect `prefers-reduced-motion`; visible focus ring (3 px accent); all touch targets ≥ 44 px (≥ 48 px on kiosk/workshop).

---

## 7. Screens

### 7.1 Login (`/login`)
Card: "Staff sign-in", "Sign in at the start of the day. You stay signed in on this device until midnight." Primary button "Sign in with Google". Shows any message passed from sign-out (midnight, removed access). Callback page `/auth/callback` shows "Signing you in…" and continues the boot sequence.

### 7.2 Kiosk (`/kiosk`)

A step machine (`useReducer`) with these states, matching the prototype: `search`, `pickCustomer`, `pickVehicle`, `whoAreYou`, `notFound`, `register`, `addVehicle`, `linkOwner`, `visit`, `done`. Progress bar with 3 steps: Find your records → Choose your vehicle → Describe the problem & sign.

| step | content | backend |
|---|---|---|
| search | "Welcome. Let's check in your vehicle." Big input "Phone or plate" (mono, 24 px), button "Find my records", link "Register as a new customer" | `kiosk_lookup` |
| pickCustomer | "Who's checking in?" tiles with masked name and "Phone ending 0142" | `kiosk_customer_vehicles` |
| pickVehicle | "Welcome back, {first name}." Vehicle tiles (plate, year make model, "Last visit {date} · {km}"), tag "Shared vehicle" for co-owner, tile "+ A different vehicle", "Not you? Start over" | |
| whoAreYou | Plate (lg) + vehicle; owner tiles (masked), tile "I'm not listed" | |
| notFound | "We couldn't find “{query}”." buttons Register / Try again | |
| register | Optional VoiceBox (registration mode), Your details (name, phone, email optional), Your vehicle (YearMakeModel + plate, engine optional, VIN optional) | `POST /intake/registration`, `kiosk_register` |
| addVehicle | vehicle fields only | `kiosk_add_vehicle` |
| linkOwner | If customer unknown: phone + name. Radio: "I bought this vehicle" / "I share it with the owner" (only when other owners exist) | `kiosk_link_owner` |
| visit | Summary bar (plate, vehicle, name, phone, "Change"); VoiceBox (visit mode) with "Here's what we understood" card; Reason chips (Mechanical, Body work, Accident / tow); Odometer (km) with "Last recorded …" placeholder; numbered concern lines (add/remove, max 8); authorization text; printed name; SignaturePad; agree checkbox; "Check in my vehicle" | upload signature → `kiosk_check_in` |
| done | "Work order #{order_no}", "You're checked in, {first name}.", "Please hand your keys to the front desk. We'll call {masked phone} with an estimate before doing any work beyond the inspection." "Done" button; auto-reset after 30 s | |

Rules:
- Normalise like the backend: phone digits, plate `A-Z0-9`. Validation messages match the prototype ("Enter a 10-digit phone number.", "Enter the licence plate (2 to 8 letters and numbers).", "A VIN has 17 characters. Leave it blank if unsure.").
- **Inactivity reset:** on any step after `search`, 90 s without touch or typing shows a 10-second "Are you still there?" countdown, then resets to `search` and clears all entered data. Disabled while the signature pad is being drawn.
- **Authorization text** is shop-configurable later; for v1 use the prototype's paraphrased text and keep the note "Demo wording. Use your shop's own legal text." out of production builds (show it only when `stage !== "prod"`).
- **Signature:** canvas, pointer events, white background, export PNG ≤ 600×200, upload to Storage bucket `signatures` at `<shop_id>/<yyyy>/<mm>/<uuid>.png` before calling `kiosk_check_in`. "Clear signature" button. Submission requires concerns ≥ 1, printed name, signature, agree.
- **Privacy:** never display full names of other customers or any service history on the kiosk.

### 7.3 VoiceBox (kiosk visit and registration)
- Large textarea "Tell us what's wrong, in your own words" (visit) / "Prefer to talk? Tell us about you and your car" (registration), tag "Any language".
- If Web Speech API exists: a big **"Hold to talk"** / "Tap to talk" microphone button with live interim text, language selector (English (Canada) `en-CA` default, Français (Canada) `fr-CA`, Español `es-MX`, Português `pt-BR`, ਪੰਜਾਬੀ `pa-IN`, हिन्दी `hi-IN`, 中文 `zh-CN`, தமிழ் `ta-IN`, Tagalog `fil-PH`). Recognised text is appended to the textarea. If not supported or permission denied, hide the button and show: "To talk instead of type, tap the microphone key on the keyboard, speak, then tap it again."
- "Fill in the form for me" calls the intake API, shows "Reading your description…", then:
  - visit: replaces concerns, sets reasons (if any valid), sets odometer only if the field is empty, stores the intake object (transcript = textarea text) and shows the "Here's what we understood" card with summary, urgency pill and safety note.
  - registration: fills fields that came back non-empty, matching make/model against the catalog (aliases: chevy → Chevrolet, vw → Volkswagen, mercedes → Mercedes-Benz), and shows "We filled in what we heard. Check each field below before you continue."
- Errors: "We couldn't read that. Try again, or fill in the form below." The form always works without AI.
- Note in README: browser speech recognition may send audio to the browser vendor's service; the shop should be told.

### 7.4 YearMakeModel
Year select (next year down to 1970, "Choose year"); Make select (catalog makes + "Not listed" → text input); Model select filtered by make (disabled "Choose a make first"; + "Not listed" → text input). Changing make clears model and focuses model. Port the catalog from the prototype's `MAKES` object to `src/data/vehicle-catalog.json`.

### 7.5 Front desk (`/desk`, tabs via `/desk/:tab`)

Tabs: **Arrivals** (count badge, red when > 0), **Jobs**, **Find**, **Customers**, **Vehicles**.

- **Arrivals** (`list_jobs('arrivals')` + realtime): cards with order no, "Checked in 8:47 a.m. · 12 min ago", large plate, vehicle, customer name and phone, concerns list, urgency pill + safety note, buttons **"Keys received, accept job"** (`job_transition → accepted`) and "Details". After accepting, open the **Job tag dialog**. Below: table "In the workshop queue" (accepted jobs) with "Job QR tag" buttons. Empty state: "No one is waiting. New kiosk check-ins appear here right away."
- **Jobs board** (`list_jobs('active')`): stat pills per status + "Picked up today"; 5 columns (Waiting for keys, In queue, In progress, Waiting on parts, Ready for pickup), cards like the prototype (order no, time ago, plate, vehicle, customer, "Owner to verify" pill, "Safety concern" pill, first concern + "(+n more)", tech name or "Keys not received", total or "Est. $…"). Below: "Recently picked up" table. Responsive: 5 → 3 → 2 → 1 columns.
- **Find:** live search (debounce 250 ms) with `search_all`; groups Customers / Vehicles / Work orders. Hint "Search by name, phone, plate, VIN or order number".
- **Customers / Vehicles:** tables from `list_customers` / `list_vehicles`; row click opens drawer.
- **Job drawer** (`?job=<id>`, data from `get_work_order`): header "WORK ORDER #…", received time and source, status pill; ticket grid (section 6); "In the customer's words" (transcript quote, summary, safety note, when it happens, warning lights, questions to ask); Reason chips; **Customer concern** table (text, estimate, remove, add, estimate total); **Repair details** table (type part/labour, description, qty/hrs, unit price, amount, remove; "+ Part", "+ Labour ($rate/hr)"); Technician notes; Totals box (Parts subtotal, Labour, HST {rate}%, Total) updating live while typing using `shop.hst_rate`; Customer authorization (signed name, time, signature image via signed URL); History (events, newest first).
  - Footer (front desk/admin): "Keys received, accept job" (checked_in), "Job QR tag" (accepted…ready), "Mark picked up" (ready), "Save changes" (`save_work_order` with `version`).
  - `VERSION_CONFLICT` → bar "Someone else changed this job. Reload to see the latest version." with **Reload** (discards local edits after confirmation).
- **Vehicle drawer** (`?vehicle=`, `get_vehicle`): large plate, name, engine, VIN, last odometer; "+ Start work order" (`create_work_order`, choose customer among current owners); current owners (role tag, since, "Added at kiosk" + "Mark verified" → `owner_verify`, "End ownership" → `owner_end`); add owner form (phone, name if new, "Add as co-owner" / "Sold to this person") → `owner_add`; previous owners (from–to, reason); service history timeline (date, order no, concerns, km, customer + "(previous owner)", status, total); "Edit vehicle details" (YearMakeModel etc.) → `update_vehicle`.
- **Customer drawer** (`?customer=`, `get_customer`): name, phone, email, customer since; visits count and lifetime total; vehicles tiles; previous vehicles; visit history; "Edit customer details" → `update_customer`.
- **Job tag dialog:** printable tag with QR (payload `WO:<job uuid>`, SVG, error correction M), job number in large mono, plate chip, vehicle, masked customer name, "Keys received {date time}". Buttons **Print tag** (`window.print()` with `print.css` that prints only the tag, sized for a 62 × 100 mm label and centred on Letter paper) and Done. Text: "Attach the tag to the keys. The technician scans it to open and take up the job. If you can't print, write the job number on the key tag."

### 7.6 Workshop (`/workshop`)

- **Start a job** panel: big **"Scan job QR"** button opening the **QrScanner** (live camera with rear camera preferred, `BarcodeDetector({formats:['qr_code']})` if available, otherwise `jsqr` on 2–4 frames/second from a canvas). Torch toggle when supported. Fallback buttons: "Take a photo instead" (`<input type=file accept=image/* capture=environment>` decoded with jsqr) and job-number input "or type job number" → `find_job_by_code`. On success open the Job drawer.
- **My jobs** (`list_jobs('mine')`): cards with "Open job" and "Work complete" (in_progress) or "Resume" (waiting_parts).
- **Ready to start** (`list_jobs('queue')`, safety concerns first): cards with **Take job** (`job_transition → in_progress`, then open drawer) and Details.
- **Other jobs in the workshop:** in_progress/waiting_parts of other techs, view only.
- Job drawer footer for workshop: Take job (accepted) / Waiting on parts + **Work complete** (in_progress) / Resume work (waiting_parts) / Save changes. Workshop cannot edit "Order received by" or "Pick-up date" (render read-only).
- Phone layout: single column, sticky footer actions, number inputs with `inputmode="decimal"`.

### 7.7 Display panel (`/display`)

- Full-screen dark layout: heading "Vehicle status", sub-heading "Find your licence plate. We'll call you when your vehicle is ready.", count pills (Ready, Being worked on, In the queue), clock in the top bar.
- Rows from `v_display_board`: large plate chip, masked name, make + model, status pill (customer wording), "Checked in" time, "Estimated ready: Coming soon".
- Footer: "Wait-time estimates are coming soon. We now record when each job is checked in, started and finished, so estimates can be worked out from real data."
- Updates: subscribe to the **private** Realtime broadcast channel `shop:<shop_id>` (`supabase.channel(topic, { config: { private: true } })`), event `board_changed` → refetch; also refetch every 60 s as a fallback.
- If rows overflow the screen, auto-scroll slowly (pause 5 s at top and bottom); disabled with reduced motion (then paginate every 10 s).
- Request a **Screen Wake Lock** when visible; button "Full screen" shown only until full screen is entered.
- Empty state: "No vehicles in the shop right now."

### 7.8 Administrator (`/admin`, tabs via `/admin/:tab`)

Tabs: **Staff & roles**, **Jobs**, **Find**, **Customers**, **Vehicles**, **Shop settings**.
- **Staff & roles** (`list_staff`): table (name + Owner/You tags, Gmail, role tags, "Switch without signing out" tags or "Sign out to switch", Active/Inactive pill). "+ Add staff member" and row click open **Staff drawer**: name, Gmail address, PIN (required for new, "leave blank to keep"), Active checkbox, role chips, quick-switch chips (only for assigned roles), warning when Kiosk or Display is in quick switch: "{Kiosk} is included. Anyone at that screen could switch to staff roles after unlocking with a PIN." Save → `staff_upsert`. Help text: "New staff sign in with this Gmail address using Sign in with Google."
- **Shop settings:** shop name, HST rate (%), default labour rate ($/hr) → `update_shop`. Also "Change my PIN".
- Jobs/Find/Customers/Vehicles reuse the front-desk components with admin permissions (admin may also **Cancel job** with a confirm step).

---

## 8. Data layer

- Query keys: `['me']`, `['jobs', scope]`, `['job', id]`, `['vehicle', id]`, `['customer', id]`, `['search', q]`, `['customers']`, `['vehicles']`, `['staff']`, `['display']`.
- Realtime (`src/api/realtime.ts`): for staff roles subscribe once per app to `postgres_changes` on `work_orders`, `work_order_events`, `vehicle_owners` with filter `shop_id=eq.<shop>`; on any change invalidate `jobs`, the affected `job`, `vehicle`, `customer`. Display uses the broadcast topic instead. Show "Reconnecting…" in the top bar when the channel is not `SUBSCRIBED` for more than 5 s.
- Mutations: disable the action button while pending; on success toast (e.g. "Job #261113-03 accepted.", "You took job #…", "Job #… is ready for pickup.", "Work order #… saved.") and invalidate.
- Every write RPC receives `p_session` from the session store.
- Parse RPC responses with zod at the boundary; on a parse failure log to console and show the generic error.

---

## 9. Formatting rules (`src/lib/format.ts`)

- Phone: `(416) 555-0142`; masked on kiosk: `(•••) •••-0142`.
- Plate: `ABCD 123` when 4 letters + 3 digits, else as stored.
- Money: `toLocaleString('en-CA', {style:'currency', currency:'CAD'})`.
- Distance: `52,870 km`.
- Dates: `Nov 13, 2026`; times `9:12 a.m.` (`en-CA`); relative "12 min ago", "yesterday".
- Masked name: first name + last initial ("Priya S.").

---

## 10. Error messages

| code (backend or API) | message shown |
|---|---|
| NOT_STAFF | This Google account isn't set up as staff. Ask the shop owner to add you. |
| SESSION_EXPIRED | Signed out at midnight. Sign in to start the day. |
| SESSION_INVALID | This device was signed out. Sign in again. |
| ROLE_NOT_ALLOWED | Your role can't do that. |
| QUICK_SWITCH_NOT_ALLOWED | Sign out and sign in again to use this role. |
| PIN_INVALID | Wrong PIN. |
| PIN_LOCKED | Too many tries. Wait {detail} seconds. |
| PIN_NOT_SET | Set a PIN first. |
| VALIDATION | Check the {field} field. (map field names to labels) |
| NOT_FOUND | No job found for “{query}”. (scanner) / That record no longer exists. |
| PLATE_TAKEN | Another vehicle already has plate {plate}. |
| PHONE_TAKEN | That phone number already belongs to a customer with this name. |
| EMAIL_TAKEN | Another staff member already uses that email. |
| VERSION_CONFLICT | Someone else changed this job. Reload to see the latest version. |
| INVALID_TRANSITION | This job has already moved on. Refreshing. (then refetch) |
| LAST_ADMIN | Keep at least one active administrator. |
| SELF_DEACTIVATE | You can't deactivate your own account. |
| NOT_CURRENT_OWNER | This customer isn't a current owner of the vehicle. |
| RATE_LIMITED (API) | Too many requests just now. Wait a minute and try again, or fill in the form below. |
| NOT_UNDERSTOOD (API) | We couldn't find a vehicle problem in that. Add a little more detail, or fill in the form below. |
| AI_UNAVAILABLE / network | We couldn't read that. Try again, or fill in the form below. |
| anything else | Something went wrong. Try again. (log details to console) |

---

## 11. Local development and tests

- `npm run dev`: Vite on `http://localhost:5173` using `public/config.json`.
- Local stack for development and e2e (documented in README, wrapped by `npm run dev:stack`):
  1. `backend`: `npx supabase start && npx supabase db reset` (applies migrations + seed).
  2. `backend`: `npx tsx scripts/dev-token-server.ts` (port 8787).
  3. `frontend`: `npx tsx scripts/mock-intake-server.ts` (port 8788): implements both intake endpoints with deterministic canned answers (keyword based: "brake" → unsafe brake concern; "pull" → pulling concern; registration text parsed with simple regexes), checks for a bearer token, supports `?fail=1` to return 502.
  4. `public/config.json` in dev: `authMode: "dev"`, local Supabase URL and anon key, `apiUrl: "http://localhost:8788"`, `devStaffEmails` = the three seeded staff.

**Unit tests (Vitest):** normalisers and formatters; totals; YearMakeModel catalog matching and aliases; kiosk reducer transitions; error mapping; quick-switch decision helper; session expiry scheduling (fake timers).

**End-to-end (Playwright, Chromium, against the local stack):**

1. Single-role user (Sam) signs in → lands on `/workshop` without the role picker.
2. Multi-role owner → role picker → Administrator; quick switch to Front desk works; Kiosk shows "Sign out and sign in again to use this role".
3. Kiosk (Ana): phone `416 555 0142` → choose CR-V → VoiceBox text → "Fill in the form for me" fills concerns (mock) → sign (mouse drawing) → agree → done screen shows an order number.
4. Kiosk new customer with Year/Make/Model dropdowns and "Not listed" make → check-in succeeds.
5. Kiosk plate `BXRT552` → "I'm not listed" → "I bought this vehicle" → front desk sees "Owner to verify".
6. Front desk (second browser context) sees the new arrival within 5 s without reload; accepts it; Job tag dialog shows a QR whose decoded value is `WO:<id>`.
7. Workshop: open job via typed job number and via photo upload of the tag screenshot (jsqr) → Take job → Work complete; the event log shows both steps with names.
8. Display: shows the job with masked name; status changes within 5 s of the workshop action.
9. Kiosk lock: "Staff" → wrong PIN → "Wrong PIN." → correct PIN → Sign out.
10. Admin: add staff with roles and quick switch; warning appears when Kiosk is ticked; removing admin from the only admin shows "Keep at least one active administrator."
11. Version conflict: two contexts edit the same job; the second save shows the conflict bar.
12. Accessibility: axe on login, role picker, each kiosk step, desk arrivals, job drawer, workshop, display, admin: **no serious or critical violations**.
13. Screenshots for review saved to `e2e/screenshots/`: kiosk 820×1180, desk 1280×800, workshop 390×844, display 1920×1080, in light and dark where relevant.

---

## 12. Build and deployment

- `npm run build` → `dist/` (hashed assets). `config.json` is **not** bundled; it is uploaded separately.
- `npm run deploy` (`scripts/deploy.ts`):
  1. Read `../backend/infra/cdk-outputs.json` for `WebBucketName` and `DistributionId`.
  2. `npm run build`.
  3. Upload `dist/` to the bucket (`--delete`, excluding `config.json`), assets with `Cache-Control: public,max-age=31536000,immutable`, `index.html` with `no-cache`.
  4. Upload `public/config.json` (the **cognito** one written by the backend script) with `no-cache`. Refuse to deploy a config whose `authMode` is `dev`.
  5. CloudFront invalidation for `/index.html` and `/config.json`.
- HUMAN: after the first deploy, sign in on the CloudFront URL with the owner's Google account and confirm the role picker appears.

---

## 13. Build phases

### Phase 1: Scaffold, config, auth, sessions
Vite + React + TS app, lint/format, tokens and base styles, `loadConfig`, auth adapters, Supabase client, AuthProvider, login page, callback page, boot sequence, role picker, PIN set-up, session store, role guard, top bar, switch-role dialog, sign out, midnight expiry.
**Verify:** unit tests pass; e2e scenarios 1, 2 pass against the local stack.

### Phase 2: Shared components and data layer
PlateChip, StatusPill, UrgencyPill, Drawer (with unsaved-changes bar), Dialog, Toast, Tabs, Tile, Chip, Field, TotalsBox, EventLog, Clock, QrCode; `rpc.ts` wrappers for every backend RPC with zod parsing; error mapping; realtime module.
**Verify:** component tests for PlateChip formatting, TotalsBox maths (HST 13%), Drawer unsaved-changes behaviour.

### Phase 3: Kiosk
Step machine, YearMakeModel, SignaturePad, VoiceBox (Web Speech + intake API), inactivity reset, done screen, Staff PIN lock.
**Verify:** e2e 3, 4, 5, 9 pass; kiosk screenshots look like the prototype.

### Phase 4: Front desk
Arrivals, Jobs board, Find, Customers, Vehicles, Job drawer, Vehicle drawer, Customer drawer, Job tag dialog with print stylesheet.
**Verify:** e2e 6 and 11 pass; printing preview (Playwright `page.pdf()` of the tag) shows only the tag.

### Phase 5: Workshop
QrScanner (BarcodeDetector → jsqr fallback → photo → typed number), lists, job actions, phone layout.
**Verify:** e2e 7 passes; manual check on a phone is listed in README as a HUMAN step.

### Phase 6: Display panel
Board, broadcast subscription, fallback polling, auto-scroll, wake lock, full screen.
**Verify:** e2e 8 passes; screenshot at 1920×1080.

### Phase 7: Administrator
Staff & roles, Staff drawer, Shop settings, change PIN, admin job cancel.
**Verify:** e2e 10 passes.

### Phase 8: Quality pass and deploy
Accessibility fixes (e2e 12), responsive checks, screenshots (e2e 13), README (run, test, deploy, device set-up checklist: kiosk tablet in guided-access/kiosk mode, display TV browser full screen, camera and microphone permissions), deploy to S3/CloudFront.
**Verify:** all unit and e2e tests green; `npm run deploy` succeeds; HUMAN sign-in on the CloudFront URL works.

---

## 14. Acceptance criteria (frontend done)

1. A customer can check in at the kiosk by phone or plate in under 2 minutes, including typing or speaking the problem and signing, without seeing other customers' details.
2. The front desk sees new check-ins live, accepts them after receiving keys, and prints a QR job tag.
3. A technician opens a job by scanning the tag (or typing the number), takes it, records parts/labour, and completes it from a phone.
4. The waiting-room display updates within 5 seconds of any status change and shows only masked names.
5. Changing role requires sign-out unless the admin allowed that quick switch; kiosk and display can only be left with a staff PIN.
6. Sessions end at local midnight on every device.
7. Every screen matches the prototype's look, works on its target device size, and passes the accessibility check.
8. The app is served from S3 through CloudFront over HTTPS with runtime config from `/config.json`.
