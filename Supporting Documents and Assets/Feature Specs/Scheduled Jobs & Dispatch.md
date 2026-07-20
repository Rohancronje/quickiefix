# Feature Spec — Scheduled Jobs & Tradie Dispatch

**Status:** Draft for build · **Owner:** Rohan · **Project:** `quickiefix-2ea2a`
**Scope:** In-app scheduling for non-emergency jobs, reminder + departure flow, progressive address disclosure, no-show catch. **No Google Calendar, no live GPS tracking, no traffic API** — everything runs in-app on scheduled push + tradie action.

---

## 1. Why this exists
Most property-manager maintenance isn't an emergency — it's "sometime Thursday." QuickieFix already handles on-demand (post → match → on the way). This adds the **scheduled** path: a job with an agreed date/time, in-app reminders leading up to it, and a clean tradie-initiated departure that reveals the exact address and notifies the tenant.

The design deliberately avoids live location tracking and traffic-ETA logic. Tradies know their own patch and traffic; we nudge, they judge. Reliability comes from **acknowledgement + a deadline check**, not from surveillance.

---

## 2. Two job modes (one shared en-route flow)
| Mode | Trigger | Address reveal |
|---|---|---|
| **On-demand** (existing) | Client posts now, tradie accepts | On accept / go |
| **Scheduled** (this spec) | Job has an agreed `scheduledStartAt` | Suburb-only until "Go now" |

Both converge on the **same en-route state machine** once the tradie taps **Go now**. Don't fork the "on the way" code — the scheduled path just gates *when* Go now becomes the expected action.

---

## 3. Job state machine
```
scheduled
   │  (T-2h push, "Confirm you'll attend")
   ▼
confirmed ──(no confirm by T-1h)──► at_risk ──► [PM notified]
   │  (T-1h push, "Job soon")
   ▼
due  ──(no "Go now" by T-0 + grace)──► no_show_risk ──► [PM notified / reassign]
   │  (tradie taps "Go now" → full address revealed + tenant notified)
   ▼
en_route ──► arrived ──► in_progress ──► complete
                                   └────► cancelled (any time, by tenant/PM)
```
- `at_risk` and `no_show_risk` are **flags for the PM/desk**, not dead ends — the tradie can still confirm/depart and move forward.
- `cancelled` / `rescheduled` can occur from any pre-`arrived` state and must cancel pending Cloud Tasks.

---

## 4. Firestore data model
Extend the existing `jobs/{jobId}` document:

```
jobs/{jobId} {
  mode: "scheduled" | "on_demand",
  status: "scheduled" | "confirmed" | "at_risk" | "due" |
          "no_show_risk" | "en_route" | "arrived" | "in_progress" |
          "complete" | "cancelled",

  scheduledStartAt: Timestamp,        // agreed appointment time (UTC)
  timezone: "Pacific/Auckland",       // display only; store UTC

  // progressive address
  address: {
    suburb: string,                   // shown pre-departure
    street: string,                   // shown pre-departure (street name only)
    streetNumber: string,             // REVEALED on Go now
    unit: string | null,             // REVEALED on Go now
    accessNotes: string | null,      // gate codes etc — REVEALED on Go now
    lat: number, lng: number          // REVEALED on Go now (for maps handoff)
  },
  addressRevealedAt: Timestamp | null,

  // dispatch lifecycle
  assignedTradieId: string,
  confirmedAttendanceAt: Timestamp | null,
  goNowAt: Timestamp | null,
  arrivedAt: Timestamp | null,

  // scheduled triggers (for cancellation)
  tasks: {
    remindT2h: string | null,        // Cloud Task name
    remindT1h: string | null,
    deadlineCheck: string | null
  },

  // reminders / audit
  reminderLog: [ { type, sentAt, acknowledged } ],
  propertyManagerId: string,          // for escalation
  tenantId: string
}
```

**Reminder lead times are dynamic, not hardcoded.** Default 2h / 1h, but allow per-job override (a parts-pickup job may want 3h). Store the resolved offsets on the job when it's scheduled.

---

## 5. Trigger sequence (all in-app)
When a job is scheduled, the server enqueues **three Cloud Tasks** at absolute future timestamps (Cloud Tasks fires a single task at an exact time — more precise than a cron sweep):

