/**
 * In-memory + AsyncStorage-backed implementation of the Backend contract.
 *
 * It emulates a real-time backend with a tiny pub/sub: every mutation bumps a
 * version and notifies all active subscriptions, which recompute their filtered
 * projection. Data survives app restarts via AsyncStorage. Swap this out for a
 * Firestore-backed implementation without touching any screen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppUser,
  Company,
  CompanyTag,
  Complaint,
  Customer,
  FeeLineItem,
  GeoPoint,
  Job,
  RateCard,
  Rating,
  Tradie,
  TradieStatus,
} from '../types';
import { FEE_CENTS, FREE_CREDITS_DEFAULT, gstOf, monthKey } from '../constants';
import { distanceKm, estimateEtaMinutes } from '../lib/geo';
import { rankCandidates } from '../lib/dispatch';
import { genTagCode, TAG_TTL_MS } from '../lib/tags';
import { uid } from '../lib/id';
import {
  Backend,
  CustomerRegistration,
  JobOffer,
  NewJobInput,
  TradieCandidate,
  TradieRegistration,
  Unsubscribe,
} from './backend';
import { DEMO_PASSWORD, seedCustomers, seedTradies } from './seed';

// v3: company tag model (tags replace invites) + jobs carry companyId/rateSnapshot.
const DB_KEY = 'quickiefix.db.v3';
const SESSION_KEY = 'quickiefix.session.v1';

interface DB {
  users: Record<string, AppUser>;
  credentials: Record<string, { password: string; userId: string }>;
  jobs: Record<string, Job>;
  companies: Record<string, Company>;
  tags: Record<string, CompanyTag>;
  complaints: Record<string, Complaint>;
  fees: Record<string, FeeLineItem>;
}

function seedDb(): DB {
  const users: DB['users'] = {};
  const credentials: DB['credentials'] = {};
  for (const c of seedCustomers) {
    users[c.id] = c;
    credentials[c.email.toLowerCase()] = { password: DEMO_PASSWORD, userId: c.id };
  }
  for (const t of seedTradies) {
    users[t.id] = t;
    credentials[t.email.toLowerCase()] = { password: DEMO_PASSWORD, userId: t.id };
  }
  return { users, credentials, jobs: {}, companies: {}, tags: {}, complaints: {}, fees: {} };
}

class MockBackend implements Backend {
  private db: DB = seedDb();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  /* --------------------------------------------------------- persistence -- */

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        try {
          const raw = await AsyncStorage.getItem(DB_KEY);
          if (raw) {
            // Backfill collections added in later versions.
            const parsed = JSON.parse(raw) as DB;
            this.db = {
              ...parsed,
              companies: parsed.companies ?? {},
              tags: parsed.tags ?? {},
              complaints: parsed.complaints ?? {},
              fees: parsed.fees ?? {},
            };
          } else await this.persist();
        } catch {
          // Corrupt / unavailable storage: fall back to a fresh seed.
          this.db = seedDb();
        }
        this.loaded = true;
      })();
    }
    return this.loadPromise;
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(DB_KEY, JSON.stringify(this.db));
    } catch {
      // Non-fatal for a demo backend.
    }
  }

  /** Notify all subscriptions, then persist. */
  private commit(): void {
    this.listeners.forEach((l) => l());
    void this.persist();
  }

  private subscribe<T>(compute: () => T, cb: (v: T) => void): Unsubscribe {
    const run = () => cb(compute());
    this.listeners.add(run);
    // Emit an initial value once data is guaranteed loaded.
    void this.ensureLoaded().then(run);
    return () => {
      this.listeners.delete(run);
    };
  }

  /* ---------------------------------------------------------------- auth -- */

  async login(email: string, password: string): Promise<AppUser> {
    await this.ensureLoaded();
    const cred = this.db.credentials[email.trim().toLowerCase()];
    if (!cred || cred.password !== password) {
      throw new Error('Incorrect email or password.');
    }
    const user = this.db.users[cred.userId];
    await AsyncStorage.setItem(SESSION_KEY, user.id);
    return user;
  }

  async registerCustomer(input: CustomerRegistration): Promise<Customer> {
    await this.ensureLoaded();
    this.assertEmailFree(input.email);
    const customer: Customer = {
      id: uid('cust_'),
      role: 'customer',
      email: input.email.trim(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      createdAt: Date.now(),
    };
    this.db.users[customer.id] = customer;
    this.db.credentials[customer.email.toLowerCase()] = {
      password: input.password,
      userId: customer.id,
    };
    await AsyncStorage.setItem(SESSION_KEY, customer.id);
    this.commit();
    return customer;
  }

  async registerTradie(input: TradieRegistration): Promise<Tradie> {
    await this.ensureLoaded();
    this.assertEmailFree(input.email);
    const tradie: Tradie = {
      id: uid('trade_'),
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
      approval: 'pending', // remains pending until an admin approves
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
    this.db.users[tradie.id] = tradie;
    this.db.credentials[tradie.email.toLowerCase()] = {
      password: input.password,
      userId: tradie.id,
    };
    await AsyncStorage.setItem(SESSION_KEY, tradie.id);
    this.commit();
    return tradie;
  }

  private assertEmailFree(email: string): void {
    if (this.db.credentials[email.trim().toLowerCase()]) {
      throw new Error('An account with this email already exists.');
    }
  }

  async getUser(id: string): Promise<AppUser | null> {
    await this.ensureLoaded();
    return this.db.users[id] ?? null;
  }

  subscribeUser(id: string, cb: (user: AppUser | null) => void): Unsubscribe {
    return this.subscribe(() => this.db.users[id] ?? null, cb);
  }

  async logout(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
  }

  async getSessionUser(): Promise<AppUser | null> {
    await this.ensureLoaded();
    const id = await AsyncStorage.getItem(SESSION_KEY);
    return id ? this.db.users[id] ?? null : null;
  }

  /* ------------------------------------------------------------- tradie -- */

  async getTradie(id: string): Promise<Tradie | null> {
    await this.ensureLoaded();
    const u = this.db.users[id];
    return u && u.role === 'tradie' ? u : null;
  }

  async setTradieStatus(id: string, status: TradieStatus): Promise<void> {
    await this.ensureLoaded();
    const t = this.db.users[id];
    if (t && t.role === 'tradie') {
      t.status = status;
      this.commit();
    }
  }

  async setTradieLocation(id: string, point: GeoPoint): Promise<void> {
    await this.ensureLoaded();
    const t = this.db.users[id];
    if (t && t.role === 'tradie') {
      t.baseLocation = point;
      this.commit();
    }
  }

  async setServiceRadius(id: string, km: number): Promise<void> {
    await this.ensureLoaded();
    const t = this.db.users[id];
    if (t && t.role === 'tradie') {
      t.serviceRadiusKm = km;
      this.commit();
    }
  }

  /* --------------------------------------------------------------- jobs -- */

  async createJob(requester: { id: string; name: string }, input: NewJobInput): Promise<Job> {
    await this.ensureLoaded();
    const now = Date.now();

    // Snapshot the ranked candidate pool now — this is the wave dispatch order.
    const candidates = await this.getAvailableTradies(input.trade, input.location);
    const candidateIds = rankCandidates(candidates).filter((id) => id !== requester.id);

    const job: Job = {
      id: uid('job_'),
      customerId: requester.id,
      customerName: requester.name,
      trade: input.trade,
      description: input.description,
      photos: input.photos,
      location: input.location,
      urgency: input.urgency,
      scheduledFor: input.scheduledFor,
      isEmergency: input.isEmergency ?? false,
      status: 'searching',
      timestamps: { createdAt: now, searchingAt: now },
      dispatch: { candidateIds, startedAt: now },
      declinedBy: [],
    };
    this.db.jobs[job.id] = job;
    this.commit();
    return job;
  }

  async fileComplaint(job: Job, subject: string, detail: string): Promise<void> {
    await this.ensureLoaded();
    const id = uid('cmp_');
    this.db.complaints[id] = {
      id,
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
    };
    this.commit();
  }

  async getAvailableTradies(
    trade: NewJobInput['trade'],
    location: Job['location'],
  ): Promise<TradieCandidate[]> {
    await this.ensureLoaded();
    const candidates: TradieCandidate[] = [];
    for (const u of Object.values(this.db.users)) {
      if (u.role !== 'tradie') continue;
      if (u.approval !== 'approved' || u.status !== 'available') continue;
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

  async confirmJob(jobId: string): Promise<void> {
    await this.transitionJob(jobId, (job) => {
      if (job.status !== 'accepted') return;
      job.status = 'confirmed';
      job.timestamps.confirmedAt = Date.now();
    });
  }

  async markNoTradieFound(jobId: string): Promise<void> {
    await this.transitionJob(jobId, (job) => {
      if (job.status !== 'searching') return;
      job.status = 'no_tradie_found';
      job.timestamps.noTradieFoundAt = Date.now();
    });
  }

  async acceptJob(jobId: string, tradieId: string): Promise<Job> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (!job) throw new Error('Job no longer exists.');
    // First candidate to accept wins.
    if (job.status !== 'searching') {
      throw new Error('Sorry, this job has already been taken.');
    }
    if (job.dispatch && !job.dispatch.candidateIds.includes(tradieId)) {
      throw new Error('This job is no longer being offered to you.');
    }
    const tradie = this.db.users[tradieId];
    if (!tradie || tradie.role !== 'tradie') throw new Error('Tradie not found.');

    job.status = 'accepted';
    job.tradieId = tradie.id;
    job.tradieName = tradie.businessName;
    job.timestamps.acceptedAt = Date.now();

    // Stamp company + rate snapshot from the tradie's state at acceptance (§6.1).
    const company = tradie.companyId ? this.db.companies[tradie.companyId] : undefined;
    if (company) {
      job.companyId = company.id;
      job.companyName = company.name;
    }
    const rateCard = company?.rateCard ?? tradie.rateCard;
    if (rateCard) {
      job.rateSnapshot = {
        rateCard,
        source: company?.rateCard ? 'company' : 'personal',
        companyName: company?.name,
        capturedAt: Date.now(),
      };
    }

    tradie.status = 'job_accepted';
    tradie.jobsAccepted += 1;
    this.commit();
    return job;
  }

  async declineJob(jobId: string, tradieId: string): Promise<void> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (job && !job.declinedBy.includes(tradieId)) {
      job.declinedBy.push(tradieId);
      this.commit();
    }
  }

  async startTravelling(jobId: string): Promise<void> {
    await this.transitionJob(jobId, (job) => {
      // A tradie can only set off once the customer has confirmed.
      if (job.status !== 'confirmed') return;
      job.status = 'travelling';
      job.timestamps.travellingAt = Date.now();
    });
  }

  async arriveOnSite(jobId: string, _source: 'gps' | 'manual' = 'manual'): Promise<void> {
    await this.transitionJob(jobId, (job) => {
      if (job.status !== 'confirmed' && job.status !== 'travelling') return;
      job.status = 'on_site';
      job.timestamps.onSiteAt = Date.now();
      const t = job.tradieId ? this.db.users[job.tradieId] : null;
      if (t && t.role === 'tradie') t.status = 'on_site';
    });
  }

  async completeJob(jobId: string): Promise<void> {
    await this.transitionJob(jobId, (job) => {
      if (job.status !== 'on_site' && job.status !== 'travelling') return;
      job.status = 'completed';
      job.timestamps.completedAt = Date.now();
      const t = job.tradieId ? this.db.users[job.tradieId] : null;
      if (t && t.role === 'tradie') {
        t.status = 'available';
        t.completedJobs += 1;
        this.recordFee(job, t);
      }
    });
  }

  /**
   * Record the platform fee for a completed job (Pilot Spec §5.3). A free credit
   * waives it; otherwise it's billable and pending the monthly invoice. In the
   * live backend this is done by the onJobCompleted Cloud Function instead.
   */
  private recordFee(job: Job, tradie: Tradie): void {
    const id = uid('fee_');
    // Company shared credits are consumed before the tradie's own (§6.5).
    const company = job.companyId ? this.db.companies[job.companyId] : undefined;
    let useCredit = false;
    if (company && (company.sharedCredits ?? 0) > 0) {
      company.sharedCredits = (company.sharedCredits ?? 0) - 1;
      useCredit = true;
    } else if ((tradie.freeJobCredits ?? 0) > 0) {
      tradie.freeJobCredits -= 1;
      useCredit = true;
    }
    this.db.fees[id] = {
      id,
      tradieId: tradie.id,
      tradieName: tradie.businessName,
      jobId: job.id,
      trade: job.trade,
      companyId: job.companyId,
      amountCents: FEE_CENTS,
      gstCents: gstOf(FEE_CENTS),
      status: useCredit ? 'waived_credit' : 'pending',
      monthKey: monthKey(job.timestamps.completedAt ?? Date.now()),
      createdAt: Date.now(),
    };
  }

  async cancelJob(jobId: string, _by: 'customer' | 'tradie'): Promise<void> {
    await this.transitionJob(jobId, (job) => {
      if (job.status === 'completed' || job.status === 'cancelled') return;
      job.status = 'cancelled';
      job.timestamps.cancelledAt = Date.now();
      const t = job.tradieId ? this.db.users[job.tradieId] : null;
      if (t && t.role === 'tradie' && t.status !== 'offline') t.status = 'available';
    });
  }

  private async transitionJob(jobId: string, fn: (job: Job) => void): Promise<void> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (!job) return;
    fn(job);
    this.commit();
  }

  async rateAsCustomer(jobId: string, rating: Rating): Promise<void> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (!job) return;
    job.customerRating = rating;
    // Feed the rating into the tradie's public reputation.
    const t = job.tradieId ? this.db.users[job.tradieId] : null;
    if (t && t.role === 'tradie') {
      const total = t.ratingAvg * t.ratingCount + rating.stars;
      t.ratingCount += 1;
      t.ratingAvg = Math.round((total / t.ratingCount) * 10) / 10;
    }
    this.commit();
  }

  async rateAsTradie(jobId: string, rating: Rating): Promise<void> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (!job) return;
    job.tradieRating = rating;
    this.commit();
  }

  /* ------------------------------------------------- subscriptions/query -- */

  subscribeJob(jobId: string, cb: (job: Job | null) => void): Unsubscribe {
    return this.subscribe(() => this.db.jobs[jobId] ?? null, cb);
  }

  subscribeCustomerJobs(customerId: string, cb: (jobs: Job[]) => void): Unsubscribe {
    return this.subscribe(
      () =>
        Object.values(this.db.jobs)
          .filter((j) => j.customerId === customerId)
          .sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt),
      cb,
    );
  }

  subscribeTradieActiveJob(tradieId: string, cb: (job: Job | null) => void): Unsubscribe {
    const active = ['accepted', 'confirmed', 'travelling', 'on_site'];
    return this.subscribe(
      () =>
        Object.values(this.db.jobs).find(
          (j) => j.tradieId === tradieId && active.includes(j.status),
        ) ?? null,
      cb,
    );
  }

  subscribeTradieHistory(tradieId: string, cb: (jobs: Job[]) => void): Unsubscribe {
    return this.subscribe(
      () =>
        Object.values(this.db.jobs)
          .filter((j) => j.tradieId === tradieId && j.status === 'completed')
          .sort(
            (a, b) => (b.timestamps.completedAt ?? 0) - (a.timestamps.completedAt ?? 0),
          ),
      cb,
    );
  }

  subscribeTradieFees(tradieId: string, cb: (fees: FeeLineItem[]) => void): Unsubscribe {
    return this.subscribe(
      () =>
        Object.values(this.db.fees)
          .filter((f) => f.tradieId === tradieId)
          .sort((a, b) => b.createdAt - a.createdAt),
      cb,
    );
  }

  subscribeJobOffers(tradieId: string, cb: (offers: JobOffer[]) => void): Unsubscribe {
    return this.subscribe(() => this.matchOffers(tradieId), cb);
  }

  /**
   * Wave dispatch. Returns still-searching jobs whose candidate pool includes
   * this tradie and which they haven't declined. The time-based wave gate is
   * applied in the UI (which re-evaluates on a clock). Sorted nearest-first.
   */
  private matchOffers(tradieId: string): JobOffer[] {
    const tradie = this.db.users[tradieId];
    if (!tradie || tradie.role !== 'tradie') return [];
    if (tradie.approval !== 'approved') return [];

    const offers: JobOffer[] = [];
    for (const job of Object.values(this.db.jobs)) {
      if (job.status !== 'searching') continue;
      if (!job.dispatch?.candidateIds.includes(tradieId)) continue;
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
    return offers.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  /* ------------------------------------------------------ company tags -- */

  async createCompany(input: {
    name: string;
    adminUserId: string;
    adminEmail: string;
    rateCard?: RateCard;
  }): Promise<Company> {
    await this.ensureLoaded();
    const company: Company = {
      id: uid('co_'),
      name: input.name.trim(),
      adminUserId: input.adminUserId,
      adminEmail: input.adminEmail,
      createdAt: Date.now(),
      rateCard: input.rateCard,
      sharedCredits: 0,
      status: input.rateCard ? 'active' : 'setup',
    };
    this.db.companies[company.id] = company;
    this.commit();
    return company;
  }

  async setCompanyRateCard(companyId: string, rateCard: RateCard): Promise<void> {
    await this.ensureLoaded();
    const c = this.db.companies[companyId];
    if (c) {
      c.rateCard = rateCard;
      c.status = 'active';
      this.commit();
    }
  }

  async setSharedCredits(companyId: string, credits: number): Promise<void> {
    await this.ensureLoaded();
    const c = this.db.companies[companyId];
    if (c) {
      c.sharedCredits = Math.max(0, Math.floor(credits));
      this.commit();
    }
  }

  async listCompanyTags(companyId: string): Promise<CompanyTag[]> {
    await this.ensureLoaded();
    return Object.values(this.db.tags)
      .filter((t) => t.companyId === companyId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async issueTag(
    companyId: string,
    seat: { name: string; email: string; phone?: string },
  ): Promise<CompanyTag> {
    await this.ensureLoaded();
    const company = this.db.companies[companyId];
    if (!company) throw new Error('Company not found.');
    const now = Date.now();
    const tag: CompanyTag = {
      id: uid('tag_'),
      companyId,
      companyName: company.name,
      code: genTagCode(),
      issuedToName: seat.name.trim(),
      issuedToEmail: seat.email.trim().toLowerCase(),
      issuedToPhone: seat.phone?.trim(),
      status: 'issued',
      createdAt: now,
      expiresAt: now + TAG_TTL_MS,
    };
    this.db.tags[tag.id] = tag;
    this.commit();
    return tag;
  }

  async getTagByCode(code: string): Promise<CompanyTag | null> {
    await this.ensureLoaded();
    const norm = code.trim().toUpperCase();
    return Object.values(this.db.tags).find((t) => t.code === norm) ?? null;
  }

  async claimTag(code: string, tradieId: string): Promise<Company> {
    await this.ensureLoaded();
    const tag = Object.values(this.db.tags).find((t) => t.code === code.trim().toUpperCase());
    if (!tag) throw new Error('That code is not valid.');
    if (tag.status !== 'issued') throw new Error('That code has already been used.');
    if (Date.now() > tag.expiresAt) throw new Error('That code has expired.');
    const company = this.db.companies[tag.companyId];
    if (!company) throw new Error('That company no longer exists.');
    const t = this.db.users[tradieId];
    if (!t || t.role !== 'tradie') throw new Error('Tradie not found.');
    if (t.activeTagId) throw new Error('You already belong to a company.');

    tag.status = 'claimed';
    tag.claimedByUserId = tradieId;
    tag.claimedAt = Date.now();
    t.activeTagId = tag.id;
    this.commit();
    return company;
  }

  async validateTag(tagId: string): Promise<void> {
    await this.ensureLoaded();
    const tag = this.db.tags[tagId];
    if (!tag || tag.status !== 'claimed' || !tag.claimedByUserId) return;
    tag.status = 'validated';
    tag.validatedAt = Date.now();
    const t = this.db.users[tag.claimedByUserId];
    if (t && t.role === 'tradie') {
      t.companyId = tag.companyId;
      t.companyName = tag.companyName;
    }
    this.commit();
  }

  async removeTag(
    tagId: string,
    by: 'company' | 'platform_admin',
    reason?: string,
  ): Promise<void> {
    await this.ensureLoaded();
    const tag = this.db.tags[tagId];
    if (!tag || tag.status === 'removed') return;
    const tradieId = tag.claimedByUserId;
    tag.status = 'removed';
    tag.removedAt = Date.now();
    tag.removedBy = by;
    tag.removalReason = reason;
    if (tradieId) {
      const t = this.db.users[tradieId];
      if (t && t.role === 'tradie') {
        delete t.activeTagId;
        delete t.companyId;
        delete t.companyName;
      }
    }
    this.commit();
  }

  async leaveCompany(tradieId: string): Promise<void> {
    await this.ensureLoaded();
    const t = this.db.users[tradieId];
    if (!t || t.role !== 'tradie' || !t.activeTagId) return;
    const tag = this.db.tags[t.activeTagId];
    // A validated tag can only be removed by the company (§6.4).
    if (tag && tag.status === 'validated') {
      throw new Error('Only your company can remove you. Ask your company admin.');
    }
    if (tag) {
      tag.status = 'removed';
      tag.removedAt = Date.now();
      tag.removedBy = 'self';
    }
    delete t.activeTagId;
    delete t.companyId;
    delete t.companyName;
    this.commit();
  }

  async setTradieRateCard(tradieId: string, rateCard: RateCard): Promise<void> {
    await this.ensureLoaded();
    const t = this.db.users[tradieId];
    if (t && t.role === 'tradie') {
      t.rateCard = rateCard;
      this.commit();
    }
  }

  /* -------------------------------------------------------------- admin -- */

  async listTradies(): Promise<Tradie[]> {
    await this.ensureLoaded();
    return Object.values(this.db.users).filter(
      (u): u is Tradie => u.role === 'tradie',
    );
  }

  async setApproval(tradieId: string, approval: Tradie['approval']): Promise<void> {
    await this.ensureLoaded();
    const t = this.db.users[tradieId];
    if (t && t.role === 'tradie') {
      t.approval = approval;
      this.commit();
    }
  }

  async setPaymentHold(tradieId: string, hold: boolean): Promise<void> {
    await this.ensureLoaded();
    const t = this.db.users[tradieId];
    if (t && t.role === 'tradie') {
      t.paymentHold = hold;
      this.commit();
    }
  }

  async setFreeCredits(tradieId: string, credits: number): Promise<void> {
    await this.ensureLoaded();
    const t = this.db.users[tradieId];
    if (t && t.role === 'tradie') {
      t.freeJobCredits = Math.max(0, Math.floor(credits));
      this.commit();
    }
  }

  /* ---------------------------------------------------------------- dev -- */

  /** Wipe local data and reseed (used by the profile "reset demo" action). */
  async resetDemoData(): Promise<void> {
    this.db = seedDb();
    this.loaded = true;
    await AsyncStorage.removeItem(SESSION_KEY);
    await this.persist();
    this.listeners.forEach((l) => l());
  }
}

export const mockBackend = new MockBackend();
