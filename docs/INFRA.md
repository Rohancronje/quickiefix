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

## Staging — remaining one-time console steps (~10 min)

1. **Authentication**: [staging console](https://console.firebase.google.com/project/quickiefix-staging/authentication) → Get started → enable **Email/Password**. (The API bootstrap needs this one click or billing.)
2. **Billing (Blaze)**: link the same billing account as prod — required for
   functions + storage on staging. Console → ⚙ → Usage and billing.
3. After billing: `npx firebase-tools deploy --only functions --project staging`
   (set the `BREVO_API_KEY` secret first: `npx firebase-tools functions:secrets:set BREVO_API_KEY --project staging` — use a Brevo test key, not the prod one).
4. **Move test accounts here over time**: User1–21, demo-company, demo-property
   belong in staging once real customers exist in prod.

## Hardening roadmap (agreed 15 Jul 2026)

| Item | Status | Notes |
|---|---|---|
| PITR + daily backups | ✅ done | prod |
| Staging project | ✅ created | console steps above outstanding |
| App Check | ⬜ | Register Play Integrity (Android) + reCAPTCHA v3 (web) in prod console, ship attestation in next APK, THEN enforce. Do not enforce before clients ship or every current install breaks. |
| Custom claims for admin | ⬜ | Replace `PLATFORM_ADMINS` email list + rules email checks with an `admin: true` custom claim set by a one-off script. |
| Narrow read rules | ⬜ | `users`, `agencyLinks`, `companyTags`, `agencies` are readable by any signed-in user. Split public tradie profile data from private fields before public launch. |
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
