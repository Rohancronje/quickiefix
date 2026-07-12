# Build-day checklist (next EAS Android build)

All native features below are ALREADY coded, guarded, and shipping as OTA
no-ops. The next build (quota resets **Aug 1 2026**, or after an Expo plan
upgrade) switches them on. Work through this list, in order.

## Before the build

1. **FCM V1 credentials (push delivery on Android)** — one-time:
   - Firebase console → Project settings → Service accounts → *Generate new
     private key* (JSON) for project `quickiefix-2ea2a`.
   - `npx eas-cli credentials` → Android → `app.quickiefix` → *Google Service
     Account key for FCM V1* → upload that JSON.
   - Also register an Android app (`app.quickiefix`) in Firebase console if not
     present, download `google-services.json` into the repo root, and add
     `"googleServicesFile": "./google-services.json"` under `android` in
     app.json. Keep the file OUT of git if it ever contains secrets (it is
     generally safe/public, but check).
2. **Google Maps API key (embedded map on Android)**:
   - Google Cloud console (same project) → enable *Maps SDK for Android* →
     create an API key restricted to Android apps + package `app.quickiefix`.
   - Add to app.json: `android.config.googleMaps.apiKey = "<key>"`.
   - Without it the map shows a blank grid — the component still renders and
     falls through to open-in-maps, so it's not a blocker.

## The build

3. `npx eas-cli build --platform android --profile preview` from `main`.
4. Install as a **clean install** (uninstall the old app first).

## Smoke test on device

5. App opens; log in.
6. **Biometrics**: Profile/Account → 🔒 Biometric unlock → enable (fingerprint
   check fires) → swipe-kill → reopen → lock screen prompts → unlock.
7. **Push**: log in as tradie on the phone; from another session create a job in
   the tradie's trade/area → phone gets a system notification → tapping opens
   the job screen. Accept → the customer device gets "Tradie found!".
8. **Sound/buzz**: with the app open, an incoming offer buzzes + chimes.
9. **Map**: open a confirmed job → embedded map renders with a pin (needs the
   API key from step 2) → tap → hands off to Google Maps/Waze.

## Notes

- Native payments (Stripe/Google Pay) intentionally deferred — no payment
  collection at this stage.
- The current interim binaries (SDK 57 build `36095bfc` and older) run all the
  same JS with these features dormant; no need to rush installs.
