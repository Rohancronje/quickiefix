/**
 * Firestore/Auth/Storage implementation of the Backend contract.
 *
 * Mirrors mockBackend exactly, so switching between them is invisible to the
 * app. Real-time `subscribe*` methods use Firestore `onSnapshot`; the dispatch
 * matcher (`subscribeJobOffers`) combines a live "searching jobs" query with a
 * live tradie doc and recomputes eligibility client-side.
 *
 * Collections:
 *   users/{uid}   → Customer | Tradie   (auth uid == doc id)
 *   jobs/{jobId}  → Job
 */
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes, uploadString } from 'firebase/storage';
import {
  Agency,
  AgencyLink,
  AppUser,
  BillingDetails,
  Engagement,
  JobSource,
  Company,
  CompanyTag,
  Customer,
  FeeLineItem,
  GeoPoint,
  Job,
  JobPart,
  JobStatus,
  Location,
  Message,
  Property,
  RateCard,
  Rating,
  Tradie,
  TradeCategory,
  TradieStatus,
} from '../types';
import { FREE_CREDITS_DEFAULT } from '../constants';
import { distanceKm, estimateEtaMinutes } from '../lib/geo';
import { rankCandidates } from '../lib/dispatch';
import { AgencyPanel, isOnPanel } from '../lib/panel';
import { friendlyAuthError } from '../lib/authError';
import { maskContactInfo } from '../lib/mask';
import { genTagCode, TAG_TTL_MS } from '../lib/tags';
import {
  Backend,
  ChooseFeed,
  CustomerRegistration,
  JobOffer,
  NewJobInput,
  SupplySnapshot,
  TradieCandidate,
  TradieRegistration,
  Unsubscribe,
} from './backend';
import { auth, db, functions, storage } from './firebase';

const ACTIVE_STATUSES: JobStatus[] = ['accepted', 'confirmed', 'travelling', 'on_site'];

export class FirestoreBackend implements Backend {
  // These are safe to force-unwrap: this class is only selected when
  // isFirebaseConfigured is true, which guarantees the instances exist.
  private get auth() {
    return auth!;
  }
  private get db() {
    return db!;
  }

  private userRef(id: string) {
    return doc(this.db, 'users', id);
  }
  private jobRef(id: string) {
    return doc(this.db, 'jobs', id);
  }

  /* ---------------------------------------------------------------- auth -- */

  async login(email: string, password: string): Promise<AppUser> {
    let cred;
    try {
      cred = await signInWithEmailAndPassword(this.auth, email.trim(), password);
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }
    const snap = await getDoc(this.userRef(cred.user.uid));
    if (!snap.exists()) throw new Error('Account record not found.');
    return snap.data() as AppUser;
  }

  async registerCustomer(input: CustomerRegistration): Promise<Customer> {
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(this.auth, input.email.trim(), input.password);
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }
    const customer: Customer = {
      id: cred.user.uid,
      role: 'customer',
      email: input.email.trim(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      createdAt: Date.now(),
    };
    try {
      await setDoc(this.userRef(customer.id), customer);
    } catch (e) {
      // Roll back the auth account so we never leave an orphan.
      await deleteUser(cred.user).catch(() => {});
      throw e;
    }
    return customer;
  }

  async registerTradie(input: TradieRegistration): Promise<Tradie> {
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(this.auth, input.email.trim(), input.password);
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }
    const tradie: Tradie = {
      id: cred.user.uid,
      role: 'tradie',
      email: input.email.trim(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      createdAt: Date.now(),
      businessName: input.businessName.trim(),
      tradingName: input.tradingName?.trim(),
      yearsExperience: input.yearsExperience,
      businessType: input.businessType,
      nzbn: input.nzbn,
      primaryTrade: input.primaryTrade,
      secondaryTrades: input.secondaryTrades,
      qualifications: input.qualifications,
      approval: 'pending',
      status: 'offline',
      serviceRadiusKm: input.serviceRadiusKm,
      baseLocation: undefined,
      ratingAvg: 0,
      ratingCount: 0,
      completedJobs: 0,
      jobsOffered: 0,
      jobsAccepted: 0,
      freeJobCredits: FREE_CREDITS_DEFAULT,
      paymentHold: false,
    };
    try {
      await setDoc(this.userRef(tradie.id), tradie);
    } catch (e) {
      await deleteUser(cred.user).catch(() => {});
      throw e;
    }
    return tradie;
  }

  async getUser(id: string): Promise<AppUser | null> {
    const snap = await getDoc(this.userRef(id));
    return snap.exists() ? (snap.data() as AppUser) : null;
  }

  subscribeUser(id: string, cb: (user: AppUser | null) => void): Unsubscribe {
    return onSnapshot(this.userRef(id), (snap) =>
      cb(snap.exists() ? (snap.data() as AppUser) : null),
    );
  }

  subscribePublicProfile(id: string, cb: (user: AppUser | null) => void): Unsubscribe {
    return onSnapshot(doc(this.db, 'publicProfiles', id), (snap) =>
      cb(snap.exists() ? (snap.data() as AppUser) : null),
    );
  }

