/**
 * Firebase wiring — placeholder for when you go live.
 *
 * ---------------------------------------------------------------------------
 * GOING LIVE CHECKLIST
 * ---------------------------------------------------------------------------
 * 1. Create a Firebase project at https://console.firebase.google.com
 * 2. Enable: Authentication (Email/Password), Firestore, Storage, and
 *    Cloud Messaging (FCM) for push.
 * 3. Add a Web app, copy the config, and paste it into `firebaseConfig` below
 *    (or better: load from environment / app config `extra`).
 * 4. Install the SDK:   npx expo install firebase
 * 5. Implement a `FirestoreBackend implements Backend` class that maps each
 *    method to Firestore/Storage/Auth calls. The real-time `subscribe*`
 *    methods map directly onto Firestore `onSnapshot` listeners — the mock was
 *    designed to mirror that shape exactly.
 * 6. In `src/services/index.ts`, swap:  export const backend = new FirestoreBackend()
 *
 * SUGGESTED FIRESTORE COLLECTIONS
 *   users/{uid}          -> Customer | Tradie (role discriminator)
 *   jobs/{jobId}         -> Job  (query by status/trade/geohash for dispatch)
 *   jobs/{jobId}/events  -> status-transition audit trail
 *
 * For location-radius dispatch at scale, store a geohash on each job and use a
 * geo-query library (e.g. geofire-common) instead of scanning all jobs.
 * ---------------------------------------------------------------------------
 */

export const firebaseConfig = {
  apiKey: 'TODO',
  authDomain: 'TODO',
  projectId: 'TODO',
  storageBucket: 'TODO',
  messagingSenderId: 'TODO',
  appId: 'TODO',
};

// export const app = initializeApp(firebaseConfig);
// export const auth = getAuth(app);
// export const db = getFirestore(app);
// export const storage = getStorage(app);
