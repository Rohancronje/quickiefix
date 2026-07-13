# QuickieFix — Pilot Specification (v0)

**Version 0.9 — July 2026**
**Supersedes the Master Specification as the active build target. The Master Spec remains the Phase 2 blueprint — nothing in it is discarded, only deferred.**

---

## 0. What the pilot must prove

> *"A tenant or homeowner reported an urgent issue, the right tradie accepted within minutes, arrived fast, and the payer had a clean record of what happened — and tradies paid the platform fee without a fight."*

Every scope decision below is tested against that sentence. The pilot runs in **one Auckland North Shore suburb cluster**, three trades (**plumbing, electrical, locksmith**), with a hand-recruited supply pool. Founder acts as concierge dispatcher of last resort behind the scenes.

**Build target: 6–8 weeks.**

---

## 1. Scope summary — in / out

| In (v0) | Out (deferred to Master Spec / Phase 2) |
|---|---|
| Auth (email+password, verification) | Social login |
| Customer + tradie onboarding, admin approval queue | Stripe SetupIntent / card-on-file / any card charging |
| **Company (multi-tradie business) accounts — tag model + read-only portal** (§6) | Company portal write features beyond roster/profile; job-management integrations |
| Trades, qualifications upload + manual verification | Automated licence-register checks |
| Availability toggle | Availability scheduling/rosters in-app |
| Job creation (photos, GPS/manual location, now/scheduled, geofence) | AI triage |
| Wave dispatch, atomic first-accept | Dispatch tuning UI (constants in config) |
| Accept → customer confirm with **rate display** | — |
| **Manual status buttons with server timestamps** (On my way / Arrived / Complete) | Auto-geofence arrival detection, live map tracking |
| In-app job messaging with contact-detail masking | — |
| Completed-job-only reviews (both directions) | — |
| **Fee ledger + free-job credits** (§5) — informational tally only | Any billing or payment functionality in the app (invoice generation, cards, collection, dunning), Stripe Connect, payer in-app payment — indefinitely deferred |
| Monthly billing export CSV + **manual admin payment_hold toggle** | Automated dunning or timer-based suspension |
| Property entity **light**: landlord claims property, links tenant, gets job visibility + emailed job record | Approval thresholds/queues, agency NET-7 billing module, audit-bundle PDF generator (job record email is a formatted summary, assembled from existing data) |
| Bare admin console: tradie approvals, live job list with emergency alert, credit checkbox, user suspend | Dispute workflow module (disputes = email/phone to founder; evidence already exists in threads + timestamps) |
| Metrics events on every status transition + dispatch attempt | Dashboards beyond a simple admin metrics page |

Rate snapshot at acceptance **stays** (it is the invoice-dispute baseline and costs almost nothing). CSV timesheet export **stays** (trivial, tradies value it).

---

## 2. Roles (v0)

- **Customer** — consumer, tenant, or landlord. Landlords can claim properties and link tenants (light version: visibility + payer-of-record on the job, no approval gating in v0 — every job dispatches immediately; landlord gets notified + emailed the job record).
- **Tradie** — individual. May be **independent** or **belong to a Company** (§6).
- **Company admin** — owner/office manager of a multi-tradie business. No separate portal in v0; interacts via a company summary email + founder support. Company-level data model ships now so nothing needs migrating later.
- **Admin** — founder.

---

## 3. Job lifecycle (v0)

```
draft → searching → accepted → confirmed → travelling → on_site → completed
searching → no_tradie_found (admin alert; founder concierge-rescues)
any pre-completion → cancelled (reason required)
```

- No `pending_approval` state in v0 (property approval rules are Phase 2). Property jobs notify the landlord at creation and completion instead.
- Confirmation: emergency-category jobs auto-confirm after 3 minutes; standard jobs 10-minute explicit window.
- `travelling` / `on_site` set by tradie buttons; every transition = server timestamp + AuditEvent + system message in thread. **These timestamps are the arrival-time metric and the committed-rate duration baseline — they are not optional.**

---

## 4. Dispatch (v0)

Unchanged from Master Spec §6.3 in logic, hard-coded constants in config:
- Candidates: approved + available + trade match + valid qualification + in radius + not previously pinged this job + **not on payment_hold** (§5.4).
- Order: proximity, then rating, then response rate. Never price.
- Waves: 3 → +5 at 90 s → all remaining at 180 s → `no_tradie_found` → push/SMS alert to founder for concierge rescue.
- Suburb-level location before acceptance; exact address on confirmation.

---

## 5. Money (v0) — fee ledger, free credits, monthly arrears

### 5.1 The deal (signed at onboarding, in the terms)

