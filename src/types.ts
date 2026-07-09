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

/** Callout/hourly pricing (Pilot Spec §6.1). Amounts in cents. */
export interface RateCard {
  hourlyRateCents: number;
  calloutFeeCents?: number;
  afterHoursCalloutFeeCents?: number;
}

/**
 * A business that manages multiple tradies through the web portal.
 * In the tag model (§6) the company is a *tag*, not a container: the individual
 * tradie is always the unit; the company associates his jobs for branding,
 * reporting, and billing.
 */
export interface Company {
  id: string;
  name: string;
  tradingName?: string;
  adminUserId: string;
  adminEmail: string;
  createdAt: number;
  nzbn?: string;
  logoUrl?: string;
  billingEmail?: string;
  /** Company rate card — required before the company can go live (§6.3). */
  rateCard?: RateCard;
  /** Shared free-job credits, consumed before a tagged tradie's own (§6.5). */
  sharedCredits?: number;
  /** 'setup' until a rate card is set, then 'active'. */
  status?: 'setup' | 'active';
}

export type CompanyTagStatus = 'issued' | 'claimed' | 'validated' | 'removed';

/**
 * A company "seat" (Pilot Spec §6.2). The company issues a single-use code to a
 * named tradie; the tradie claims it; a platform admin validates the name/email/
 * phone match; only the company (or a platform admin) can remove it.
 */
export interface CompanyTag {
  id: string;
  companyId: string;
  companyName: string;
  code: string; // single-use, random
  issuedToName: string;
  issuedToEmail: string;
  issuedToPhone?: string;
  status: CompanyTagStatus;
  createdAt: number;
  expiresAt: number; // unclaimed codes expire 14 days after issue
  claimedByUserId?: string;
  claimedAt?: number;
  validatedAt?: number;
  removedAt?: number;
  removedBy?: 'company' | 'platform_admin' | 'self';
  removalReason?: string;
}

export interface Tradie extends BaseUser {
  role: 'tradie';
  businessName: string;
  tradingName?: string;
  yearsExperience: number;
  // Set when a company tag is VALIDATED (else sole trader). Denormalised for
  // display + billing; the source of truth is the CompanyTag.
  companyId?: string;
  companyName?: string;
  /** The company tag this tradie has claimed (any status). Null = independent. */
  activeTagId?: string;
  /** Personal rate card (used when not tagged, or while a claim is unvalidated). */
  rateCard?: RateCard;
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
  // Money (Pilot Spec §5). Platform fee is billed off-app; the app only records
  // the tally. `freeJobCredits` waive the fee on the first N completed jobs.
  freeJobCredits: number;
  // Founder-set access lever for sustained non-payment: excluded from dispatch
  // until cleared. There is no automated dunning (§5.4).
  paymentHold?: boolean;
}

export type AppUser = Customer | Tradie;

/**
 * A property claimed by a landlord (Pilot Spec §2, property-light). The landlord
 * links tenants (by their QuickieFix email); jobs created at the property are
 * stamped with the landlord as payer-of-record and the landlord gets visibility
 * + an emailed job record. No approval gating in v0 — jobs dispatch immediately.
 */
export interface Property {
  id: string;
  landlordId: string;
  landlordName: string;
  label?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  tenantIds: string[];
  tenantEmails: string[];
  createdAt: number;
}

export type UrgencyType = 'now' | 'scheduled';

/**
 * How a job is matched to a tradie:
 *  - `auto`   → wave dispatch, first available pro to accept wins (fastest).
 *  - `choose` → the customer browses available (and opted-in) tradies and picks
 *               one; that tradie gets a final accept prompt before lock-in.
 * Emergencies are always forced to `auto` (no time to browse).
 */
export type AssignmentMode = 'auto' | 'choose';

/**
 * A tradie surfaced to the customer in a `choose`-mode job, snapshotted so the
 * customer can browse rate/rating/distance without extra reads. Available
 * tradies come from a live query; busy tradies who opted in are stored here.
 */
export interface InterestedTradie {
  tradieId: string;
  businessName: string;
  firstName: string;
  lastName: string;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  baseLocation?: GeoPoint;
  rateCard?: RateCard;
  companyName?: string;
  /** true when they opted in while unavailable (busy) rather than being live-available. */
  wasBusy?: boolean;
  expressedAt: number;
}

export interface JobTimestamps {
  createdAt: number;
  searchingAt?: number;
  selectedAt?: number;
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

/** The rate card in force when a job was accepted (captured for dispute baseline). */
export interface RateSnapshot {
  rateCard: RateCard;
  source: 'company' | 'personal';
  companyName?: string;
  capturedAt: number;
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

  /** Matching model. Absent ⇒ 'auto' (legacy jobs predate browse-and-choose). */
  assignmentMode?: AssignmentMode;

  /** Wave-dispatch candidate snapshot (ranked pool + wave clock origin). */
  dispatch?: JobDispatch;

  /** `choose` mode: busy tradies who opted in, snapshotted for the browse list. */
  interestedTradies?: InterestedTradie[];
  /** `choose` mode: the tradie the customer picked, pending their final accept. */
  selectedTradieId?: string;

  // Assigned tradie (set on acceptance — the first candidate to accept wins)
  tradieId?: string;
  tradieName?: string;
  /** Company stamped at acceptance from the tradie's validated tag (§6.1).
   *  Immutable thereafter — drives company billing + history even after a leaver. */
  companyId?: string;
  companyName?: string;
  /** Rate card in force at acceptance — the invoice-dispute baseline (§0). */
  rateSnapshot?: RateSnapshot;
  /** Property this job is at, and the landlord as payer-of-record (§2). */
  propertyId?: string;
  landlordId?: string;
  landlordName?: string;

  // Tradies who were offered this job and declined
  declinedBy: string[];

  // Ratings exchanged after completion
  customerRating?: Rating; // customer -> tradie
  tradieRating?: Rating; // tradie -> customer
}

/**
 * A single platform-fee entry, written server-side when a job completes
 * (Pilot Spec §5.3). The app never charges money — this ledger drives the
 * tradie's in-app tally and the founder's monthly CSV export, and later the
 * automated charging with zero migration.
 *
 *  - `waived_credit`: covered by a free-job credit (no money owed)
 *  - `pending`: billable, awaiting the monthly invoice
 *  - `invoiced` / `paid`: set by the founder's off-app billing process
 */
export type FeeStatus = 'waived_credit' | 'pending' | 'invoiced' | 'paid';

export interface FeeLineItem {
  id: string;
  tradieId: string;
  tradieName: string;
  jobId: string;
  trade: TradeCategory;
  companyId?: string; // stamped for company-tagged jobs (Phase 3)
  amountCents: number; // fee ex-GST (e.g. 1500 = $15.00)
  gstCents: number; // GST portion
  status: FeeStatus;
  /** Billing period key, e.g. "2026-07", for monthly grouping. */
  monthKey: string;
  createdAt: number;
}

/** An in-app message on a job thread. Text is contact-masked before storage (§7). */
export interface Message {
  id: string;
  jobId: string;
  from: 'customer' | 'tradie';
  senderId: string;
  senderName: string;
  text: string;
  at: number;
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
