# QuickieFix — Tradie Home Screen Redesign Brief

**Reference:** `design/tradie-home-reference.png`

## Philosophy
A professional operations dashboard, not a generic mobile app. Communicates:
Ready-for-work · Live · Fast · Trusted · Clean · Minimal · Premium.
North stars: **Uber Driver · Stripe Dashboard · Linear.**

Every element answers one of four questions instantly:
1. Am I available for work?
2. Is there a job I can accept right now?
3. What jobs am I currently responsible for?
4. How is my business performing?

Mindset: **show actions, not just data.**

## Layout (top → bottom)
1. **Header** — smaller logo (30–40% smaller), business name + smart greeting (morning/afternoon/evening), notification bell (with badge) + profile photo top-right.
2. **Availability** — the most important control, directly under greeting. Animated pill: 🟢 Available ("You're visible to nearby customers") / 🟠 On a Job / ⚪ Unavailable.
3. **Quick Summary Card** (navy, rounded, soft shadow) — OPERATIONAL not billing: Completed · In Progress · Rating (★4.9) · Service Radius, with a secondary "Last completed …" line.
4. **Nearby Jobs** (hero) — subtle map illustration; rich empty state (mailbox + "Expand Search Radius"); job cards that feel like an Uber trip request (trade, suburb, distance, requested-ago, est. duration, Accept/Decline).
5. **Need another trade?** — cleaner promo card, amber "Request a Tradie".
6. **Your Requests** — trade icon, status, address, requested time, assigned tradie + ETA + stage once accepted.
7. **Bottom nav** — Home(Dashboard) · Jobs · Timesheets · Profile.
8. **Floating Action Button** (amber, bottom-right) — quick menu: Go Available · Request a Tradie · View Nearby Jobs · Emergency Job.

## System
- **Icons:** replace emoji with a modern pack (Material Symbols Rounded / Phosphor).
- **Colours:** Navy #0B1320 · Amber #FFB21A · Green #18C46B · Grey bg #F5F7FA · Text #20242A · Secondary #6B7280.
- **Type:** Inter / SF Pro — H 32 · Section 22 · Card 18 · Body 15 · Status 13.
- **Animations:** subtle — toggle slide, jobs fade-in, accept expand, rating stars, completion celebration.
- **Performance banner** (instead of billing): "⭐ Excellent response time · avg 48s" / "🏆 Top 10%".
- **Empty states** educate + drive growth ("Invite another tradie").
- **Future widgets:** leave room for weather, daily earnings, upcoming bookings, announcements.