- **$15 + GST per completed job.** Nothing on cancelled/declined/no-tradie-found jobs.
- **First 5 completed jobs free** (founding-member credit — see 5.2).
- Invoiced monthly in arrears (externally, by QuickieFix — invoicing method is the founder's business, outside the app); 7-day terms; sustained non-payment may result in suspension from dispatch.
- **The app contains no billing or payment functionality** — no invoice generation, no card details, no payment collection. It records jobs, timestamps, and the fee tally; all money movement happens outside the app. Tradies and companies invoice their customers through their own existing billing procedures.

### 5.2 Free-job credits

- `TradieProfile.freeJobCredits` (integer, default **5** on approval).
- **Admin console: a per-tradie credit control** — checkbox "Founding member credits" applying the default 5, plus an editable number field so the founder can grant more (e.g., a company negotiation, a goodwill gesture after a bad experience). Every change writes an AuditEvent with reason.
- On job completion: if credits > 0 → decrement, write FeeLineItem with `amountCents: 1500, status: waived_credit`; else → `status: pending`.
- Credits never expire in v0; they are per-tradie (for company tradies see §6.4).

### 5.3 Fee ledger (in-app, day one)

Tradie dashboard shows a running money panel:
> *"This month: 7 completed jobs — 2 free credits used, 5 billable = $75.00 + GST ($86.25). Invoice arrives on the 1st. Free credits remaining: 0."*

No surprise invoices. The ledger view is generated from FeeLineItems; the same data later drives automated charging with zero migration.

### 5.4 Billing (fully off-app)

- 1st of month: founder runs the **monthly billing export** (admin console → CSV per payer, derived from FeeLineItems) and invoices tradies/companies through whatever means he chooses (§6.5). All invoicing, reminders, and collections activity happens outside the app.
- **The app's only enforcement surface is a manual admin toggle:** founder can set any tradie (or a whole company's tagged roster) to `payment_hold` — excluded from dispatch until cleared. This is an access-control lever, used at founder discretion for sustained non-payment; there is no automated dunning, no in-app overdue banners, no timer-driven suspension.
- Working guideline (founder's head, not code): pause dispatch if an unpaid balance ages past ~3 weeks or exceeds ~$200. Reinstatement is immediate once the founder confirms payment.

### 5.5 Payer side (v0)

No payer billing of any kind. Tradies invoice customers/landlords directly at their displayed rates through their own billing procedures (committed-rate rule applies; rate snapshot + status timestamps are the dispute evidence). If a pilot agency deal requires a platform fee to the payer, the founder invoices it manually — outside the app entirely.

---

## 6. Company accounts — the tag model (multi-tradie businesses, e.g. franchise plumbing firms)

**Design principle: the individual tradie is always the unit; the company is a tag, not a container.** The tradie accepts, works, toggles availability, and earns ratings exactly as an independent does. The tag associates his jobs with a company for branding, reporting, and billing. Availability and on-call rostering are the company's off-app HR business — the platform never manages them.

### 6.1 Data model

**Company:** `id, name, tradingName?, nzbn, logoUrl?, billingEmail, adminUserIds[], rateCard { hourlyRateCents, calloutFeeCents?, afterHoursCalloutFeeCents? } (required before company goes live), sharedCredits (int, default 0), status`
**CompanyTag:** `id, companyId, code (single-use, random, expires 14 days after issue), issuedToName, issuedToEmail, issuedToPhone, status (issued | claimed | validated | removed), claimedByUserId?, claimedAt?, validatedAt?, removedAt?, removedBy? (company | platform_admin), removalReason?`
**TradieProfile** gains: `activeTagId?` (nullable — null = independent).
**Job** gains: `companyId?` — **stamped at acceptance** from the tradie's validated tag at that moment; immutable thereafter.

### 6.2 Tag lifecycle

1. **Issue** — company admin (portal) or platform admin adds a tradie seat: name, email, phone. System generates a single-use code and emails it to the tradie. Code expires unclaimed after 14 days (re-issuable).
2. **Claim** — tradie enters the code in the app (onboarding step or profile).
3. **Validate** — platform admin confirms the claiming account's name, email, and phone match what the company loaded. On validation the tag shows **green** in the tradie's app and becomes **read-only to the tradie** — he cannot edit or remove it himself.
4. **Remove** — **only the company admin can remove the tag** (leaver, contract ended). The tradie is notified, reverts to his personal rate card, and is blocked from going Available until a personal rate card exists. His rating and review history are untouched — they were always his.
5. **Platform-admin override (required escape hatch)** — the founder can remove any tag with a mandatory reason + AuditEvent. Covers: company defunct/unresponsive, hostile separation where the company refuses removal, or error. Without this, a tradie could be permanently trapped under a brand he has left.

Every issue/claim/validate/remove writes an AuditEvent — the "who was tagged when" history is provable, and billing depends on it.

**Anti-gaming note:** tradie-side immutability means a tradie cannot untag to escape a company payment_hold (closes that loophole); the flip side is the override in step 5, which prevents the rule from becoming a trap.

### 6.3 Rules while tagged

- **Qualifications remain individual.** Every tradie in a regulated trade needs his own approved licence — tag membership is never a licence shortcut.
- **Dispatch remains individual.** Pings go to the tradie's phone exactly as for independents; no dispatcher-assignment hop (it would break the speed promise). The tradie alone controls his availability toggle.
- **Rate card is company-controlled, always.** Every company must set a rate card (required at company creation — a company cannot go live without one). While tagged, the tradie's rate card **editor is locked read-only in his app**, displaying the company rates with the note "Rates are managed by {Company}." His personal rate card is retained in storage but inactive. On tag removal the personal card resumes; if none exists (or the tradie wants to revise it), he sets one before he can go Available. The job's rate snapshot always records whichever card was in force at acceptance.
- **Reviews and ratings belong to the individual** — earned on his own service, retained for life, unaffected by joining or leaving. The company displays a derived aggregate computed from **jobs stamped with its companyId** ("Part of {Company} — ★4.8 across 214 jobs" on the acceptance card). Stamping — not current membership — drives all company history, so a leaver's past jobs stay in the company's record (they happened under its tag) without following him forward.
- **Customer view at acceptance:** tradie name + photo, company name/logo, applicable rate card, tradie rating + company aggregate.

### 6.4 Company portal (v0 — read-only over jobs, write only on roster/company data)

Ships in the first build (Next.js, same stack as admin console; largely existing report queries grouped by company):

- **Combined jobs report** — every tradie's jobs with the tradie's name against each: statuses, timestamps, durations, ratings. Same data as the individual in-app reports, unioned. Filter by tradie/date/status; CSV export.
- **Roster view + seat management** — current tagged tradies, pending codes; **add seat** (issues a tag code), **update seat details**, **remove tag**. This is the portal's entire write surface for people.
- **Company profile management** — logo, billing email, rate card.
- **Fee tally** — current-month billable jobs and running total (mirrors the tradie ledger, §5.3), invoice history.
- **Live availability view** of tagged tradies — visibility only; no control.
- Strictly **no** job mutations, no availability control, no dispatch involvement.
- Optional company setting: **forward job details by email on confirmation** — lets their office see QuickieFix jobs land in the ops system they already watch. Deep job-management integrations are Phase 3.

### 6.5 Company billing (off-app) & credits

- One monthly invoice per company (raised externally by the founder from the billing export, through whatever invoicing method he uses) covering all jobs **stamped** with its companyId that month, line-itemised per tradie. Stamping makes mid-month leavers automatic: jobs before tag removal bill to the company, jobs after bill to the individual. The company portal shows the running $ tally only — no invoices or payment features in-app.
- Sustained non-payment: founder may manually set the company's tagged roster to `payment_hold` (§5.4) — stated plainly in the company agreement: the company's payment behaviour gates its team's access. The debt remains the company's regardless of subsequent tag changes.
- Credits: `Company.sharedCredits` pool consumed before per-tradie credits for tagged tradies' jobs. Founder sets per negotiation (e.g., 25 shared credits for a 10-tradie firm). Admin console exposes both controls.

### 6.6 Two eyes-open cautions (operational, not build)

1. **Leakage risk is higher with companies.** A firm with its own brand, van signage, and invoicing has more machinery for converting a QuickieFix customer into a direct customer. Mitigations: comms masking, on-platform reviews, the founding relationship, repeat-pair leakage flags. Accept some leakage as the cost of instant supply density.
2. **Validation is manual on purpose.** The phone/email match check (6.2 step 3) is founder work per seat. At pilot scale that's minutes; it's what stops a forwarded code email letting a stranger wear a company's badge. Automate later, not now.

---

## 7. Everything else

Notifications, comms masking, review mechanics, geofenced launch area, trust & safety screens (111 first for danger-to-life), CSV timesheets, metrics events, NZ Privacy Act handling — all as per Master Specification, unchanged. Admin console is reduced to: approval queue, live job list + emergency alerts, credit controls, suspend, billing export, basic metrics page.

---

## 8. Pilot success gates (before Phase 2 build begins)

1. Median accept < 5 min and median arrival < 45 min sustained over 4+ weeks.
2. ≥ 1.5 jobs/tradie/week average across the active pool.
3. Month-2 invoices (post-credits) paid by ≥ 90% of billable tradies without the founder having to chase beyond a routine reminder.
4. At least one company account and one landlord/agency relationship generating repeat jobs.
5. no_tradie_found rate < 10% on emergency-category jobs (concierge rescues included in the count — they're a symptom, not a save).

Hit these, then build the Master Spec's Phase 1.5/2 (approval rules, audit bundles, agency billing, Stripe). Miss them, and the pilot has done its job for a fraction of the cost.
