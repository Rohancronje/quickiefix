/**
 * QuickieFix domain model.
 * These types mirror the product spec: customers request work, tradies are
 * dispatched to jobs, and every job moves through a defined status flow with
 * timestamps at each transition.
 */

export type Role = 'customer' | 'tradie' | 'admin';

export type TradeCategory =
  | 'electrician'
  | 'plumber'
  | 'gasfitter'
  | 'builder'
  | 'roofer'
  | 'painter'
  | 'locksmith'
  | 'handyman'
  | 'appliance_repair'
  | 'landscaper'
  | 'cleaner'
  | 'pest_control';

/** Live availability status a tradie can hold. */
export type TradieStatus =
  | 'available'
  | 'unavailable'
  | 'job_accepted'
  | 'on_site'
  | 'offline';

/** Whether a tradie account has cleared admin approval. */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

/**
 * The lifecycle of a single job. Each transition is timestamped.
 *
 * Wave-dispatch flow:
 *   searching → accepted → confirmed → travelling → on_site → completed
 *   searching → no_tradie_found  (all waves exhausted; founder concierge rescue)
 *   any pre-completion → cancelled
 *
 * `accepted` = a tradie took the job; `confirmed` = the customer confirmed them
 * (auto-confirmed for emergencies). A tradie can only start travelling once the
 * job is `confirmed`.
 */
export type JobStatus =
  | 'draft'
  | 'searching'
  | 'no_tradie_found'
  | 'accepted'
  | 'confirmed'
  | 'travelling'
  | 'on_site'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Location extends Partial<GeoPoint> {
  address: string;
}

export interface BaseUser {
  id: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  createdAt: number;
}

export interface Customer extends BaseUser {
  role: 'customer';
  homeAddress?: Location;
  workAddress?: Location;
}

export interface Qualification {
  trade: TradeCategory;
  licenceNumber?: string;
  details?: string;
  expiry?: string; // ISO date
  certificateUri?: string;
}

/** A business that manages multiple tradies through the web portal. */
export interface Company {
  id: string;
  name: string;
  tradingName?: string;
  adminUserId: string;
  adminEmail: string;
  createdAt: number;
}

/** An invite that binds a tradie to a company when redeemed. */
export interface CompanyInvite {
  token: string;
  companyId: string;
  companyName: string;
  email?: string;
  createdAt: number;
  redeemedBy?: string;
  redeemedAt?: number;
}

export interface Tradie extends BaseUser {
  role: 'tradie';
  businessName: string;
  tradingName?: string;
  yearsExperience: number;
  // Set when the tradie is bound to a company via an invite (else sole trader).
  companyId?: string;
  companyName?: string;
  businessType?: string;
  nzbn?: string;
  primaryTrade: TradeCategory;
  secondaryTrades: TradeCategory[];
  qualifications: Qualification[];
  approval: ApprovalStatus;
  status: TradieStatus;
  serviceRadiusKm: number;
  baseLocation?: GeoPoint; // where the tradie currently is
  // Reputation
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  jobsOffered: number;
  jobsAccepted: number;
}

export type AppUser = Customer | Tradie;

export type UrgencyType = 'now' | 'scheduled';

export interface JobTimestamps {
  createdAt: number;
  searchingAt?: number;
  acceptedAt?: number;
  confirmedAt?: number;
  noTradieFoundAt?: number;
  travellingAt?: number;
  onSiteAt?: number;
  completedAt?: number;
  cancelledAt?: number;
}

/**
 * Wave-dispatch snapshot, computed once at job creation.
 *
 * `candidateIds` is the ranked pool of eligible tradies (proximity → rating →
 * response rate) captured at the moment the job was created. Wave membership is
 * a pure function of a tradie's index in this list and the elapsed time since
 * `startedAt`, so no server timer is needed to widen the search — every device
 * evaluates it live. See `src/lib/dispatch.ts`.
 */
export interface JobDispatch {
  candidateIds: string[];
  startedAt: number;
}

export interface Rating {
  stars: number; // 1..5
  review?: string;
  tags: string[];
  at: number;
}

export interface Job {
  id: string;
  customerId: string;
  customerName: string;
  trade: TradeCategory;
  description: string;
  photos: string[];
  location: Location;
  urgency: UrgencyType;
  scheduledFor?: number;
  status: JobStatus;
  timestamps: JobTimestamps;

  /** Emergency-category job (gas, no power, flooding, lockout): auto-confirms
   *  after a short window; standard jobs need an explicit customer confirm. */
  isEmergency?: boolean;

  /** Wave-dispatch candidate snapshot (ranked pool + wave clock origin). */
  dispatch?: JobDispatch;

  // Assigned tradie (set on acceptance — the first candidate to accept wins)
  tradieId?: string;
  tradieName?: string;

  // Tradies who were offered this job and declined
  declinedBy: string[];

  // Ratings exchanged after completion
  customerRating?: Rating; // customer -> tradie
  tradieRating?: Rating; // tradie -> customer
}

/** A complaint raised by a customer about a job/tradie, for admin handling. */
export interface Complaint {
  id: string;
  jobId: string;
  customerId: string;
  customerName: string;
  tradieId?: string;
  tradieName?: string;
  trade: TradeCategory;
  subject: string;
  detail: string;
  status: 'open' | 'resolved';
  createdAt: number;
  resolvedAt?: number;
}

/** A read-only projection of a completed job for the timesheet/export view. */
export interface TimesheetRow {
  jobId: string;
  customerName: string;
  address: string;
  trade: TradeCategory;
  status: JobStatus;
  acceptedAt?: number;
  startedAt?: number; // on site
  completedAt?: number;
  totalDurationMs?: number; // accepted -> completed
  workingDurationMs?: number; // on site -> completed
  stars?: number;
}
