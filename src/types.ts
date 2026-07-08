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

/** The lifecycle of a single job. Each transition is timestamped. */
export type JobStatus =
  | 'draft'
  | 'searching'
  | 'accepted'
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
  travellingAt?: number;
  onSiteAt?: number;
  completedAt?: number;
  cancelledAt?: number;
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

  // The specific tradie the customer directed this request to (chosen from the
  // list of available tradies). Set at creation; the request waits on them.
  requestedTradieId?: string;

  // Assigned tradie (set on acceptance — equals requestedTradieId once accepted)
  tradieId?: string;
  tradieName?: string;

  // Tradies who were offered this job and declined
  declinedBy: string[];

  // Ratings exchanged after completion
  customerRating?: Rating; // customer -> tradie
  tradieRating?: Rating; // tradie -> customer
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
