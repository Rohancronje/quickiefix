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
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  arrayUnion,
  collection,
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
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  AppUser,
  Company,
  CompanyInvite,
  Customer,
  GeoPoint,
  Job,
  JobStatus,
  Location,
  Rating,
  Tradie,
  TradeCategory,
  TradieStatus,
} from '../types';
import { distanceKm, estimateEtaMinutes } from '../lib/geo';
import { rankCandidates } from '../lib/dispatch';
import {
  Backend,
  CustomerRegistration,
  JobOffer,
  NewJobInput,
  TradieCandidate,
  TradieRegistration,
  Unsubscribe,
} from './backend';
import { auth, db, storage } from './firebase';

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
    const cred = await signInWithEmailAndPassword(this.auth, email.trim(), password);
    const snap = await getDoc(this.userRef(cred.user.uid));
    if (!snap.exists()) throw new Error('Account record not found.');
    return snap.data() as AppUser;
  }

  async registerCustomer(input: CustomerRegistration): Promise<Customer> {
    const cred = await createUserWithEmailAndPassword(
      this.auth,
      input.email.trim(),
      input.password,
    );
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
    const cred = await createUserWithEmailAndPassword(
      this.auth,
      input.email.trim(),
      input.password,
    );
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

  async logout(): Promise<void> {
    await signOut(this.auth);
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
    const jobRef = doc(collection(this.db, 'jobs'));
    const photos = await this.uploadPhotos(jobRef.id, input.photos);
    const now = Date.now();

    // Snapshot the ranked candidate pool now — this is the wave dispatch order.
    // Exclude the requester (a tradie booking help must not dispatch to himself).
    const candidates = await this.getAvailableTradies(input.trade, input.location);
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
      status: 'searching',
      timestamps: { createdAt: now, searchingAt: now },
      dispatch: { candidateIds, startedAt: now },
      declinedBy: [],
    };
    await setDoc(jobRef, job);
    return job;
  }

  async fileComplaint(job: Job, subject: string, detail: string): Promise<void> {
    const ref = doc(collection(this.db, 'complaints'));
    await setDoc(ref, {
      id: ref.id,
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

  async getAvailableTradies(
    trade: TradeCategory,
    location: Location,
  ): Promise<TradieCandidate[]> {
    // Query available tradies, then filter by trade/approval client-side to
    // avoid a composite index.
    const snap = await getDocs(
      query(collection(this.db, 'users'), where('status', '==', 'available')),
    );
    const candidates: TradieCandidate[] = [];
    for (const d of snap.docs) {
      const u = d.data() as AppUser;
      if (u.role !== 'tradie' || u.approval !== 'approved') continue;
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
    if (!storage || uris.length === 0) return uris;
    const urls: string[] = [];
    for (let i = 0; i < uris.length; i++) {
      try {
        const res = await fetch(uris[i]);
        const blob = await res.blob();
        const r = ref(storage, `jobs/${jobId}/photo_${i}`);
        await uploadBytes(r, blob);
        urls.push(await getDownloadURL(r));
      } catch {
        // Omit failed uploads — a local file:// URI is useless to other devices.
      }
    }
    return urls;
  }

  async acceptJob(jobId: string, tradieId: string): Promise<Job> {
    return runTransaction(this.db, async (tx) => {
      const jobSnap = await tx.get(this.jobRef(jobId));
      if (!jobSnap.exists()) throw new Error('Job no longer exists.');
      const job = jobSnap.data() as Job;
      // First candidate to accept wins — the status guard makes this atomic.
      if (job.status !== 'searching') {
        throw new Error('Sorry, this job has already been taken.');
      }
      // Only a tradie in this job's dispatch pool may accept it. (Legacy jobs
      // created before wave dispatch have no snapshot — skip the guard there.)
      if (job.dispatch && !job.dispatch.candidateIds.includes(tradieId)) {
        throw new Error('This job is no longer being offered to you.');
      }
      const tradieSnap = await tx.get(this.userRef(tradieId));
      if (!tradieSnap.exists()) throw new Error('Tradie not found.');
      const tradie = tradieSnap.data() as Tradie;

      const updated: Job = {
        ...job,
        status: 'accepted',
        tradieId: tradie.id,
        tradieName: tradie.businessName,
        timestamps: { ...job.timestamps, acceptedAt: Date.now() },
      };
      tx.update(this.jobRef(jobId), {
        status: 'accepted',
        tradieId: tradie.id,
        tradieName: tradie.businessName,
        'timestamps.acceptedAt': updated.timestamps.acceptedAt,
      });
      tx.update(this.userRef(tradieId), {
        status: 'job_accepted',
        jobsAccepted: increment(1),
      });
      return updated;
    });
  }

  async declineJob(jobId: string, tradieId: string): Promise<void> {
    // arrayUnion keeps this idempotent without a read.
    await updateDoc(this.jobRef(jobId), { declinedBy: arrayUnion(tradieId) });
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

  async completeJob(jobId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(this.jobRef(jobId));
      if (!snap.exists()) return;
      const job = snap.data() as Job;
      if (job.status !== 'on_site' && job.status !== 'travelling') return;
      tx.update(this.jobRef(jobId), {
        status: 'completed',
        'timestamps.completedAt': Date.now(),
      });
      // completedJobs is incremented by the onJobCompleted Cloud Function.
      if (job.tradieId) {
        tx.update(this.userRef(job.tradieId), { status: 'available' });
      }
    });
  }

  async cancelJob(jobId: string, _by: 'customer' | 'tradie'): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      // All reads first (Firestore requires reads before writes).
      const snap = await tx.get(this.jobRef(jobId));
      if (!snap.exists()) return;
      const job = snap.data() as Job;
      if (job.status === 'completed' || job.status === 'cancelled') return;
      const tSnap = job.tradieId ? await tx.get(this.userRef(job.tradieId)) : null;

      // Then writes.
      tx.update(this.jobRef(jobId), {
        status: 'cancelled',
        'timestamps.cancelledAt': Date.now(),
      });
      if (tSnap?.exists() && (tSnap.data() as Tradie).status !== 'offline') {
        tx.update(this.userRef(job.tradieId!), { status: 'available' });
      }
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
      if (!tradie || tradie.approval !== 'approved') return cb([]);
      const offers: JobOffer[] = [];
      for (const job of candidateJobs) {
        if (job.status !== 'searching') continue;
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

  /* ---------------------------------------------------- company invites -- */

  async getInvite(token: string): Promise<CompanyInvite | null> {
    const snap = await getDoc(doc(this.db, 'invites', token));
    return snap.exists() ? (snap.data() as CompanyInvite) : null;
  }

  async redeemInvite(token: string, tradieId: string): Promise<Company> {
    const inviteRef = doc(this.db, 'invites', token);
    return runTransaction(this.db, async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists()) throw new Error('This invite is not valid.');
      const invite = inviteSnap.data() as CompanyInvite;
      const companySnap = await tx.get(doc(this.db, 'companies', invite.companyId));
      if (!companySnap.exists()) throw new Error('That company no longer exists.');
      const company = companySnap.data() as Company;

      tx.update(this.userRef(tradieId), {
        companyId: company.id,
        companyName: company.name,
      });
      tx.update(inviteRef, { redeemedBy: tradieId, redeemedAt: Date.now() });
      return company;
    });
  }

  async leaveCompany(tradieId: string): Promise<void> {
    await updateDoc(this.userRef(tradieId), {
      companyId: deleteField(),
      companyName: deleteField(),
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
}

export const firestoreBackend = new FirestoreBackend();
