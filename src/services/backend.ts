/**
 * Backend contract.
 *
 * The whole app talks to this interface — never to Firebase or the mock store
 * directly. That means swapping the mock for real Firebase later is a single
 * file change (`src/services/index.ts`) with zero screen changes.
 *
 * Subscription methods return an `unsubscribe` function and mimic Firestore's
 * real-time listeners, so the dispatch flow already behaves like production.
 */
import {
  AppUser,
  Company,
  CompanyTag,
  Customer,
  FeeLineItem,
  GeoPoint,
  Job,
  Location,
  Qualification,
  RateCard,
  Rating,
  Tradie,
  TradeCategory,
  TradieStatus,
  UrgencyType,
} from '../types';

export type Unsubscribe = () => void;

export interface CustomerRegistration {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface TradieRegistration {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  businessName: string;
  tradingName?: string;
  yearsExperience: number;
  businessType?: string;
  nzbn?: string;
  primaryTrade: TradeCategory;
  secondaryTrades: TradeCategory[];
  qualifications: Qualification[];
  serviceRadiusKm: number;
}

export interface NewJobInput {
  trade: TradeCategory;
  description: string;
  photos: string[];
  location: Location;
  urgency: UrgencyType;
  scheduledFor?: number;
  /** Emergency-category job — auto-confirms faster and jumps the search queue. */
  isEmergency?: boolean;
}

/** A job offer surfaced to a tradie, annotated with distance/eta. */
export interface JobOffer {
  job: Job;
  distanceKm: number;
  etaMinutes: number;
}

/** An available tradie the customer can choose from, with distance/eta. */
export interface TradieCandidate {
  tradie: Tradie;
  distanceKm: number;
  etaMinutes: number;
}

export interface Backend {
  // ---- Auth ----
  login(email: string, password: string): Promise<AppUser>;
  registerCustomer(input: CustomerRegistration): Promise<Customer>;
  registerTradie(input: TradieRegistration): Promise<Tradie>;
  getUser(id: string): Promise<AppUser | null>;
  /** Live subscription to a single user doc (status, reputation, etc.). */
  subscribeUser(id: string, cb: (user: AppUser | null) => void): Unsubscribe;
  /** Restore the currently signed-in user (persisted session), or null. */
  getSessionUser(): Promise<AppUser | null>;
  logout(): Promise<void>;

  // ---- Tradie profile / availability ----
  getTradie(id: string): Promise<Tradie | null>;
  setTradieStatus(id: string, status: TradieStatus): Promise<void>;
  setTradieLocation(id: string, point: GeoPoint): Promise<void>;
  setServiceRadius(id: string, km: number): Promise<void>;

  // ---- Jobs (customer) ----
  /** Available, approved tradies matching a trade, nearest first. Used to build
   *  the wave-dispatch candidate snapshot at job creation. */
  getAvailableTradies(trade: TradeCategory, location: Location): Promise<TradieCandidate[]>;
  /** Create a job and open wave dispatch. The requester can be a customer OR a
   *  tradie booking help; the ranked candidate pool is snapshotted here. */
  createJob(requester: { id: string; name: string }, input: NewJobInput): Promise<Job>;
  /** Raise a complaint about a completed/active job (customer side). */
  fileComplaint(job: Job, subject: string, detail: string): Promise<void>;
  /** Customer confirms the tradie who accepted (accepted → confirmed). */
  confirmJob(jobId: string): Promise<void>;
  /** Flip a still-searching job to no_tradie_found once every wave is exhausted. */
  markNoTradieFound(jobId: string): Promise<void>;
  cancelJob(jobId: string, by: 'customer' | 'tradie'): Promise<void>;
  rateAsCustomer(jobId: string, rating: Rating): Promise<void>;

  // ---- Jobs (tradie) ----
  acceptJob(jobId: string, tradieId: string): Promise<Job>;
  declineJob(jobId: string, tradieId: string): Promise<void>;
  startTravelling(jobId: string): Promise<void>;
  arriveOnSite(jobId: string, source: 'gps' | 'manual'): Promise<void>;
  completeJob(jobId: string): Promise<void>;
  rateAsTradie(jobId: string, rating: Rating): Promise<void>;

  // ---- Real-time subscriptions ----
  subscribeJob(jobId: string, cb: (job: Job | null) => void): Unsubscribe;
  subscribeCustomerJobs(customerId: string, cb: (jobs: Job[]) => void): Unsubscribe;
  /** The tradie's currently active (accepted/travelling/on-site) job, if any. */
  subscribeTradieActiveJob(tradieId: string, cb: (job: Job | null) => void): Unsubscribe;
  /** Live feed of matching, still-searching job offers for a tradie. */
  subscribeJobOffers(tradieId: string, cb: (offers: JobOffer[]) => void): Unsubscribe;
  subscribeTradieHistory(tradieId: string, cb: (jobs: Job[]) => void): Unsubscribe;
  /** Live platform-fee ledger for a tradie (drives the in-app money tally). */
  subscribeTradieFees(tradieId: string, cb: (fees: FeeLineItem[]) => void): Unsubscribe;

  // ---- Company tags (§6) ----
  /** Company/platform issues a seat; returns the created tag (with its code). */
  issueTag(
    companyId: string,
    seat: { name: string; email: string; phone?: string },
  ): Promise<CompanyTag>;
  /** Preview a tag by its code (to show the company before claiming). */
  getTagByCode(code: string): Promise<CompanyTag | null>;
  /** Tradie claims a code — binds the tag (status → claimed), not yet validated. */
  claimTag(code: string, tradieId: string): Promise<Company>;
  /** Platform admin confirms the seat details match → validated (green, locked). */
  validateTag(tagId: string): Promise<void>;
  /** Remove a tag (company admin or platform override); tradie reverts to personal. */
  removeTag(tagId: string, by: 'company' | 'platform_admin', reason?: string): Promise<void>;
  /** Tradie leaves an UNVALIDATED claim themselves (validated tags need the company). */
  leaveCompany(tradieId: string): Promise<void>;
  /** A company's tags (roster + pending) for the portal. */
  listCompanyTags(companyId: string): Promise<CompanyTag[]>;
  /** Tradie sets their personal rate card. */
  setTradieRateCard(tradieId: string, rateCard: RateCard): Promise<void>;
  /** Create a company (used by the portal / tests). */
  createCompany(input: {
    name: string;
    adminUserId: string;
    adminEmail: string;
    rateCard?: RateCard;
  }): Promise<Company>;
  /** Set a company's rate card (company admin). */
  setCompanyRateCard(companyId: string, rateCard: RateCard): Promise<void>;
  /** Set a company's shared free-job credit pool (platform admin, §6.5). */
  setSharedCredits(companyId: string, credits: number): Promise<void>;

  // ---- Admin ----
  listTradies(): Promise<Tradie[]>;
  setApproval(tradieId: string, approval: Tradie['approval']): Promise<void>;
  /** Founder access lever: exclude/reinstate a tradie from dispatch (§5.4). */
  setPaymentHold(tradieId: string, hold: boolean): Promise<void>;
  /** Founder credit control: set a tradie's remaining free-job credits (§5.2). */
  setFreeCredits(tradieId: string, credits: number): Promise<void>;
}
