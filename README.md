# QuickieFix ⚡

**Get trusted help fast.** An on-demand marketplace that dispatches verified,
available tradies to customers in real time — think "Uber for tradespeople",
not a quote-and-wait directory.

Built with **React Native + Expo (SDK 57)** and **TypeScript**. The data layer
is a swappable service interface currently backed by a local mock backend, so
the whole app runs with **zero external setup** — and can be pointed at
**Firebase** later without touching a single screen.

---

## What's in this MVP

The full end-to-end core loop for both roles:

```
Register / log in ─▶ Request job ─▶ Dispatch to nearby tradies ─▶ Accept
      ─▶ Travel ─▶ On-site (GPS auto-detect) ─▶ Complete ─▶ Rate
```

### Customer
- Email/password auth + role-based routing
- Home dashboard with live active jobs and quick service categories
- **6-step guided job request** wizard (service → describe → photos → location → now/scheduled → review)
- Current-location capture (GPS) or manual address
- **Live job tracking**: searching animation, tradie profile reveal on acceptance, ETA, status timeline
- Star + tag rating after completion
- Activity history & account

### Tradie
- Tradie registration (personal, business, primary/secondary trades, licence for regulated trades)
- **Availability toggle** (captures GPS so dispatch radius works)
- Pending-approval gate (with a demo "approve now" shortcut)
- **Live incoming job feed** matched by trade + service radius, sorted nearest-first
- Accept / decline, then manage: start travelling → arrive (GPS geofence auto check-in or manual) → complete
- Rate the customer, private internal metrics
- **Timesheets** with duration tracking + CSV export (via the native share sheet)
- Profile with reputation, qualifications, editable service radius

### Platform
- Full job **status flow** with a timestamp at every transition
  (`draft → searching → accepted → travelling → on_site → completed / cancelled / disputed`)
- Reputation system: rating average, completed jobs, response rate, verified/qualified badges
- Real-time updates via a Firestore-style `subscribe*` pub/sub

---

## Running it

```bash
npm install
npm start          # then press a: Android, i: iOS, w: web
# or directly:
npm run android
npm run ios
npm run web
```

Scan the QR code with **Expo Go** on your phone for the real mobile experience
(GPS, camera roll, and push all behave best on a device).

### Demo accounts

All demo accounts use the password **`password`** (or tap the one-touch demo
chips on the welcome screen):

| Role       | Email                          |
|------------|--------------------------------|
| Customer   | `customer@quickiefix.app`      |
| Electrician| `electrician@quickiefix.app`   |
| Plumber    | `plumber@quickiefix.app`       |
| Locksmith  | `locksmith@quickiefix.app`     |
| Handyman   | `handyman@quickiefix.app`      |

> **Tip — try the full dispatch loop:** open the app twice (e.g. a phone as the
> customer and the web build as a tradie). Request a job as the customer, then
> watch it appear instantly in the tradie's incoming feed, accept it, and see
> the customer's tracking screen update live.

Reset all local data anytime from **Account → Reset demo data**.

---

## Project structure

```
app/                         # Expo Router (file-based navigation)
  _layout.tsx                #   providers + auth-based route guard
  (auth)/                    #   welcome, login, register, register-tradie
  (customer)/                #   (tabs): home, activity, account
    new-job.tsx              #   the 6-step request wizard
    track/[id].tsx           #   live job tracking + rating
  (tradie)/                  #   (tabs): dashboard, timesheets, profile
    job/[id].tsx             #   accept → GPS on-site → complete → rate
src/
  types.ts                   # domain model (User, Tradie, Job, Rating, status enums)
  constants.ts               # trades, rating tags, status metadata
  theme.ts                   # design system (colours, spacing, type)
  components/                # UI kit + JobCard, TradieProfileCard, RatingForm, JobTimeline…
  context/AuthContext.tsx    # session + live current-user binding
  hooks/                     # real-time data hooks (useJob, useJobOffers, …)
  lib/                       # geo (haversine), location (expo-location), format, timesheet CSV
  services/
    backend.ts               # the Backend interface — the ONLY contract screens depend on
    mockBackend.ts           # local + AsyncStorage implementation w/ dispatch engine
    mockBackend.ts           # local + AsyncStorage implementation w/ dispatch engine
    firestoreBackend.ts      # real Firebase implementation (Auth/Firestore/Storage)
    firebase.ts              # Firebase init (auth persistence, firestore, storage)
    firebaseConfig.ts        # paste your project config here to go live
    seed.ts                  # demo customers + tradies (Auckland)
    index.ts                 # auto-selects Firebase if configured, else mock
firestore.rules             # Firestore security rules
storage.rules               # Storage security rules
```

---

## Going live on Firebase

**The Firebase backend is already fully implemented** (`src/services/firestoreBackend.ts`)
— Auth, Firestore real-time listeners, Storage photo uploads, transactional
job acceptance, and rating aggregation. The app **auto-switches** to it the
moment a real config is present; until then it runs on the mock. No code
changes required.

To turn it on:

1. **Create a Firebase project** at <https://console.firebase.google.com>.
2. **Enable** Authentication → *Email/Password*, **Firestore Database**, and
   **Storage**. (Cloud Messaging later, for push.)
3. **Add a Web app** in Project settings, copy the config object, and paste the
   values into `src/services/firebaseConfig.ts` (replacing the `TODO`s).
4. **Deploy the security rules** (from the Firebase CLI, `npm i -g firebase-tools`):
   ```bash
   firebase deploy --only firestore:rules,storage
   ```
   The rules live in `firestore.rules` and `storage.rules` at the repo root.
5. Restart the app — `isFirebaseConfigured` flips to `true` and every screen is
   now backed by live Firebase. 🎉

**Firestore layout** (created automatically as you use the app):

```
users/{uid}   → Customer | Tradie   (auth uid == doc id)
jobs/{jobId}  → Job                 (queried by status/customerId/tradieId)
```

**Notes**
- The `firebaseConfig.ts` web keys are **not secrets** (security is enforced by
  the rules), so committing them is safe. Prefer to keep them out of git? Add
  `src/services/firebaseConfig.ts` to `.gitignore`.
- The seeded demo accounts are **mock-only**. On Firebase, register fresh
  accounts (or ask me to add an Admin-SDK seed script).
- For dispatch at scale, add a geohash to each job and use `geofire-common`
  instead of scanning `searching` jobs client-side.

---

## Not in this MVP (by design)

Admin console, push notifications, payments, favourites, and the future AI
photo-diagnosis features from the product spec are intentionally deferred. The
data model and status flow already accommodate them.
