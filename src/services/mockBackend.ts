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
  Agency,
  AgencyLink,
  AppUser,
  BillingDetails,
  Company,
  CompanyTag,
  Engagement,
  JobPart,
  JobSource,
  Complaint,
  Customer,
  FeeLineItem,
  GeoPoint,
  Job,
  Location,
  Message,
  Property,
  RateCard,
  Rating,
  Tradie,
  TradieStatus,
} from '../types';
import { FEE_CENTS, FREE_CREDITS_DEFAULT, gstOf, monthKey } from '../constants';
import { distanceKm, estimateEtaMinutes } from '../lib/geo';
import { rankCandidates } from '../lib/dispatch';
import { AgencyPanel, isOnPanel, panelFromLinks } from '../lib/panel';
import { maskContactInfo } from '../lib/mask';
import { genTagCode, TAG_TTL_MS } from '../lib/tags';
import { uid } from '../lib/id';
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
  properties: Record<string, Property>;
  messages: Record<string, Message>;
  agencies: Record<string, Agency>;
  agencyLinks: Record<string, AgencyLink>;
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
  return {
    users,
    credentials,
    jobs: {},
    companies: {},
    tags: {},
    complaints: {},
    fees: {},
    properties: {},
    messages: {},
    agencies: {},
    agencyLinks: {},
  };
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
              properties: parsed.properties ?? {},
              messages: parsed.messages ?? {},
              agencies: parsed.agencies ?? {},
              agencyLinks: parsed.agencyLinks ?? {},
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

  async deleteAccount(): Promise<void> {
    await this.ensureLoaded();
    const id = await AsyncStorage.getItem(SESSION_KEY);
    if (!id) return;
    const user = this.db.users[id];
    if (user) {
      // Mirror the cloud cleanup: credentials, profile, properties, seats, links.
      delete this.db.credentials[user.email.trim().toLowerCase()];
      for (const p of Object.values(this.db.properties)) {
        if (p.landlordId === id) delete this.db.properties[p.id];
        else p.tenantIds = p.tenantIds.filter((t) => t !== id);
      }
      for (const t of Object.values(this.db.tags)) {
        if (t.claimedByUserId === id && t.status !== 'removed') {
          t.status = 'removed';
          t.removedAt = Date.now();
        }
      }
      for (const l of Object.values(this.db.agencyLinks)) {
        if (l.memberId === id) l.status = 'removed';
      }
      delete this.db.users[id];
      this.commit();
    }
    await AsyncStorage.removeItem(SESSION_KEY);
  }

  async setPushToken(userId: string, token: string | null): Promise<void> {
    await this.ensureLoaded();
    const u = this.db.users[userId];
    if (u) {
      if (token) u.pushToken = token;
      else delete u.pushToken;
      this.commit();
    }
  }

  async resetPassword(_email: string): Promise<void> {
    // Mock backend has no email delivery; resolve so the UI shows its confirmation.
    await this.ensureLoaded();
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

    // One live job per trade per customer: a plumbing job already in motion
    // blocks a second plumbing request until it finishes — other trades are fine.
    const live = ['searching', 'accepted', 'confirmed', 'travelling', 'on_site'];
    const clash = Object.values(this.db.jobs).find(
      (j) => j.customerId === requester.id && j.trade === input.trade && live.includes(j.status),
    );
    if (clash) {
      const label = input.trade.replace(/_/g, ' ');
      throw new Error(
        `You already have a ${label} job on the go. Track or cancel it from your activity before requesting another ${label}.`,
      );
    }

    // Emergencies can't wait to browse — always auto-dispatch.
    const mode: 'auto' | 'choose' = input.isEmergency ? 'auto' : input.assignmentMode ?? 'auto';

    // Scheduled jobs: the dispatch clock starts at the booked time.
    const startAt =
      input.urgency === 'scheduled' && input.scheduledFor && input.scheduledFor > now
        ? input.scheduledFor
        : now;

    // Agency-managed property? Read it first — dispatch is panel-only there.
    const property = input.propertyId ? this.db.properties[input.propertyId] : undefined;

    // Snapshot the ranked candidate pool now. `choose` (and scheduled jobs,
    // which dispatch later) also include busy/in-area tradies.
    let candidates =
      mode === 'choose' || startAt > now
        ? this.inAreaTradies(input.trade, input.location)
        : await this.getAvailableTradies(input.trade, input.location);
    let ownPanelIds: string[] | undefined;
    if (property?.agencyId && input.payer !== 'customer') {
      const panel = await this.getAgencyPanel(property.agencyId);
      candidates = candidates.filter((c) => isOnPanel(c.tradie, panel));
      ownPanelIds = candidates
        .filter((c) => panel.tradieIds.includes(c.tradie.id))
        .map((c) => c.tradie.id);
    }
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
      assignmentMode: mode,
      status: 'searching',
      timestamps: { createdAt: now, searchingAt: now },
      dispatch: { candidateIds, startedAt: startAt, ...(ownPanelIds ? { ownPanelIds } : {}) },
      interestedTradies: [],
      declinedBy: [],
    };
    // Stamp the property + landlord (payer-of-record) if this job is at one.
    if (property) {
      job.propertyId = property.id;
      job.landlordId = property.landlordId;
      job.landlordName = property.landlordName;
      if (property.agencyId) {
        if (input.payer === 'customer') {
          // Customer chose to pay themselves: normal open-market job, the
          // agency keeps visibility via the property/landlord stamps only.
          job.billTo = 'customer';
        } else {
          job.agencyId = property.agencyId;
          job.agencyName = property.agencyName;
          job.billTo = 'agency';
        }
      }
    }
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

  async fileSupportTicket(
    user: { id: string; name: string; email: string; role: 'customer' | 'tradie' },
    subject: string,
    detail: string,
  ): Promise<void> {
    await this.ensureLoaded();
    const id = uid('cmp_');
    this.db.complaints[id] = {
      id,
      kind: 'support',
      customerId: user.id,
      customerName: user.name,
      contactEmail: user.email,
      raisedByRole: user.role,
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

  /** In-area matching tradies REGARDLESS of availability (excluding offline /
   *  payment-hold) — the `choose`-mode pool (so busy tradies get the request). */
  private inAreaTradies(
    trade: NewJobInput['trade'],
    location: Job['location'],
  ): TradieCandidate[] {
    const candidates: TradieCandidate[] = [];
    for (const u of Object.values(this.db.users)) {
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

  subscribeSupply(location: GeoPoint | undefined, cb: (s: SupplySnapshot) => void): Unsubscribe {
    return this.subscribe(() => {
      let count = 0;
      let nearestKm: number | null = null;
      let fromCallout: number | null = null;
      let fromHourly: number | null = null;
      for (const u of Object.values(this.db.users)) {
        if (u.role !== 'tradie' || u.approval !== 'approved' || u.paymentHold) continue;
        if (u.status !== 'available') continue;
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
      return {
        count,
        nearestEtaMinutes: nearestKm != null ? estimateEtaMinutes(nearestKm) : undefined,
        fromCalloutCents: fromCallout ?? undefined,
        fromHourlyCents: fromHourly ?? undefined,
      };
    }, cb);
  }

  subscribeAvailableTradies(
    trade: NewJobInput['trade'],
    location: Job['location'],
    cb: (tradies: TradieCandidate[]) => void,
  ): Unsubscribe {
    return this.subscribe(() => {
      const out: TradieCandidate[] = [];
      for (const u of Object.values(this.db.users)) {
        if (u.role !== 'tradie' || u.approval !== 'approved' || u.status !== 'available') continue;
        if (u.paymentHold) continue;
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
      return out.sort((a, b) => a.distanceKm - b.distanceKm);
    }, cb);
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
    // Browse-and-choose: nobody can take the job until the customer picks
    // a tradie, and then only that tradie can accept it.
    if (job.assignmentMode === 'choose' && job.selectedTradieId !== tradieId) {
      throw new Error(
        "The customer is still choosing a tradie. Tap \"I'm interested\" so they can pick you.",
      );
    }
    if (job.dispatch && !job.dispatch.candidateIds.includes(tradieId)) {
      throw new Error('This job is no longer being offered to you.');
    }
    const tradie = this.db.users[tradieId];
    if (!tradie || tradie.role !== 'tradie') throw new Error('Tradie not found.');
    if (tradie.paymentHold) {
      throw new Error('Your account is paused. Clear your balance to accept jobs.');
    }
    // One live job at a time — a double-booked tradie shadows one customer.
    if (tradie.status === 'job_accepted' || tradie.status === 'on_site') {
      throw new Error('Finish your current job before taking another.');
    }

    // Auto-assign means exactly that: first to accept is locked in — no
    // redundant customer-confirm step. Land straight at confirmed.
    job.status = 'confirmed';
    job.tradieId = tradie.id;
    job.tradieName = tradie.businessName;
    job.timestamps.acceptedAt = Date.now();
    job.timestamps.confirmedAt = Date.now();

    // Stamp company + rate snapshot from the tradie's state at acceptance
    // (§6.1). Contractors carry the company badge ONLY on company-sourced
    // work; employees always do.
    this.stampAcceptance(job, tradie);

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

  async setJobBilling(jobId: string, billing: BillingDetails): Promise<void> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (job) {
      job.billing = {
        contactName: billing.contactName.trim(),
        contactEmail: billing.contactEmail.trim(),
      };
      // The mock mirrors the Cloud Function: deterministic code on completion.
      this.commit();
    }
  }

  /* --------------------------------------------------- property agencies -- */

  async setCustomerAddress(
    customerId: string,
    kind: 'home' | 'work',
    location: Location | null,
  ): Promise<void> {
    await this.ensureLoaded();
    const u = this.db.users[customerId] as Customer | undefined;
    if (!u) throw new Error('Customer not found.');
    const field = kind === 'home' ? 'homeAddress' : 'workAddress';
    if (location) u[field] = location;
    else delete u[field];
    this.commit();
  }

  async getAgency(agencyId: string): Promise<Agency | null> {
    await this.ensureLoaded();
    return this.db.agencies[agencyId] ?? null;
  }

  async getAgencyPanel(agencyId: string): Promise<AgencyPanel> {
    return panelFromLinks(
      Object.values(this.db.agencyLinks).filter((l) => l.agencyId === agencyId),
    );
  }

  async requestAgencyLink(
    member: { id: string; name: string; email?: string },
    code: string,
    kind: 'tradie' | 'tenant',
  ): Promise<string> {
    await this.ensureLoaded();
    const clean = code.trim().toUpperCase();
    const agency = Object.values(this.db.agencies).find((a) => a.code === clean);
    if (!agency) throw new Error('No property agency matches that code. Double-check it with the agency.');
    const dupe = Object.values(this.db.agencyLinks).find(
      (l) => l.agencyId === agency.id && l.memberId === member.id && l.status !== 'removed',
    );
    if (dupe) {
      throw new Error(
        dupe.status === 'approved'
          ? `You're already linked with ${agency.name}.`
          : `Your request with ${agency.name} is already pending their approval.`,
      );
    }
    const id = uid('alink_');
    this.db.agencyLinks[id] = {
      id,
      agencyId: agency.id,
      agencyName: agency.name,
      kind,
      memberId: member.id,
      memberName: member.name,
      memberEmail: member.email,
      status: 'pending',
      requestedAt: Date.now(),
    };
    this.commit();
    return agency.name;
  }

  subscribeMyAgencyLinks(
    memberId: string,
    cb: (links: AgencyLink[]) => void,
    companyId?: string,
  ): Unsubscribe {
    return this.subscribe(
      () =>
        Object.values(this.db.agencyLinks)
          .filter(
            (l) =>
              (l.memberId === memberId || (companyId != null && l.memberId === companyId)) &&
              l.status !== 'removed',
          )
          .sort((a, b) => b.requestedAt - a.requestedAt),
      cb,
    );
  }

  /** Test/demo helper: create an agency (mirrors the portal signup). */
  async createAgencyForTest(name: string, adminUserId: string): Promise<Agency> {
    await this.ensureLoaded();
    const id = uid('agency_');
    const agency: Agency = {
      id,
      name,
      adminUserId,
      adminEmail: `${id}@test.dev`,
      code: `QF-AG-${id.slice(-4).toUpperCase()}`,
      createdAt: Date.now(),
    };
    this.db.agencies[id] = agency;
    this.commit();
    return agency;
  }

  /** Test/demo helper: retype a link (e.g. into a company link with scope). */
  async setAgencyLinkKind(
    linkId: string,
    kind: AgencyLink['kind'],
    scope?: AgencyLink['scope'],
  ): Promise<void> {
    await this.ensureLoaded();
    const link = this.db.agencyLinks[linkId];
    if (!link) return;
    link.kind = kind;
    if (scope) link.scope = scope;
    this.commit();
  }

  /** Test/demo helper: approve/remove a panel link (mirrors the portal). */
  async setAgencyLinkStatus(linkId: string, status: AgencyLink['status']): Promise<void> {
    await this.ensureLoaded();
    const link = this.db.agencyLinks[linkId];
    if (!link) return;
    link.status = status;
    if (status === 'approved') link.approvedAt = Date.now();
    if (status === 'removed') link.removedAt = Date.now();
    this.commit();
  }

  /** Test/demo helper: mark a property as agency-managed. */
  async setPropertyAgency(propertyId: string, agency: Agency): Promise<void> {
    await this.ensureLoaded();
    const p = this.db.properties[propertyId];
    if (!p) return;
    p.agencyId = agency.id;
    p.agencyName = agency.name;
    this.commit();
  }

  async setJobTradieLocation(jobId: string, point: GeoPoint): Promise<void> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (job) {
      job.tradieLocation = { ...point, updatedAt: Date.now() };
      this.commit();
    }
  }

  /* ----------------------------------------------- browse & choose (§) -- */

  async selectTradie(jobId: string, tradieId: string): Promise<void> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (!job) throw new Error('Job no longer exists.');
    if (job.status !== 'searching') throw new Error('This job is no longer open.');
    job.selectedTradieId = tradieId;
    job.timestamps.selectedAt = Date.now();
    this.commit();
  }

  async expressInterest(jobId: string, tradieId: string): Promise<void> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (!job) throw new Error('Job no longer exists.');
    if (job.status !== 'searching') throw new Error('This job is no longer open.');
    const tradie = this.db.users[tradieId];
    if (!tradie || tradie.role !== 'tradie') throw new Error('Tradie not found.');
    if (tradie.paymentHold) throw new Error('Your account is paused.');
    job.interestedTradies = job.interestedTradies ?? [];
    if (job.interestedTradies.some((t) => t.tradieId === tradieId)) return;
    const company = tradie.companyId ? this.db.companies[tradie.companyId] : undefined;
    job.interestedTradies.push({
      tradieId,
      businessName: tradie.businessName,
      firstName: tradie.firstName,
      lastName: tradie.lastName,
      ratingAvg: tradie.ratingAvg,
      ratingCount: tradie.ratingCount,
      completedJobs: tradie.completedJobs,
      baseLocation: tradie.baseLocation,
      rateCard: company?.rateCard ?? tradie.rateCard,
      companyName: company?.name,
      engagement: tradie.engagement,
      wasBusy: tradie.status !== 'available',
      expressedAt: Date.now(),
    });
    this.commit();
  }

  async acceptSelection(jobId: string, tradieId: string): Promise<Job> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (!job) throw new Error('Job no longer exists.');
    if (job.status !== 'searching') throw new Error('Sorry, this job has already been taken.');
    if (job.selectedTradieId !== tradieId) {
      throw new Error('This job is no longer being offered to you.');
    }
    const tradie = this.db.users[tradieId];
    if (!tradie || tradie.role !== 'tradie') throw new Error('Tradie not found.');
    if (tradie.paymentHold) {
      throw new Error('Your account is paused. Clear your balance to accept jobs.');
    }
    // One live job at a time — a double-booked tradie shadows one customer.
    if (tradie.status === 'job_accepted' || tradie.status === 'on_site') {
      throw new Error('Finish your current job before taking another.');
    }

    const now = Date.now();
    // The customer already chose them, so accepting lands straight at confirmed.
    job.status = 'confirmed';
    job.tradieId = tradie.id;
    job.tradieName = tradie.businessName;
    job.timestamps.acceptedAt = now;
    job.timestamps.confirmedAt = now;

    this.stampAcceptance(job, tradie);

    tradie.status = 'job_accepted';
    tradie.jobsAccepted += 1;
    this.commit();
    return job;
  }

  async declineSelection(jobId: string, tradieId: string): Promise<void> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (!job || job.selectedTradieId !== tradieId) return;
    delete job.selectedTradieId;
    if (!job.declinedBy.includes(tradieId)) job.declinedBy.push(tradieId);
    this.commit();
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

  async completeJob(jobId: string, parts?: JobPart[]): Promise<void> {
    await this.transitionJob(jobId, (job) => {
      if (job.status !== 'on_site' && job.status !== 'travelling') return;
      job.status = 'completed';
      job.timestamps.completedAt = Date.now();
      const cleanParts = (parts ?? [])
        .map((p) => ({
          description: p.description.trim(),
          qty: Math.max(1, Math.round(p.qty)),
          unitPriceCents: Math.max(0, Math.round(p.unitPriceCents)),
        }))
        .filter((p) => p.description.length > 0);
      if (cleanParts.length) job.parts = cleanParts;
      // Deterministic confirmation code (the live backend's Cloud Function does
      // the same server-side): stable per job, unforgeable by construction.
      job.completionCode = `QF-${job.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
      const t = job.tradieId ? this.db.users[job.tradieId] : null;
      if (t && t.role === 'tradie') {
        // Free the tradie — but never override an explicit 'offline'.
        if (t.status === 'job_accepted' || t.status === 'on_site') t.status = 'available';
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

  async cancelJob(jobId: string, by: 'customer' | 'tradie'): Promise<void> {
    await this.transitionJob(jobId, (job) => {
      if (job.status === 'completed' || job.status === 'cancelled') return;
      job.status = 'cancelled';
      job.cancelledBy = by;
      job.timestamps.cancelledAt = Date.now();
      const t = job.tradieId ? this.db.users[job.tradieId] : null;
      if (t && t.role === 'tradie' && t.status !== 'offline') t.status = 'available';
    });
  }

  /** Assigned tradie can't make it: hand the job back to dispatch. */
  async releaseJob(jobId: string, tradieId: string): Promise<void> {
    await this.ensureLoaded();
    const job = this.db.jobs[jobId];
    if (!job || job.tradieId !== tradieId) return;
    if (!['accepted', 'confirmed', 'travelling'].includes(job.status)) {
      throw new Error("You're already on site — finish up or ask the customer to cancel.");
    }
    const now = Date.now();
    job.status = 'searching';
    delete job.tradieId;
    delete job.tradieName;
    delete job.companyId;
    delete job.companyName;
    delete job.rateSnapshot;
    delete job.tradieLocation;
    delete job.selectedTradieId;
    if (!job.declinedBy.includes(tradieId)) job.declinedBy.push(tradieId);
    job.timestamps.searchingAt = now;
    if (job.dispatch) job.dispatch.startedAt = now;
    const t = this.db.users[tradieId];
    if (t && t.role === 'tradie') t.status = 'available';
    this.commit();
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

  subscribeChooseFeed(tradieId: string, cb: (feed: ChooseFeed) => void): Unsubscribe {
    return this.subscribe(() => {
      const tradie = this.db.users[tradieId];
      if (!tradie || tradie.role !== 'tradie' || tradie.approval !== 'approved' || tradie.paymentHold) {
        return { selected: [], requests: [] };
      }
      const toOffer = (job: Job): JobOffer => {
        let km = 0;
        if (tradie.baseLocation && job.location.latitude != null && job.location.longitude != null) {
          km = distanceKm(tradie.baseLocation, {
            latitude: job.location.latitude,
            longitude: job.location.longitude,
          });
        }
        return { job, distanceKm: km, etaMinutes: estimateEtaMinutes(km) };
      };
      const selected: JobOffer[] = [];
      const requests: JobOffer[] = [];
      for (const job of Object.values(this.db.jobs)) {
        if (job.status !== 'searching' || job.assignmentMode !== 'choose') continue;
        if (job.selectedTradieId === tradieId) {
          selected.push(toOffer(job));
          continue;
        }
        // Every candidate (available or busy) sees the request card.
        if (!job.dispatch?.candidateIds.includes(tradieId)) continue;
        if (job.declinedBy.includes(tradieId)) continue;
        if ((job.interestedTradies ?? []).some((t) => t.tradieId === tradieId)) continue;
        requests.push(toOffer(job));
      }
      selected.sort((a, b) => a.distanceKm - b.distanceKm);
      requests.sort((a, b) => a.distanceKm - b.distanceKm);
      return { selected, requests };
    }, cb);
  }

  async sendMessage(
    jobId: string,
    from: { role: 'customer' | 'tradie'; id: string; name: string },
    text: string,
  ): Promise<void> {
    await this.ensureLoaded();
    const clean = maskContactInfo(text.trim());
    if (!clean) return;
    const id = uid('msg_');
    this.db.messages[id] = {
      id,
      jobId,
      from: from.role,
      senderId: from.id,
      senderName: from.name,
      text: clean,
      at: Date.now(),
    };
    this.commit();
  }

  subscribeMessages(jobId: string, cb: (messages: Message[]) => void): Unsubscribe {
    return this.subscribe(
      () =>
        Object.values(this.db.messages)
          .filter((m) => m.jobId === jobId)
          .sort((a, b) => a.at - b.at),
      cb,
    );
  }

  /**
   * Wave dispatch. Returns still-searching jobs whose candidate pool includes
   * this tradie and which they haven't declined. The time-based wave gate is
   * applied in the UI (which re-evaluates on a clock). Sorted nearest-first.
   */
  private matchOffers(tradieId: string): JobOffer[] {
    const tradie = this.db.users[tradieId];
    if (!tradie || tradie.role !== 'tradie') return [];
    // Only an approved, available tradie not on payment hold receives offers (§5.4).
    if (tradie.approval !== 'approved' || tradie.status !== 'available' || tradie.paymentHold) {
      return [];
    }

    const offers: JobOffer[] = [];
    for (const job of Object.values(this.db.jobs)) {
      if (job.status !== 'searching') continue;
      // Browse-and-choose jobs are NEVER acceptable offers — they surface
      // through the choose feed ("customer is choosing") until picked.
      if ((job.assignmentMode ?? 'auto') === 'choose') continue;
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
    nzbn?: string;
  }): Promise<Company> {
    await this.ensureLoaded();
    const company: Company = {
      id: uid('co_'),
      name: input.name.trim(),
      adminUserId: input.adminUserId,
      adminEmail: input.adminEmail,
      createdAt: Date.now(),
      rateCard: input.rateCard,
      nzbn: input.nzbn,
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

  async claimTag(code: string, tradieId: string, engagement: Engagement): Promise<Company> {
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
    // Company's tick at issue time is authoritative; the tradie's answer only
    // fills the gap on older tags issued without one.
    tag.engagement = tag.engagement ?? engagement;
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
    const company = this.db.companies[tag.companyId];
    if (t && t.role === 'tradie') {
      t.companyId = tag.companyId;
      t.companyName = tag.companyName;
      t.engagement = tag.engagement ?? 'employee';
      // Employees trade under the company: personal name + company NZBN.
      // Contractors keep their own business name and NZBN.
      if (t.engagement === 'employee') {
        t.prevBusinessName = t.businessName;
        if (t.nzbn) t.prevNzbn = t.nzbn;
        t.businessName = `${t.firstName} ${t.lastName}`;
        if (company?.nzbn) t.nzbn = company.nzbn;
        else delete t.nzbn;
      }
    }
    this.commit();
  }

  /** Company/rate stamping at acceptance, sourcing-aware: contractors carry
   *  the company badge only on company-sourced (company-panel) jobs. */
  private stampAcceptance(job: Job, tradie: Tradie): void {
    const sourcedVia: JobSource = job.agencyId
      ? job.dispatch?.ownPanelIds?.includes(tradie.id)
        ? 'own_panel'
        : 'company_panel'
      : 'open_market';
    job.sourcedVia = sourcedVia;
    const company = tradie.companyId ? this.db.companies[tradie.companyId] : undefined;
    const useCompany =
      !!company && (tradie.engagement !== 'contractor' || sourcedVia === 'company_panel');
    if (useCompany && company) {
      job.companyId = company.id;
      job.companyName = company.name;
    }
    const rateCard = useCompany ? (company?.rateCard ?? tradie.rateCard) : tradie.rateCard;
    // Agency jobs: rates never show — panel members bill on agency terms.
    if (rateCard && !job.agencyId) {
      job.rateSnapshot = {
        rateCard,
        source: useCompany && company?.rateCard ? 'company' : 'personal',
        companyName: useCompany ? company?.name : undefined,
        capturedAt: Date.now(),
      };
    }
  }

  /** Restore an ex-employee's own identity when they leave / are removed. */
  private restoreIdentity(t: Tradie): void {
    if (t.engagement === 'employee') {
      t.businessName = t.prevBusinessName ?? t.businessName;
      if (t.prevNzbn) t.nzbn = t.prevNzbn;
      else delete t.nzbn; // prompted to add their own
      delete t.prevBusinessName;
      delete t.prevNzbn;
    }
    delete t.engagement;
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
        this.restoreIdentity(t);
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
    this.restoreIdentity(t);
    delete t.activeTagId;
    delete t.companyId;
    delete t.companyName;
    this.commit();
  }

  async setTradieNzbn(tradieId: string, nzbn: string): Promise<void> {
    await this.ensureLoaded();
    const t = this.db.users[tradieId];
    if (t && t.role === 'tradie') {
      t.nzbn = nzbn.trim();
      this.commit();
    }
  }

  async setTradieRateCard(tradieId: string, rateCard: RateCard): Promise<void> {
    await this.ensureLoaded();
    const t = this.db.users[tradieId];
    if (t && t.role === 'tradie') {
      t.rateCard = rateCard;
      this.commit();
    }
  }

  /* --------------------------------------------------------- properties -- */

  async createProperty(
    landlord: { id: string; name: string },
    input: { label?: string; address: string; latitude?: number; longitude?: number },
  ): Promise<Property> {
    await this.ensureLoaded();
    const property: Property = {
      id: uid('prop_'),
      landlordId: landlord.id,
      landlordName: landlord.name,
      label: input.label?.trim() || undefined,
      address: input.address.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      tenantIds: [],
      tenantEmails: [],
      createdAt: Date.now(),
    };
    this.db.properties[property.id] = property;
    this.commit();
    return property;
  }

  subscribeLandlordProperties(landlordId: string, cb: (p: Property[]) => void): Unsubscribe {
    return this.subscribe(
      () =>
        Object.values(this.db.properties)
          .filter((p) => p.landlordId === landlordId)
          .sort((a, b) => b.createdAt - a.createdAt),
      cb,
    );
  }

  subscribeTenantProperties(tenantId: string, cb: (p: Property[]) => void): Unsubscribe {
    return this.subscribe(
      () => Object.values(this.db.properties).filter((p) => p.tenantIds.includes(tenantId)),
      cb,
    );
  }

  async removeProperty(propertyId: string): Promise<void> {
    await this.ensureLoaded();
    delete this.db.properties[propertyId];
    this.commit();
  }

  async linkTenant(propertyId: string, tenantEmail: string): Promise<void> {
    await this.ensureLoaded();
    const property = this.db.properties[propertyId];
    if (!property) throw new Error('Property not found.');
    const email = tenantEmail.trim().toLowerCase();
    const user = Object.values(this.db.users).find((u) => u.email.toLowerCase() === email);
    if (!user || user.role !== 'customer') {
      throw new Error('No QuickieFix customer account with that email. Ask them to sign up first.');
    }
    if (!property.tenantIds.includes(user.id)) property.tenantIds.push(user.id);
    if (!property.tenantEmails.includes(email)) property.tenantEmails.push(email);
    this.commit();
  }

  async unlinkTenant(propertyId: string, tenantId: string): Promise<void> {
    await this.ensureLoaded();
    const property = this.db.properties[propertyId];
    if (!property) return;
    const user = this.db.users[tenantId];
    property.tenantIds = property.tenantIds.filter((id) => id !== tenantId);
    if (user) {
      property.tenantEmails = property.tenantEmails.filter(
        (e) => e !== user.email.toLowerCase(),
      );
    }
    this.commit();
  }

  subscribeLandlordJobs(landlordId: string, cb: (jobs: Job[]) => void): Unsubscribe {
    return this.subscribe(
      () =>
        Object.values(this.db.jobs)
          .filter((j) => j.landlordId === landlordId)
          .sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt),
      cb,
    );
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