| Task | Fires at | Action |
|---|---|---|
| `remindT2h` | `scheduledStartAt − 2h` | Push: **"Job at [time] today — confirm you'll attend."** In-app CTA → sets `confirmedAttendanceAt`, status → `confirmed`. |
| `remindT1h` | `scheduledStartAt − 1h` | Push: **"Your [suburb] job starts in 1 hour."** If still unconfirmed → status `at_risk`, notify PM. |
| `deadlineCheck` | `scheduledStartAt + grace` (e.g. +10 min) | If no `goNowAt` yet → status `no_show_risk`, push tradie **"Are you on your way?"** and notify PM/desk for reassignment. |

- **In-app is the source of truth.** The scheduled job list always shows upcoming jobs with a live countdown, so a dropped push never means a missed job. Push is the nudge; the list is the backstop.
- Cancelling/rescheduling a job must **delete the pending tasks** by name (stored in `job.tasks`).
- All timing computed and enforced **server-side** — never trust the device clock or app-open state.

---

## 6. "Confirm you'll attend"
- Appears on the **T-2h push** and as a banner on the job card.
- One tap → `confirmedAttendanceAt` set, status → `confirmed`.
- If **not** confirmed by T-1h → status `at_risk` + PM notified, so a quiet tradie is caught with an hour of runway to reassign.
- Confirmation is *attendance intent*, not departure — it does **not** reveal the address or notify the tenant.

---

## 7. "Go now" + progressive address disclosure
- **Before Go now:** tradie sees **street name + suburb** only (enough to gauge distance/parking), plus job details, no exact number.
- **Tapping "Go now":**
  1. Reveal `streetNumber`, `unit`, `accessNotes`, `lat/lng` (maps handoff enabled).
  2. Set `goNowAt`, `addressRevealedAt`, status → `en_route`.
  3. Fire the **existing "tradie on the way" tenant notification** — reuse the on-demand flow verbatim.
- Go now is available **any time** (tradie can leave early); it's the expected action from T-1h onward.
- Tenant is only told someone's coming **on Go now** — never on a timer — so an ignored reminder never produces a phantom "on the way."

---

## 8. Tenant / PM experience
- **Tenant:** gets "[Trade] booked for [date/time]" on scheduling, an optional day-before "still good for [time]?" confirm (cuts no-access failures — *Phase 2*), and the standard "on the way" on Go now.
- **PM:** sees every scheduled job and its status live; receives escalation on `at_risk` and `no_show_risk`; the whole thing lands in the owner-ready record.

---

## 9. Cloud Function surface (Firebase)
```
scheduleJob(jobId, scheduledStartAt, leadTimes?)   // creates job + enqueues 3 tasks
confirmAttendance(jobId)                            // tradie CTA
goNow(jobId)                                        // reveal address + notify tenant + en_route
rescheduleJob(jobId, newStartAt)                    // cancel old tasks, enqueue new
cancelJob(jobId)                                    // cancel tasks, status cancelled

// Cloud Task targets (HTTP handlers):
onRemindT2h(jobId)  onRemindT1h(jobId)  onDeadlineCheck(jobId)
```
**Stack:** Cloud Functions + **Cloud Tasks** (precise per-job firing) + Firestore (state) + Expo push (notifications). All inside `quickiefix-2ea2a`. No external maps/traffic dependency in MVP.

---

## 10. Edge cases to handle
- Reschedule/cancel → delete pending tasks, re-enqueue if rescheduled.
- Tradie confirms then goes quiet → `deadlineCheck` still catches it.
- Go now tapped then tradie doesn't actually go → address already revealed (accept minor risk; `goNowAt` is logged for accountability).
- Back-to-back jobs → *Phase 2* (leave time depends on prior job finishing).
- Push delivery fails → in-app list + countdown is the backstop.
- Tenant not home → day-before confirm (*Phase 2*).
- Tradie app killed/offline → confirmation & Go now are server-recorded on next open; deadline check fires regardless.

---

## 11. Scope
**MVP (this spec):**
- Scheduled job with `scheduledStartAt`, in-app job list + countdown.
- Dynamic T-2h (confirm) and T-1h reminders.
- Progressive address disclosure on Go now → existing en-route flow.
- Deadline check + PM escalation on `at_risk` / `no_show_risk`.

**Phase 2 (later):**
- Day-before tenant confirmation.
- Back-to-back job chaining.
- Optional live-traffic "recommended leave time" in the final window.
- Optional live location in the en-route window only.

---

## 12. Why not GPS/traffic in MVP
Background location on Expo is permission-heavy and often denied; live-traffic ETA adds an external API and cost. Tradies self-manage departure better than an algorithm nannies them. Reliability is delivered by **acknowledgement + deadline check**, which is exactly what property managers are buying. Add tracking later only if pilots ask for it.