  /** Resolve the persisted auth session once, then load the user doc. A hard
   *  timeout guarantees startup never blocks forever if auth state stalls. */
  getSessionUser(): Promise<AppUser | null> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (u: AppUser | null) => {
        if (done) return;
        done = true;
        resolve(u);
      };
      const timer = setTimeout(() => finish(null), 8000);
      const unsub = onAuthStateChanged(this.auth, async (fbUser) => {
        unsub();
        clearTimeout(timer);
        try {
          if (!fbUser) return finish(null);
          const snap = await getDoc(this.userRef(fbUser.uid));
          finish(snap.exists() ? (snap.data() as AppUser) : null);
        } catch {
          finish(null);
        }
      });
    });
  }

  async deleteAccount(): Promise<void> {
    if (!functions) throw new Error('Account deletion is unavailable right now.');
    // Admin-side cleanup (profile, properties, seats, links, auth user) — works
    // without a recent re-login, unlike client-side auth deletion.
    await httpsCallable(functions, 'deleteMyAccount')({});
    await signOut(this.auth).catch(() => {});
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  async setPushToken(userId: string, token: string | null): Promise<void> {
    try {
      await updateDoc(this.userRef(userId), { pushToken: token ?? deleteField() });
    } catch {
      // Non-fatal: push registration must never break login.
    }
  }

  async resetPassword(email: string): Promise<void> {
    // Preferred path: our branded email via Brevo (Cloud Function). Falls back to
    // Firebase's default sender if the Functions client isn't available.
    if (functions) {
      try {
        await httpsCallable(functions, 'sendPasswordReset')({ email: email.trim() });
        return;
      } catch {
        // Fall through to Firebase's built-in email.
      }
    }
    try {
      await sendPasswordResetEmail(this.auth, email.trim());
    } catch (e) {
      // Don't reveal whether an account exists; only surface real failures.
      const code = (e as { code?: string })?.code;
      if (code === 'auth/user-not-found') return;
      throw new Error(friendlyAuthError(e));
    }
  }

  /* ------------------------------------------------------------- tradie -- */

  async getTradie(id: string): Promise<Tradie | null> {
    const u = await this.getUser(id);
    return u && u.role === 'tradie' ? u : null;
  }

  async setTradieStatus(id: string, status: TradieStatus): Promise<void> {
    await updateDoc(this.userRef(id), { status });
  }

  async setTradieLocation(id: string, point: GeoPoint): Promise<void> {
    await updateDoc(this.userRef(id), { baseLocation: point });
  }

  async setServiceRadius(id: string, km: number): Promise<void> {
    await updateDoc(this.userRef(id), { serviceRadiusKm: km });
  }

  /* --------------------------------------------------------------- jobs -- */

  async createJob(requester: { id: string; name: string }, input: NewJobInput): Promise<Job> {
    // One live job per trade per customer: a plumbing job already in motion
    // blocks a second plumbing request until it finishes — other trades are fine.
    const live: JobStatus[] = ['searching', 'accepted', 'confirmed', 'travelling', 'on_site'];
    const mineSnap = await getDocs(
      query(collection(this.db, 'jobs'), where('customerId', '==', requester.id)),
    );
    const clash = mineSnap.docs
      .map((d) => d.data() as Job)
      .find((j) => j.trade === input.trade && live.includes(j.status));
    if (clash) {
      const label = input.trade.replace(/_/g, ' ');
      throw new Error(
        `You already have a live ${label} job. Track or cancel it in Activity before requesting another.`,
      );
    }

    const jobRef = doc(collection(this.db, 'jobs'));
    const photos = await this.uploadPhotos(jobRef.id, input.photos);
    const now = Date.now();

    // Emergencies can't wait to browse — always auto-dispatch.
    const mode: 'auto' | 'choose' = input.isEmergency ? 'auto' : input.assignmentMode ?? 'auto';

    // Scheduled jobs: the dispatch clock (and every push) starts at the booked
    // time, not at creation — see dispatchSweep/waveEligible.
    const startAt =
      input.urgency === 'scheduled' && input.scheduledFor && input.scheduledFor > now
        ? input.scheduledFor
        : now;

    // Stamp the property + landlord (payer-of-record) if this job is at one.
    // Read it BEFORE building the candidate pool: agency-managed properties
    // dispatch ONLY to the agency's approved panel.
    let propertyStamp: Partial<Job> = {};
    let property: Property | null = null;
    if (input.propertyId) {
      const pSnap = await getDoc(doc(this.db, 'properties', input.propertyId));
      if (pSnap.exists()) {
        property = pSnap.data() as Property;
        // Managed property + customer chose to pay themselves → normal
        // open-market job: keep the property/landlord stamps for visibility,
        // but no agency stamps (those drive panel-only dispatch + agency
        // billing + hidden rates).
        const agencyPays = !!property.agencyId && input.payer !== 'customer';
        propertyStamp = {
          propertyId: property.id,
          landlordId: property.landlordId,
          landlordName: property.landlordName,
          ...(agencyPays
            ? {
                agencyId: property.agencyId,
                agencyName: property.agencyName,
                // Denormalised billing contact so the assigned tradie can
                // invoice the agency without reading the locked agencies doc.
                ...(property.agencyBillingEmail
                  ? { agencyBillingEmail: property.agencyBillingEmail }
                  : {}),
                billTo: 'agency' as const,
              }
            : {}),
          ...(property.agencyId && !agencyPays ? { billTo: 'customer' as const } : {}),
        };
      }
    }

    // Snapshot the ranked candidate pool now. For `auto` this is the wave
    // dispatch order (available only). For `choose` — and for scheduled jobs,
    // whose dispatch fires later — include busy/in-area tradies too, since
    // who's available will have changed by then. Exclude the requester.
    let candidates =
      mode === 'choose' || startAt > now
        ? await this.getInAreaTradies(input.trade, input.location)
        : await this.getAvailableTradies(input.trade, input.location);

    // Agency property → restrict to the approved panel: linked tradies, plus
    // tradies of a linked company (respecting the company's scope choice —
    // 'employees' excludes contractors). Other locations stay open-market.
    let ownPanelIds: string[] | undefined;
    if (property?.agencyId && input.payer !== 'customer') {
      const panel = await this.getAgencyPanel(property.agencyId);
      candidates = candidates.filter((c) => isOnPanel(c.tradie, panel));
      // Record who holds their OWN membership — decides sourcedVia at accept.
      ownPanelIds = candidates
        .filter((c) => panel.tradieIds.includes(c.tradie.id))
        .map((c) => c.tradie.id);
    }
    const candidateIds = rankCandidates(candidates).filter((id) => id !== requester.id);

    const job: Job = {
      id: jobRef.id,
      customerId: requester.id,
      customerName: requester.name,
      trade: input.trade,
      description: input.description,
      photos,
      location: input.location,
      urgency: input.urgency,
      scheduledFor: input.scheduledFor,
      isEmergency: input.isEmergency ?? false,
      assignmentMode: mode,
      status: 'searching',
      timestamps: { createdAt: now, searchingAt: now },
      dispatch: { candidateIds, startedAt: startAt, ...(ownPanelIds ? { ownPanelIds } : {}) },
      interestedTradies: [],
      declinedBy: [],
      ...propertyStamp,
    };
    await setDoc(jobRef, job);
    return job;
  }

  async fileComplaint(job: Job, subject: string, detail: string): Promise<void> {
    const ref = doc(collection(this.db, 'complaints'));
    await setDoc(ref, {
      id: ref.id,
      kind: 'job',
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName,
      tradieId: job.tradieId,
      tradieName: job.tradieName,
      trade: job.trade,
      subject: subject.trim(),
      detail: detail.trim(),
      status: 'open',
      createdAt: Date.now(),
    });
  }

  async fileSupportTicket(
    user: { id: string; name: string; email: string; role: 'customer' | 'tradie' },
    subject: string,
    detail: string,
  ): Promise<void> {
    const ref = doc(collection(this.db, 'complaints'));
    await setDoc(ref, {
      id: ref.id,
      kind: 'support',
      customerId: user.id, // the raiser, regardless of role
      customerName: user.name,
      contactEmail: user.email,
      raisedByRole: user.role,
      subject: subject.trim(),
      detail: detail.trim(),
      status: 'open',
      createdAt: Date.now(),
    });
  }

  async getAvailableTradies(
    trade: TradeCategory,
    location: Location,
  ): Promise<TradieCandidate[]> {
    // Query available tradies, then filter by trade/approval client-side to
    // avoid a composite index.
    const snap = await getDocs(
      query(collection(this.db, 'publicProfiles'), where('status', '==', 'available')),
    );
    const candidates: TradieCandidate[] = [];
    for (const d of snap.docs) {
      const u = d.data() as AppUser;
      if (u.role !== 'tradie' || u.approval !== 'approved') continue;
      if (u.paymentHold) continue; // on payment hold → excluded from dispatch (§5.4)
      const trades = new Set([u.primaryTrade, ...u.secondaryTrades]);
      if (!trades.has(trade)) continue;
      let km = 0;
      if (u.baseLocation && location.latitude != null && location.longitude != null) {
        km = distanceKm(u.baseLocation, {
          latitude: location.latitude,
          longitude: location.longitude,
        });
      }
      candidates.push({ tradie: u, distanceKm: km, etaMinutes: estimateEtaMinutes(km) });
    }
    return candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  subscribeSupply(location: GeoPoint | undefined, cb: (s: SupplySnapshot) => void): Unsubscribe {
    return onSnapshot(
      query(collection(this.db, 'publicProfiles'), where('status', '==', 'available')),
      (snap) => {
        let count = 0;
        let nearestKm: number | null = null;
        let fromCallout: number | null = null;
        let fromHourly: number | null = null;
        for (const d of snap.docs) {
          const u = d.data() as AppUser;
          if (u.role !== 'tradie' || u.approval !== 'approved' || u.paymentHold) continue;
          count++;
          if (location && u.baseLocation) {
            const km = distanceKm(u.baseLocation, location);
            if (nearestKm == null || km < nearestKm) nearestKm = km;
          }
          const rc = u.rateCard;
          if (rc?.calloutFeeCents != null && (fromCallout == null || rc.calloutFeeCents < fromCallout)) {
            fromCallout = rc.calloutFeeCents;
          }
          if (rc?.hourlyRateCents != null && (fromHourly == null || rc.hourlyRateCents < fromHourly)) {
            fromHourly = rc.hourlyRateCents;
          }
        }
        cb({
          count,
          nearestEtaMinutes: nearestKm != null ? estimateEtaMinutes(nearestKm) : undefined,
          fromCalloutCents: fromCallout ?? undefined,
          fromHourlyCents: fromHourly ?? undefined,
        });
      },
    );
  }

  /** Approved, matching-trade tradies in the area REGARDLESS of availability
   *  (excluding offline / payment-hold). Used to build the `choose`-mode pool so
   *  busy tradies still receive the opt-in request. */
  private async getInAreaTradies(
    trade: TradeCategory,
    location: Location,
  ): Promise<TradieCandidate[]> {
    const snap = await getDocs(query(collection(this.db, 'publicProfiles'), where('role', '==', 'tradie')));
    const candidates: TradieCandidate[] = [];
    for (const d of snap.docs) {
      const u = d.data() as AppUser;
      if (u.role !== 'tradie' || u.approval !== 'approved') continue;
      if (u.paymentHold || u.status === 'offline') continue;
      const trades = new Set([u.primaryTrade, ...u.secondaryTrades]);
      if (!trades.has(trade)) continue;
      let km = 0;
      if (u.baseLocation && location.latitude != null && location.longitude != null) {
        km = distanceKm(u.baseLocation, {
          latitude: location.latitude,
          longitude: location.longitude,
        });
      }
      candidates.push({ tradie: u, distanceKm: km, etaMinutes: estimateEtaMinutes(km) });
    }
    return candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  subscribeAvailableTradies(
    trade: TradeCategory,
    location: Location,
    cb: (tradies: TradieCandidate[]) => void,
  ): Unsubscribe {
    return onSnapshot(
      query(collection(this.db, 'publicProfiles'), where('status', '==', 'available')),
      (snap) => {
        const out: TradieCandidate[] = [];
        for (const d of snap.docs) {
          const u = d.data() as AppUser;
          if (u.role !== 'tradie' || u.approval !== 'approved' || u.paymentHold) continue;
          const trades = new Set([u.primaryTrade, ...u.secondaryTrades]);
          if (!trades.has(trade)) continue;
          let km = 0;
          if (u.baseLocation && location.latitude != null && location.longitude != null) {
            km = distanceKm(u.baseLocation, {
              latitude: location.latitude,
              longitude: location.longitude,
            });
          }
          out.push({ tradie: u, distanceKm: km, etaMinutes: estimateEtaMinutes(km) });
        }
        out.sort((a, b) => a.distanceKm - b.distanceKm);
        cb(out);
      },
    );
  }

  async confirmJob(jobId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.jobRef(jobId));
      if (!snap.exists()) return;
      if ((snap.data() as Job).status !== 'accepted') return;
      tx.update(this.jobRef(jobId), {
        status: 'confirmed',
        'timestamps.confirmedAt': Date.now(),
      });
    });
  }

  async markNoTradieFound(jobId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.jobRef(jobId));
      if (!snap.exists()) return;
      if ((snap.data() as Job).status !== 'searching') return;
      tx.update(this.jobRef(jobId), {
        status: 'no_tradie_found',
        'timestamps.noTradieFoundAt': Date.now(),
      });
    });
  }

  /** Upload local photo URIs to Storage and return their download URLs. */
  private async uploadPhotos(jobId: string, uris: string[]): Promise<string[]> {
    const uid = this.auth.currentUser?.uid;
    if (!storage || uris.length === 0 || !uid) return uris;
    const urls: string[] = [];
    for (let i = 0; i < uris.length; i++) {
      const uri = uris[i];
      if (/^https?:/.test(uri)) {
        urls.push(uri); // already remote (e.g. re-submit)
        continue;
      }
      // uid in the path lets Storage rules lock writes to the uploader; parties
      // view via the tokenized download URL saved on the (locked) job doc.
      const r = ref(storage, `jobs/${jobId}/${uid}/photo_${i}`);
      try {
        let uploaded = false;
        try {
          // Read the picked file from disk directly. fetch(file://) is broken
          // on modern React Native and used to silently drop EVERY photo.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
          const b64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await uploadString(r, b64, 'base64', { contentType: 'image/jpeg' });
          uploaded = true;
        } catch {
          /* fall through to the fetch/blob path (web) */
        }
        if (!uploaded) {
          const res = await fetch(uri);
          const blob = await res.blob();
          await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg' });
        }
        urls.push(await getDownloadURL(r));
      } catch (e) {
        console.warn(`photo upload failed (${i}):`, (e as Error).message);
      }
    }
    return urls;
  }

  async acceptJob(jobId: string, _tradieId: string): Promise<Job> {
    // Server-enforced (Admin SDK): the assignment + rate snapshot are computed
    // and written server-side, so a crafted client can't forge who's assigned
    // or at what rate. Handles both auto and browse-and-choose accepts.
    if (!functions) throw new Error('Accepting jobs is unavailable right now.');
    await httpsCallable(functions, 'acceptJob')({ jobId });
    const snap = await getDoc(this.jobRef(jobId));
    return snap.data() as Job;
  }

  async declineJob(jobId: string, tradieId: string): Promise<void> {
    // arrayUnion keeps this idempotent without a read.
    await updateDoc(this.jobRef(jobId), { declinedBy: arrayUnion(tradieId) });
  }

  async setJobBilling(jobId: string, billing: BillingDetails): Promise<void> {
    await updateDoc(this.jobRef(jobId), {
      billing: { contactName: billing.contactName.trim(), contactEmail: billing.contactEmail.trim() },
    });
  }

  async setCustomerAddress(
    customerId: string,
    kind: 'home' | 'work',
    location: Location | null,
  ): Promise<void> {
    const field = kind === 'home' ? 'homeAddress' : 'workAddress';
    // Firestore rejects undefined values — only include coords when pinned.
    const clean = location
      ? {
          address: location.address,
          ...(location.latitude != null && location.longitude != null
            ? { latitude: location.latitude, longitude: location.longitude }
            : {}),
        }
      : deleteField();
    await updateDoc(this.userRef(customerId), { [field]: clean });
  }

  /* --------------------------------------------------- property agencies -- */

  async getAgency(agencyId: string): Promise<Agency | null> {
    const snap = await getDoc(doc(this.db, 'agencies', agencyId));
    return snap.exists() ? (snap.data() as Agency) : null;
  }

  async getAgencyPanel(agencyId: string): Promise<AgencyPanel> {
    // Reads the non-PII projection maintained by the mirrorAgencyPanel function
    // — agencyLinks itself is locked to the parties.
    const snap = await getDoc(doc(this.db, 'agencyPanels', agencyId));
    const d = snap.exists() ? (snap.data() as Partial<AgencyPanel>) : undefined;
    return { tradieIds: d?.tradieIds ?? [], companyScope: d?.companyScope ?? {} };
  }

  async requestAgencyLink(
    member: { id: string; name: string; email?: string },
    code: string,
    kind: 'tradie' | 'tenant',
  ): Promise<string> {
    const clean = code.trim().toUpperCase();
    // Resolve the code server-side — the agencies collection is not client
    // -readable by code (stops code enumeration + adminEmail harvest).
    if (!functions) throw new Error('Agency linking is unavailable right now.');
    const found = (await httpsCallable(functions, 'findAgencyByCode')({ code: clean })).data as {
      found: boolean;
      id?: string;
      name?: string;
    };
    if (!found.found || !found.id) throw new Error('No property agency matches that code. Double-check it with the agency.');
    const agency = { id: found.id, name: found.name ?? '' } as Agency;
    // Already linked/pending? Keep it idempotent and friendly.
    const existing = await getDocs(
      query(collection(this.db, 'agencyLinks'), where('memberId', '==', member.id)),
    );
    const dupe = existing.docs
      .map((d) => d.data() as AgencyLink)
      .find((l) => l.agencyId === agency.id && l.status !== 'removed');
    if (dupe) {
      throw new Error(
        dupe.status === 'approved'
          ? `You're already linked with ${agency.name}.`
          : `Your request with ${agency.name} is already pending their approval.`,
      );
    }
    const ref = doc(collection(this.db, 'agencyLinks'));
    await setDoc(ref, {
      id: ref.id,
      agencyId: agency.id,
      agencyName: agency.name,
      kind,
      memberId: member.id,
      memberName: member.name,
      ...(member.email ? { memberEmail: member.email } : {}),
      status: 'pending',
      requestedAt: Date.now(),
    } satisfies AgencyLink);
    return agency.name;
  }

  subscribeMyAgencyLinks(
    memberId: string,
    cb: (links: AgencyLink[]) => void,
    companyId?: string,
  ): Unsubscribe {
    // Personal links + (for company tradies) panels covering their company.
    let mine: AgencyLink[] = [];
    let viaCompany: AgencyLink[] = [];
    const emit = () =>
      cb(
        [...mine, ...viaCompany]
          .filter((l) => l.status !== 'removed')
          .sort((a, b) => b.requestedAt - a.requestedAt),
      );
    const unsubMine = onSnapshot(
      query(collection(this.db, 'agencyLinks'), where('memberId', '==', memberId)),
      (snap) => {
        mine = snap.docs.map((d) => d.data() as AgencyLink);
        emit();
      },
    );
    const unsubCo = companyId
      ? onSnapshot(
          query(collection(this.db, 'agencyLinks'), where('memberId', '==', companyId)),
          (snap) => {
            viaCompany = snap.docs.map((d) => d.data() as AgencyLink);
            emit();
          },
        )
      : null;
    return () => {
      unsubMine();
      unsubCo?.();
    };
  }

  /** Live phone position of the assigned tradie en route (throttled by caller)
   *  — drives the customer's real distance/ETA instead of the base address. */
  async setJobTradieLocation(jobId: string, point: GeoPoint): Promise<void> {
    await updateDoc(this.jobRef(jobId), {
      tradieLocation: { ...point, updatedAt: Date.now() },
    });
  }

  /* ----------------------------------------------- browse & choose (§) -- */

  async selectTradie(jobId: string, tradieId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.jobRef(jobId));
      if (!snap.exists()) throw new Error('Job no longer exists.');
      const job = snap.data() as Job;
      if (job.status !== 'searching') throw new Error('This job is no longer open.');
      tx.update(this.jobRef(jobId), {
        selectedTradieId: tradieId,
        'timestamps.selectedAt': Date.now(),
      });
    });
  }

  async expressInterest(jobId: string, tradieId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const jobSnap = await tx.get(this.jobRef(jobId));
      if (!jobSnap.exists()) throw new Error('Job no longer exists.');
      const job = jobSnap.data() as Job;
      if (job.status !== 'searching') throw new Error('This job is no longer open.');
      if ((job.interestedTradies ?? []).some((t) => t.tradieId === tradieId)) return; // already in
      const tSnap = await tx.get(this.userRef(tradieId));
      if (!tSnap.exists()) throw new Error('Tradie not found.');
      const tradie = tSnap.data() as Tradie;
      if (tradie.paymentHold) throw new Error('Your account is paused.');
      const company =
        tradie.companyId && (await tx.get(this.companyRef(tradie.companyId))).data();
      const rateCard = (company as Company | undefined)?.rateCard ?? tradie.rateCard;
      const entry = {
        tradieId,
        businessName: tradie.businessName,
        firstName: tradie.firstName,
        lastName: tradie.lastName,
        ratingAvg: tradie.ratingAvg,
        ratingCount: tradie.ratingCount,
        completedJobs: tradie.completedJobs,
        baseLocation: tradie.baseLocation,
        rateCard,
        companyName: (company as Company | undefined)?.name,
        ...(tradie.engagement ? { engagement: tradie.engagement } : {}),
        wasBusy: tradie.status !== 'available',
        expressedAt: Date.now(),
      };
      tx.update(this.jobRef(jobId), { interestedTradies: arrayUnion(entry) });
    });
  }

  async acceptSelection(jobId: string, tradieId: string): Promise<Job> {
    // Browse-and-choose accept — same server callable as acceptJob; the server
    // derives eligibility (selected tradie vs candidate) from the job state.
    return this.acceptJob(jobId, tradieId);
  }

  async declineSelection(jobId: string, tradieId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.jobRef(jobId));
      if (!snap.exists()) return;
      const job = snap.data() as Job;
      if (job.selectedTradieId !== tradieId) return;
      tx.update(this.jobRef(jobId), {
        selectedTradieId: deleteField(),
        declinedBy: arrayUnion(tradieId),
      });
    });
  }

  async startTravelling(jobId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.jobRef(jobId));
      if (!snap.exists()) return;
      // A tradie can only set off once the customer has confirmed.
      if ((snap.data() as Job).status !== 'confirmed') return;
      tx.update(this.jobRef(jobId), {
        status: 'travelling',
        'timestamps.travellingAt': Date.now(),
      });
    });
  }

  async arriveOnSite(jobId: string, _source: 'gps' | 'manual' = 'manual'): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.jobRef(jobId));
      if (!snap.exists()) return;
      const job = snap.data() as Job;
      if (job.status !== 'confirmed' && job.status !== 'travelling') return;
      tx.update(this.jobRef(jobId), {
        status: 'on_site',
        'timestamps.onSiteAt': Date.now(),
      });
      if (job.tradieId) tx.update(this.userRef(job.tradieId), { status: 'on_site' });
    });
  }

  async completeJob(jobId: string, parts?: JobPart[]): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.jobRef(jobId));
      if (!snap.exists()) return;
      const job = snap.data() as Job;
      if (job.status !== 'on_site' && job.status !== 'travelling') return;
      // Free the tradie for new offers — but never override an explicit
      // 'offline' (mirrors the cancel path / onJobReleased).
      const tradieSnap = job.tradieId ? await tx.get(this.userRef(job.tradieId)) : null;
      const cleanParts = (parts ?? [])
        .map((p) => ({
          description: p.description.trim(),
          qty: Math.max(1, Math.round(p.qty)),
          unitPriceCents: Math.max(0, Math.round(p.unitPriceCents)),
        }))
        .filter((p) => p.description.length > 0);
      tx.update(this.jobRef(jobId), {
        status: 'completed',
        'timestamps.completedAt': Date.now(),
        ...(cleanParts.length ? { parts: cleanParts } : {}),
      });
      // completedJobs is incremented by the onJobCompleted Cloud Function.
      if (job.tradieId && tradieSnap?.exists()) {
        const status = (tradieSnap.data() as Tradie).status;
        if (status === 'job_accepted' || status === 'on_site') {
          tx.update(this.userRef(job.tradieId), { status: 'available' });
        }
      }
    });
  }

  async cancelJob(jobId: string, by: 'customer' | 'tradie'): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.jobRef(jobId));
      if (!snap.exists()) return;
      const job = snap.data() as Job;
      if (job.status === 'completed' || job.status === 'cancelled') return;
      // Only the job doc is written here — releasing the assigned tradie back to
      // `available` is done server-side by the onJobLifecycle function, since a
      // cancelling customer has no permission to write the tradie's user doc.
      // `cancelledBy` lets the server push the OTHER party (who may be driving).
      tx.update(this.jobRef(jobId), {
        status: 'cancelled',
        cancelledBy: by,
        'timestamps.cancelledAt': Date.now(),
      });
    });
  }

  /** Assigned tradie can't make it: hand the job back to dispatch. The job
   *  returns to `searching` with a fresh wave clock (this tradie excluded),
   *  the customer is pushed, and the tradie is freed for new offers. */
  async releaseJob(jobId: string, _tradieId: string): Promise<void> {
    // Server-enforced: releasing clears the assignment + rate snapshot and
    // re-dispatches — clients are forbidden from writing those fields directly.
    if (!functions) throw new Error('Releasing jobs is unavailable right now.');
    await httpsCallable(functions, 'releaseJob')({ jobId });
  }

  /* ------------------------------------------------ scheduled bookings -- */

  async createBooking(
    input: NewJobInput,
  ): Promise<{ jobId: string; assignedTradieName: string; scheduledFor: number }> {
    // Server-side (Admin SDK): pre-assigns the nearest panel/available tradie and
    // creates a `booked` job — clients can't forge the assignment or the address.
    if (!functions) throw new Error('Booking is unavailable right now.');
    const res = (
      await httpsCallable(functions, 'createBooking')({
        trade: input.trade,
        description: input.description,
        photos: input.photos,
        location: input.location,
        propertyId: input.propertyId,
        scheduledFor: input.scheduledFor,
        payer: input.payer,
      })
    ).data as { jobId: string; assignedTradieName?: string; scheduledFor?: number };
    return {
      jobId: res.jobId,
      assignedTradieName: res.assignedTradieName ?? 'a tradie',
      scheduledFor: res.scheduledFor ?? input.scheduledFor ?? 0,
    };
  }

  async confirmAttendance(jobId: string): Promise<void> {
    if (!functions) throw new Error('Confirming a booking is unavailable right now.');
    await httpsCallable(functions, 'confirmAttendance')({ jobId });
  }

  async goNowBooking(jobId: string): Promise<{ address: string }> {
    // Server-side (Admin SDK): reveals the exact address held in jobPrivate and
    // moves booked → travelling, which fires the "on the way" push.
    if (!functions) throw new Error('Starting a booking is unavailable right now.');
    const res = (await httpsCallable(functions, 'goNow')({ jobId })).data as { address?: string };
    return { address: res?.address ?? '' };
  }

  async declineBooking(jobId: string): Promise<void> {
    if (!functions) throw new Error('Handing back a booking is unavailable right now.');
    await httpsCallable(functions, 'declineBooking')({ jobId });
  }

  subscribeTradieBookings(tradieId: string, cb: (jobs: Job[]) => void): Unsubscribe {
    const q = query(collection(this.db, 'jobs'), where('tradieId', '==', tradieId));
    return onSnapshot(q, (snap) => {
      const jobs = snap.docs
        .map((d) => d.data() as Job)
        .filter((j) => j.status === 'booked')
        .sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0));
      cb(jobs);
    });
  }

  async rateAsCustomer(jobId: string, rating: Rating): Promise<void> {
    // Only records the rating on the job. The tradie's rating aggregate is
    // recomputed by the onJobRated Cloud Function (Admin SDK) so it can't be
    // forged from the client.
    await updateDoc(this.jobRef(jobId), { customerRating: rating });
  }

  async rateAsTradie(jobId: string, rating: Rating): Promise<void> {
    await updateDoc(this.jobRef(jobId), { tradieRating: rating });
  }

  /* ------------------------------------------------------- subscriptions -- */

  subscribeJob(jobId: string, cb: (job: Job | null) => void): Unsubscribe {
    return onSnapshot(this.jobRef(jobId), (snap) =>
      cb(snap.exists() ? (snap.data() as Job) : null),
    );
  }

  subscribeCustomerJobs(customerId: string, cb: (jobs: Job[]) => void): Unsubscribe {
    // Filter server-side, sort client-side (avoids a composite index).
    const q = query(collection(this.db, 'jobs'), where('customerId', '==', customerId));
    return onSnapshot(q, (snap) => {
      const jobs = snap.docs.map((d) => d.data() as Job);
      jobs.sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt);
      cb(jobs);
    });
  }

  subscribeTradieActiveJob(tradieId: string, cb: (job: Job | null) => void): Unsubscribe {
    const q = query(collection(this.db, 'jobs'), where('tradieId', '==', tradieId));
    return onSnapshot(q, (snap) => {
      const active = snap.docs
        .map((d) => d.data() as Job)
        .find((j) => ACTIVE_STATUSES.includes(j.status));
      cb(active ?? null);
    });
  }

  subscribeTradieHistory(tradieId: string, cb: (jobs: Job[]) => void): Unsubscribe {
    const q = query(collection(this.db, 'jobs'), where('tradieId', '==', tradieId));
    return onSnapshot(q, (snap) => {
      const jobs = snap.docs
        .map((d) => d.data() as Job)
        .filter((j) => j.status === 'completed')
        .sort((a, b) => (b.timestamps.completedAt ?? 0) - (a.timestamps.completedAt ?? 0));
      cb(jobs);
    });
  }

  subscribeTradieFees(tradieId: string, cb: (fees: FeeLineItem[]) => void): Unsubscribe {
    const q = query(collection(this.db, 'feeLineItems'), where('tradieId', '==', tradieId));
    return onSnapshot(q, (snap) => {
      const fees = snap.docs
        .map((d) => d.data() as FeeLineItem)
        .sort((a, b) => b.createdAt - a.createdAt);
      cb(fees);
    });
  }

  async sendMessage(
    jobId: string,
    from: { role: 'customer' | 'tradie'; id: string; name: string },
    text: string,
  ): Promise<void> {
    const clean = maskContactInfo(text.trim());
    if (!clean) return;
    const ref = doc(collection(this.db, 'messages'));
    const msg: Message = {
      id: ref.id,
      jobId,
      from: from.role,
      senderId: from.id,
      senderName: from.name,
      text: clean,
      at: Date.now(),
    };
    await setDoc(ref, msg);
  }

  subscribeMessages(jobId: string, cb: (messages: Message[]) => void): Unsubscribe {
    const q = query(collection(this.db, 'messages'), where('jobId', '==', jobId));
    return onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => d.data() as Message).sort((a, b) => a.at - b.at);
      cb(msgs);
    });
  }

  /**
   * Wave-dispatch feed. Live query of still-searching jobs whose candidate pool
   * includes this tradie. Returns every candidate job with recomputed distance;
   * the time-based wave gate (`waveEligible`) is applied in the UI, which
   * re-evaluates on a clock so offers surface as the search widens.
   */
  subscribeJobOffers(tradieId: string, cb: (offers: JobOffer[]) => void): Unsubscribe {
    let tradie: Tradie | null = null;
    let candidateJobs: Job[] = [];

    const emit = () => {
      // Only an approved, available tradie who isn't on payment hold receives
      // offers (§5.4). Going offline or onto hold clears the feed reactively.
      if (
        !tradie ||
        tradie.approval !== 'approved' ||
        tradie.status !== 'available' ||
        tradie.paymentHold
      ) {
        return cb([]);
      }
      const offers: JobOffer[] = [];
      for (const job of candidateJobs) {
        if (job.status !== 'searching') continue;
        // Browse-and-choose jobs are NEVER acceptable offers — they surface
        // through the choose feed ("customer is choosing") until picked.
        if ((job.assignmentMode ?? 'auto') === 'choose') continue;
        if (job.declinedBy.includes(tradieId)) continue;
        let km = 0;
        if (
          tradie.baseLocation &&
          job.location.latitude != null &&
          job.location.longitude != null
        ) {
          km = distanceKm(tradie.baseLocation, {
            latitude: job.location.latitude,
            longitude: job.location.longitude,
          });
        }
        offers.push({ job, distanceKm: km, etaMinutes: estimateEtaMinutes(km) });
      }
      offers.sort((a, b) => a.distanceKm - b.distanceKm);
      cb(offers);
    };

    const unsubTradie = onSnapshot(this.userRef(tradieId), (snap) => {
      tradie = snap.exists() ? (snap.data() as Tradie) : null;
      emit();
    });
    // array-contains only (status filtered client-side) to avoid a composite index.
    const unsubJobs = onSnapshot(
      query(
        collection(this.db, 'jobs'),
        where('dispatch.candidateIds', 'array-contains', tradieId),
      ),
      (snap) => {
        candidateJobs = snap.docs.map((d) => d.data() as Job);
        emit();
      },
    );

    return () => {
      unsubTradie();
      unsubJobs();
    };
  }

  subscribeChooseFeed(tradieId: string, cb: (feed: ChooseFeed) => void): Unsubscribe {
    let tradie: Tradie | null = null;
    let candidateJobs: Job[] = [];
    let selectedJobs: Job[] = [];

    const km = (job: Job) =>
      tradie?.baseLocation && job.location.latitude != null && job.location.longitude != null
        ? distanceKm(tradie.baseLocation, {
            latitude: job.location.latitude,
            longitude: job.location.longitude,
          })
        : 0;
    const toOffer = (job: Job): JobOffer => {
      const d = km(job);
      return { job, distanceKm: d, etaMinutes: estimateEtaMinutes(d) };
    };

    const emit = () => {
      if (!tradie || tradie.approval !== 'approved' || tradie.paymentHold) {
        return cb({ selected: [], requests: [] });
      }
      // De-dupe the two queries by job id.
      const byId = new Map<string, Job>();
      for (const j of [...candidateJobs, ...selectedJobs]) byId.set(j.id, j);
      const jobs = [...byId.values()].filter(
        (j) => j.status === 'searching' && j.assignmentMode === 'choose',
      );
      const selected: JobOffer[] = [];
      const requests: JobOffer[] = [];
      for (const job of jobs) {
        if (job.selectedTradieId === tradieId) {
          selected.push(toOffer(job));
          continue;
        }
        // Every candidate (available or busy) sees the request as a "customer
        // is choosing" card — never an acceptable offer. Hide once declined or
        // already opted in.
        if (!job.dispatch?.candidateIds.includes(tradieId)) continue;
        if (job.declinedBy.includes(tradieId)) continue;
        if ((job.interestedTradies ?? []).some((t) => t.tradieId === tradieId)) continue;
        requests.push(toOffer(job));
      }
      selected.sort((a, b) => a.distanceKm - b.distanceKm);
      requests.sort((a, b) => a.distanceKm - b.distanceKm);
      cb({ selected, requests });
    };

    const unsubTradie = onSnapshot(this.userRef(tradieId), (snap) => {
      tradie = snap.exists() ? (snap.data() as Tradie) : null;
      emit();
    });
    const unsubCand = onSnapshot(
      query(collection(this.db, 'jobs'), where('dispatch.candidateIds', 'array-contains', tradieId)),
      (snap) => {
        candidateJobs = snap.docs.map((d) => d.data() as Job);
        emit();
      },
    );
    const unsubSel = onSnapshot(
      query(collection(this.db, 'jobs'), where('selectedTradieId', '==', tradieId)),
      (snap) => {
        selectedJobs = snap.docs.map((d) => d.data() as Job);
        emit();
      },
    );

    return () => {
      unsubTradie();
      unsubCand();
      unsubSel();
    };
  }

  /* ---------------------------------------------------- company invites -- */

  private tagRef(id: string) {
    return doc(this.db, 'companyTags', id);
  }
  private companyRef(id: string) {
    return doc(this.db, 'companies', id);
  }

  async createCompany(input: {
    name: string;
    adminUserId: string;
    adminEmail: string;
    rateCard?: RateCard;
  }): Promise<Company> {
    const ref = doc(collection(this.db, 'companies'));
    const company: Company = {
      id: ref.id,
      name: input.name.trim(),
      adminUserId: input.adminUserId,
      adminEmail: input.adminEmail,
      createdAt: Date.now(),
      sharedCredits: 0,
      status: input.rateCard ? 'active' : 'setup',
      ...(input.rateCard ? { rateCard: input.rateCard } : {}),
    };
    await setDoc(ref, company);
    return company;
  }

  async setCompanyRateCard(companyId: string, rateCard: RateCard): Promise<void> {
    await updateDoc(this.companyRef(companyId), { rateCard, status: 'active' });
  }

  async setSharedCredits(companyId: string, credits: number): Promise<void> {
    await updateDoc(this.companyRef(companyId), { sharedCredits: Math.max(0, Math.floor(credits)) });
  }

  async listCompanyTags(companyId: string): Promise<CompanyTag[]> {
    const snap = await getDocs(
      query(collection(this.db, 'companyTags'), where('companyId', '==', companyId)),
    );
    return snap.docs.map((d) => d.data() as CompanyTag).sort((a, b) => b.createdAt - a.createdAt);
  }

  async issueTag(
    companyId: string,
    seat: { name: string; email: string; phone?: string },
  ): Promise<CompanyTag> {
    const companySnap = await getDoc(this.companyRef(companyId));
    if (!companySnap.exists()) throw new Error('Company not found.');
    const company = companySnap.data() as Company;
    const ref = doc(collection(this.db, 'companyTags'));
    const now = Date.now();
    const tag: CompanyTag = {
      id: ref.id,
      companyId,
      companyName: company.name,
      code: genTagCode(),
      issuedToName: seat.name.trim(),
      issuedToEmail: seat.email.trim().toLowerCase(),
      status: 'issued',
      createdAt: now,
      expiresAt: now + TAG_TTL_MS,
      ...(seat.phone?.trim() ? { issuedToPhone: seat.phone.trim() } : {}),
    };
    await setDoc(ref, tag);
    return tag;
  }

  async getTagByCode(code: string): Promise<CompanyTag | null> {
    const snap = await getDocs(
      query(collection(this.db, 'companyTags'), where('code', '==', code.trim().toUpperCase())),
    );
    return snap.empty ? null : (snap.docs[0].data() as CompanyTag);
  }

  async claimTag(code: string, _tradieId: string, engagement: Engagement): Promise<Company> {
    // Server-side (Admin SDK) so `companyTags` — which carries the intended
    // recipient's email/phone — never needs to be client-readable by code.
    if (!functions) throw new Error('Seat claiming is unavailable right now.');
    const res = (await httpsCallable(functions, 'claimSeatTag')({
      code: code.trim().toUpperCase(),
      engagement,
    })).data as { id: string; name: string };
    return { id: res.id, name: res.name } as Company;
  }

  async validateTag(tagId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const tagSnap = await tx.get(this.tagRef(tagId));
      if (!tagSnap.exists()) return;
      const tag = tagSnap.data() as CompanyTag;
      if (tag.status !== 'claimed' || !tag.claimedByUserId) return;
      const userSnap = await tx.get(this.userRef(tag.claimedByUserId));
      const companySnap = await tx.get(this.companyRef(tag.companyId));
      const user = userSnap.exists() ? (userSnap.data() as Tradie) : null;
      const company = companySnap.exists() ? (companySnap.data() as Company) : null;
      const engagement: Engagement = tag.engagement ?? 'employee';

      tx.update(this.tagRef(tagId), { status: 'validated', validatedAt: Date.now() });
      // Employees trade under the company: personal name + the COMPANY's NZBN
      // (their own identity is stored and restored when they leave).
      // Contractors keep their own business name and NZBN.
      tx.update(this.userRef(tag.claimedByUserId), {
        companyId: tag.companyId,
        companyName: tag.companyName,
        engagement,
        ...(engagement === 'employee' && user
          ? {
              prevBusinessName: user.businessName,
              ...(user.nzbn ? { prevNzbn: user.nzbn } : {}),
              businessName: `${user.firstName} ${user.lastName}`,
              ...(company?.nzbn ? { nzbn: company.nzbn } : { nzbn: deleteField() }),
            }
          : {}),
      });
    });
  }

  async removeTag(
    tagId: string,
    by: 'company' | 'platform_admin',
    reason?: string,
  ): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const tagSnap = await tx.get(this.tagRef(tagId));
      if (!tagSnap.exists()) return;
      const tag = tagSnap.data() as CompanyTag;
      if (tag.status === 'removed') return;
      const userSnap = tag.claimedByUserId ? await tx.get(this.userRef(tag.claimedByUserId)) : null;
      const user = userSnap?.exists() ? (userSnap.data() as Tradie) : null;
      tx.update(this.tagRef(tagId), {
        status: 'removed',
        removedAt: Date.now(),
        removedBy: by,
        removalReason: reason ?? null,
      });
      if (tag.claimedByUserId) {
        tx.update(this.userRef(tag.claimedByUserId), {
          activeTagId: deleteField(),
          companyId: deleteField(),
          companyName: deleteField(),
          engagement: deleteField(),
          // Ex-employees get their own identity back; the company NZBN goes
          // with the company (they're prompted for their own if none stored).
          ...(user?.engagement === 'employee'
            ? {
                businessName: user.prevBusinessName ?? user.businessName,
                nzbn: user.prevNzbn ?? deleteField(),
                prevBusinessName: deleteField(),
                prevNzbn: deleteField(),
              }
            : {}),
        });
      }
    });
  }

  async setTradieNzbn(tradieId: string, nzbn: string): Promise<void> {
    await updateDoc(this.userRef(tradieId), { nzbn: nzbn.trim() });
  }

  async leaveCompany(tradieId: string): Promise<void> {
    const userSnap = await getDoc(this.userRef(tradieId));
    if (!userSnap.exists()) return;
    const t = userSnap.data() as Tradie;
    if (!t.activeTagId) return;
    const tagSnap = await getDoc(this.tagRef(t.activeTagId));
    if (tagSnap.exists() && (tagSnap.data() as CompanyTag).status === 'validated') {
      throw new Error('Only your company can remove you. Ask your company admin.');
    }
    if (tagSnap.exists()) {
      await updateDoc(this.tagRef(t.activeTagId), {
        status: 'removed',
        removedAt: Date.now(),
        removedBy: 'self',
      });
    }
    await updateDoc(this.userRef(tradieId), {
      activeTagId: deleteField(),
      companyId: deleteField(),
      companyName: deleteField(),
      engagement: deleteField(),
      // Ex-employees get their own identity back (see removeTag).
      ...(t.engagement === 'employee'
        ? {
            businessName: t.prevBusinessName ?? t.businessName,
            nzbn: t.prevNzbn ?? deleteField(),
            prevBusinessName: deleteField(),
            prevNzbn: deleteField(),
          }
        : {}),
    });
  }

  async setTradieRateCard(tradieId: string, rateCard: RateCard): Promise<void> {
    await updateDoc(this.userRef(tradieId), { rateCard });
  }

  /* --------------------------------------------------------- properties -- */

  private propertyRef(id: string) {
    return doc(this.db, 'properties', id);
  }

  async createProperty(
    landlord: { id: string; name: string },
    input: { label?: string; address: string; latitude?: number; longitude?: number },
  ): Promise<Property> {
    const ref = doc(collection(this.db, 'properties'));
    const property: Property = {
      id: ref.id,
      landlordId: landlord.id,
      landlordName: landlord.name,
      address: input.address.trim(),
      tenantIds: [],
      tenantEmails: [],
      createdAt: Date.now(),
      ...(input.label?.trim() ? { label: input.label.trim() } : {}),
      ...(input.latitude != null ? { latitude: input.latitude } : {}),
      ...(input.longitude != null ? { longitude: input.longitude } : {}),
    };
    await setDoc(ref, property);
    return property;
  }

  subscribeLandlordProperties(landlordId: string, cb: (p: Property[]) => void): Unsubscribe {
    const q = query(collection(this.db, 'properties'), where('landlordId', '==', landlordId));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => d.data() as Property).sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    });
  }

  subscribeTenantProperties(tenantId: string, cb: (p: Property[]) => void): Unsubscribe {
    const q = query(
      collection(this.db, 'properties'),
      where('tenantIds', 'array-contains', tenantId),
    );
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as Property)));
  }

  async removeProperty(propertyId: string): Promise<void> {
    await deleteDoc(this.propertyRef(propertyId));
  }

  async linkTenant(propertyId: string, tenantEmail: string): Promise<void> {
    if (!functions) throw new Error('Tenant linking is unavailable right now.');
    const email = tenantEmail.trim().toLowerCase();
    // Resolve the email → user id server-side (the `users` collection is no
    // longer client-readable; this callable returns only id + role).
    const res = (await httpsCallable(functions, 'findUserIdByEmail')({ email })).data as {
      found: boolean;
      id?: string;
      role?: string;
    };
    if (!res.found || res.role !== 'customer' || !res.id) {
      throw new Error('No QuickieFix customer account with that email. Ask them to sign up first.');
    }
    await updateDoc(this.propertyRef(propertyId), {
      tenantIds: arrayUnion(res.id),
      tenantEmails: arrayUnion(email),
    });
  }

  async unlinkTenant(propertyId: string, tenantId: string, tenantEmail?: string): Promise<void> {
    await updateDoc(this.propertyRef(propertyId), {
      tenantIds: arrayRemove(tenantId),
      ...(tenantEmail ? { tenantEmails: arrayRemove(tenantEmail.trim().toLowerCase()) } : {}),
    });
  }

  subscribeLandlordJobs(landlordId: string, cb: (jobs: Job[]) => void): Unsubscribe {
    const q = query(collection(this.db, 'jobs'), where('landlordId', '==', landlordId));
    return onSnapshot(q, (snap) => {
      const jobs = snap.docs
        .map((d) => d.data() as Job)
        .sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt);
      cb(jobs);
    });
  }

  /* -------------------------------------------------------------- admin -- */

  async listTradies(): Promise<Tradie[]> {
    const snap = await getDocs(query(collection(this.db, 'users'), where('role', '==', 'tradie')));
    return snap.docs.map((d) => d.data() as Tradie);
  }

  async setApproval(tradieId: string, approval: Tradie['approval']): Promise<void> {
    await updateDoc(this.userRef(tradieId), { approval });
  }

  async setPaymentHold(tradieId: string, hold: boolean): Promise<void> {
    await updateDoc(this.userRef(tradieId), { paymentHold: hold });
  }

  async setFreeCredits(tradieId: string, credits: number): Promise<void> {
    await updateDoc(this.userRef(tradieId), { freeJobCredits: Math.max(0, Math.floor(credits)) });
  }
}

export const firestoreBackend = new FirestoreBackend();
