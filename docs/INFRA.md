# QuickieFix infrastructure — environments, backups & hardening

_Last updated: 15 July 2026_

## Environments

| Env | Firebase project | Role |
|---|---|---|
| **Production** | `quickiefix-2ea2a` | Real users. Firestore **australia-southeast1 (Sydney)** — already optimal for NZ. quickiefix.store, portal, app hosting, all functions. |
| **Staging** | `quickiefix-staging` | Test accounts, CI target, rules rehearsal. Firestore in Sydney, rules deployed, web + Android (`app.quickiefix`) apps registered. |

CLI aliases (`.firebaserc`): `--project prod` / `--project staging`.

## Data protection (DONE — enabled 15 Jul 2026)

- **PITR enabled** on prod: 7-day point-in-time recovery window. Restore via
  `gcloud firestore databases restore` or Console → Firestore → Disaster recovery.
- **Daily backup schedule** on prod, 7-day retention
  (schedule id `9cc7c507-f433-4c9f-a3ab-6be917f51dc4`).

## Staging — status

1. ✅ **Authentication** enabled (Email/Password confirmed ON, 15 Jul 2026).
   Google sign-in was also toggled on in the console — unused by the app, harmless;
   the "download new config file / SHA-1" console prompt can be ignored until we
   ever build an APK against staging.
2. ✅ **Billing (Blaze)** linked 15 Jul 2026 to the prod billing account
   (`0135C7-F9B4B9-627ED5` — the "Firebase Payment" account whose only other
   project is quickiefix-2ea2a). Note: three other empty "Firebase Payment"
   billing accounts exist from abandoned console upgrade flows — safe to close.
   "My Billing Account" belongs to the WordPress/logbook projects, not QuickieFix.
3. ✅ All three secrets copied to staging (`BREVO_API_KEY`, `EXPO_TOKEN`,
   `PLACES_API_KEY`); **all functions + rules deployed** (first deploy needed an
   Eventarc IAM-propagation retry — normal on fresh projects).
4. ✅ **Full data copy prod → staging** (15 Jul 2026): 15 collections / ~165 docs
   (users, jobs, companies, agencies, properties, tags, links, fees, messages…)
   plus all 33 auth users with matching UIDs. ⚠️ **Every staging account's
   password is `password`** (hash import isn't possible; these are test creds).
   Re-run anytime with `node scripts/copyToStaging.mjs` (from `functions/` deps,
   run as `cd functions && node ../scripts/copyToStaging.mjs`).
5. ⬜ **Prod test-data cleanup is deferred** until a staging build exists to
   test against — the phones + deployed web apps still point at prod. Delete
   User1–21/demo-* from prod as the final pre-launch step.
6. ⬜ **Storage bucket**: staging has no default bucket yet (photo uploads will
   fail there) — Console → Storage → Get started when needed.

### Staging builds & URLs (live)

| Surface | Staging URL | Build command |
|---|---|---|
| App (web) | https://quickiefix-app-staging.web.app | `$env:EXPO_PUBLIC_FIREBASE_ENV='staging'; npx expo export --platform web --output-dir web-build-staging` |
| Portal | https://quickiefix-portal-staging.web.app | `cd portal; $env:VITE_FIREBASE_ENV='staging'; npx vite build --outDir dist-staging` |
| Deploy both | — | `npx firebase-tools deploy --only hosting --config firebase.staging.json --project quickiefix-staging` |

Env switching lives in `src/services/firebaseConfig.ts` (app) and
`portal/src/firebase.ts` (portal); the Places proxy URL follows the selected
project automatically. Default (no env var) is ALWAYS production — CI and
normal builds are unaffected. All staging logins use password `password`.

### Staging client configs (saved, not yet wired anywhere)

- Android: `google-services.staging.json` at repo root — swap in for a staging APK build.
- Web (`src/services/firebaseConfig.ts` values for a staging build):
  ```
  projectId: quickiefix-staging
  apiKey: AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw
  authDomain: quickiefix-staging.firebaseapp.com
  storageBucket: quickiefix-staging.firebasestorage.app
  messagingSenderId: 980457473979
  appId: 1:980457473979:web:9e220ffbc5f80405c2669e
  ```

## Hardening roadmap (agreed 15 Jul 2026)

| Item | Status | Notes |
|---|---|---|
| PITR + daily backups | ✅ done | prod |
| Staging project | ✅ created | console steps above outstanding |
| App Check | ⬜ | Register Play Integrity (Android) + reCAPTCHA v3 (web) in prod console, ship attestation in next APK, THEN enforce. Do not enforce before clients ship or every current install breaks. |
| Custom claims for admin | ⬜ | Replace `PLATFORM_ADMINS` email list + rules email checks with an `admin: true` custom claim set by a one-off script. |
| Narrow read rules | 🟡 partial | **Done (prod, 16 Jul 2026):** `jobs` IDOR closed; `users` split into private doc + `publicProfiles` mirror (mirrorPublicProfile fn + backfill); `companyTags` locked (claim via `claimSeatTag` callable); `companies` scoped to owner/member/admin. **Remaining:** `agencies` + `agencyLinks` still `signedIn()`. Blocker: managed-property dispatch (`createJob → getAgencyPanel`) and the request-flow preview read the panel client-side as a tenant, and the agency `adminEmail` is deliberately shown to tenants as the billing contact. Safe fix = (1) denormalise the approved panel (tradieIds+companyIds) onto each Property via a fn on agencyLink approve/remove, so dispatch/preview read the property instead of `agencyLinks`; (2) move agency-code lookup to a `findAgencyByCode` callable (mirrors `claimSeatTag`); (3) then lock `agencies`/`agencyLinks` to owner/member/admin. ~batch-1-sized; verify managed-property dispatch on staging before prod. |
| Server-side write transitions | ⬜ | Defence-in-depth (no active leak — rules already limit writes to the parties). Move accept / complete / release job-status transitions from client transactions into callables (rating aggregation is already server-side via `onJobRated`), then tighten `jobs` update rules to server-only. Do as a focused effort with full lifecycle testing. |
| Callables → Sydney | ⬜ | `deleteMyAccount`, `createAgencyJob`, `sendAgencyInvite` etc. run in us-central1 while the DB is in Sydney (~150 ms penalty per call). Move region + update `getFunctions(app, 'australia-southeast1')` in app + portal in one coordinated deploy. |
| Stripe fee auto-charge | ⬜ | Top commercial priority (see strategic review). |
| Sentry (app+portal+functions) | ⬜ | Error/crash visibility before launch. |
| CI → staging first | ⬜ | Point the GitHub workflow at staging; promote to prod manually. |

## Useful commands

```powershell
# Deploy anything to staging instead of prod
npx firebase-tools deploy --only firestore:rules --project staging

# List prod backups
# (REST) GET https://firestore.googleapis.com/v1/projects/quickiefix-2ea2a/locations/australia-southeast1/backups

# One-off Firestore export (ad-hoc snapshot before risky changes)
# requires a GCS bucket once billing storage exists on the target
```
