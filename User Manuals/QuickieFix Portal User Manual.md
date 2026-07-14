# QuickieFix — Business Portal User Manual

**The web portal: company administration and the platform back office.**

| | |
|---|---|
| **Applies to** | QuickieFix Business Portal (web) |
| **Portal URL** | https://portal.quickiefix.app |
| **Audience** | Company admins · Platform (back-office) admins |
| **Document version** | 1.0 · July 2026 |

---

## Contents

**Part A — Getting in**
1. [Signing in and who sees what](#1-signing-in-and-who-sees-what)

**Part B — Company admin portal**
2. [Dashboard](#2-dashboard)
3. [My Tradies](#3-my-tradies)
4. [Tradie detail page](#4-tradie-detail-page)
5. [Settings](#5-settings)

**Part C — Platform back office**
6. [Back-office overview](#6-back-office-overview)
7. [Operations: Overview, Jobs, Tag queue, Complaints](#7-operations-overview-jobs-tag-queue-complaints)
8. [People: Tradies, Companies, Customers](#8-people-tradies-companies-customers)
9. [Platform: Billing, Metrics, Waitlist](#9-platform-billing-metrics-waitlist)

**Part D — Reference**
10. [Status and badge reference](#10-status-and-badge-reference)
11. [Troubleshooting & FAQ](#11-troubleshooting--faq)

---

# Part A — Getting in

## 1. Signing in and who sees what

Open **https://portal.quickiefix.app** in any modern browser.

The portal serves two audiences from the same login page — your email decides where you land:

| You are | You see |
|---|---|
| **Company admin** (any registered business) | The company portal: Dashboard · My Tradies · Settings |
| **Platform admin** (email on the QuickieFix admin allowlist, e.g. `admin@quickiefix.store`) | The full back office |

**New company?** Click **"Create your company"**: Company name → Your name → Email → Password (min 6 characters) → **Create company**.

**Returning?** **Sign in** with email and password.

![The Business Portal sign-in page](images/portal-signin.png)
*The Business Portal sign-in page.*

---

# Part B — Company admin portal

*(For the complete business playbook — onboarding strategy, money model, tradie experience — see the **Company User Manual**. This part is the screen-by-screen portal reference.)*

## 2. Dashboard

Your team at a glance.

**KPI cards:**
- **Tradies** — validated roster size
- **Completed jobs** — team total
- **Avg rating** — team average (0.0–5.0)
- **Time on site** — aggregate on-site hours

**Team performance table:** one row per tradie — name, trade, jobs, ★ rating, time on site, approval status. **Click a row** to open their detail page.

Empty state ("No tradies yet") links straight to **Add tradies**.

![The company Dashboard](images/portal-dashboard.png)
*The Dashboard — KPI cards and the team performance panel.*

## 3. My Tradies

Your roster and onboarding hub. Four sections:

### 3.1 Tradies in {Company} — the roster
Every **validated** tradie: name, trade, email.

### 3.2 Add a seat
Issue a single tag:

1. **Name** + **Email** (required — must match the tradie's app account), **Phone** (optional).
2. **Add seat** → a code like **`QF-7K2P9M`** appears with **Copy code**.
3. *"Send this code to the tradie. It expires in 14 days."*

The tradie claims it in their app (**Profile → Company → Claim seat**); a platform admin then validates it.

![My Tradies — roster, seats and CSV import](images/portal-mytradies.png)
*My Tradies — the roster, Add a seat, and spreadsheet import.*

### 3.3 Import from a spreadsheet
Bulk onboarding:

1. **Download template** — columns: `firstName, lastName, email, businessName, primaryTrade, secondaryTrades, yearsExperience, licenceNumber`.
2. **Choose CSV file** → preview shows **"{X} ready · {Y} with issues"** with per-row error chips (Missing name / Invalid email / Unknown trade).
3. **Import X tradie(s)** → progress ("Creating accounts & sending emails…") → results list per email.

Imported tradies get an account, a **pre-validated tag** (no claiming step) and a **welcome email** with a temporary password and the app download button.

### 3.4 Tags — full history
Every code ever issued: **Code · Issued to · Status · Actions**.

- 🟡 **issued** → **Copy code** available
- 🔵 **claimed** → awaiting platform validation
- 🟢 **validated** → on the roster
- ⚪ **removed** → shows the removal reason

**Remove** (with confirmation) revokes a seat at any stage.

## 4. Tradie detail page

Click any roster row. Shows:

- Header: name, business name, trade, years, approval badge
- KPIs: **Completed jobs · ★ rating ({n} reviews) · Total time on site · Total job time**
- **Job history table**: customer, address, completed date, on-site duration, per-job rating
- **Customer reviews**: stars, date, review text and tags, verbatim

Use it for quality control, dispute context and performance reviews.

## 5. Settings

- **Rate card** — hourly rate (required), callout fee, after-hours callout. First save shows **"Save & go live"**: your company flips from **Setup** to **Active** and your rates apply to every tagged tradie's future jobs.
- **Company profile** — company name, **billing email**.
- **Account** — admin email + Company ID (quote in support requests).
- **Log out**.

![Settings — rate card and company profile](images/portal-settings.png)
*Settings — rate card, company profile and account.*

---

# Part C — Platform back office

*Access requires an allowlisted platform-admin email. This is mission control for the whole marketplace.*

## 6. Back-office overview

**Sidebar navigation:**

| Group | Tabs |
|---|---|
| **Operations** | Overview · Jobs · Tag queue · Complaints |
| **People** | Tradies · Companies · Customers |
| **Platform** | Billing · Metrics · Waitlist |

The admin card at the bottom shows your identity and **Log out**.

## 7. Operations: Overview, Jobs, Tag queue, Complaints

### Overview
- **KPIs** (all clickable): Total jobs · Completed · **Active now** (live dot) · Tradies
- **Needs attention** — three cards that turn red when non-zero: **Pending approvals**, **Tag queue**, **Open complaints**. This is your daily to-do list.
- **Recent jobs** — last 10 with status chips.

### Jobs
Full job browser. Filters: **All · Completed · Searching · Cancelled**. Columns: Trade · Customer · Tradie · Created · On-site duration · Status chip.

### Tag queue
The company-seat validation desk. For each **claimed** tag: code, company, who it was issued to, and which tradie claimed it.

**Workflow:** verify the issued name/email matches the claiming tradie → click **Validate**. The tradie is bound to the company (their jobs now carry company branding and rates). Empty state: *"✅ Nothing to validate."*

### Complaints
One card per complaint: subject, status badge, date, full detail, and the parties (*Trade · Customer → Tradie*). Click **Mark resolved** when handled. Empty state: *"✅ No complaints."*

## 8. People: Tradies, Companies, Customers

### Tradies
The master roster with filters **All · Pending · Approved**. Per row: tradie, trade, company, rating, **credits (inline-editable)**, status — and the action buttons:

| Button | Effect |
|---|---|
| **Approve** | Verifies a pending tradie — they can now receive jobs. Check licence details first; regulated trades must carry a licence number. |
| **Hold / Reinstate** | Pauses/resumes dispatch for non-payment. The tradie sees "⏸️ Dispatch paused" in their app. Use after billing terms are exhausted. |
| **Suspend / Reject** | Removes an approved tradie from dispatch (conduct), or declines an application. |
| **Credits → Save** | Adjust their free-job credit balance inline. |

### Companies
Every registered business: name, admin/billing email, **Setup/Active** status, rate card, and **shared credits (inline-editable)** — load a company's free-job pool here.

### Customers
Directory: name, email, jobs requested, joined date.

## 9. Platform: Billing, Metrics, Waitlist

### Billing
The monthly invoicing run sheet. Pick a month (YYYY-MM tabs) → see **"{X} payers · ${total} total"** and per-payer rows: **Payer · Billable jobs · Free (waived) · Total**.

> *"Invoicing happens off-app. This is the run sheet: raise one invoice per payer from these totals (7-day terms), then use the Hold button on the Tradies tab for sustained non-payment."*

**⬇ Export CSV** produces the invoice-ready file. Fee lifecycle: `waived_credit → pending → invoiced → paid`.

### Metrics
The four pilot performance gates, computed from live job data:

| Gate | Target |
|---|---|
| Median time-to-accept | < 5 min |
| Median time-to-arrival | < 45 min |
| Jobs per tradie / week | ≥ 1.5 |
| No-tradie-found rate (emergency) | < 10% |

Each shows PASS (green) / watch (amber) / no data. The pilot must sustain these for 4+ weeks.

### Waitlist
Landing-page signups: email, customer/tradie role badge, joined date, source — with **⬇ Export CSV** for launch campaigns.

---

# Part D — Reference

## 10. Status and badge reference

**Tradie approval:** 🟡 pending → 🟢 approved · ⚪ rejected · ⚪ suspended (+ red **on hold** badge when dispatch is paused)

**Tag/seat:** 🟡 issued → 🔵 claimed → 🟢 validated → ⚪ removed

**Company:** 🟡 Setup (no rate card) → 🟢 Active

**Job status chips:** searching (grey) → confirmed (blue) → travelling / on_site (amber) → completed (green) · cancelled (red) · no_tradie_found (red outline)

**Fee status:** waived_credit · pending · invoiced · paid

## 11. Troubleshooting & FAQ

**I created a company but tradies' jobs don't show our brand.**
Three gates: (1) your **rate card is saved** (status Active), (2) the tradie's tag is **validated** (not just claimed — check the Tag queue), (3) the job was accepted *after* validation. Historical jobs never re-stamp.

**A tag has sat in "claimed" for days.**
Only a platform admin can validate. Platform admins: Tag queue → verify identity match → **Validate**. If the claiming account's details don't match the issued seat, remove the tag and issue a fresh one with correct details.

**A tradie says they get no jobs.**
Back office → Tradies: confirm **approved**, not **on hold**, and credits/radius sane. Then check the app side: are they toggled Available?

**Numbers on Dashboard look behind.**
Portal data is live from the same database as the apps; a hard refresh (Ctrl+F5) rebuilds the view after profile changes.

**Who can access the back office?**
Only emails on the QuickieFix platform-admin allowlist. Adding an admin is a configuration change made by the QuickieFix engineering owner — email accounts alone can never elevate themselves.

**Can I run the portal on my phone?**
It's built for desktop browsers; it works on tablets. Day-to-day tradie work belongs in the app, not the portal.

---

*QuickieFix · On-demand, verified tradies · quickiefix.app*
