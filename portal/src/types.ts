// Minimal shared shapes (mirrors the mobile app's domain model).

export type TradeCategory = string;

export interface RateCard {
  hourlyRateCents: number;
  calloutFeeCents?: number;
  afterHoursCalloutFeeCents?: number;
}

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
  rateCard?: RateCard;
  sharedCredits?: number; // default 0
  status?: 'setup' | 'active'; // 'setup' until a rateCard is set
}

export interface CompanyAdmin {
  companyId: string;
  email: string;
  name: string;
  createdAt: number;
}

export type CompanyTagStatus = 'issued' | 'claimed' | 'validated' | 'removed';

export interface CompanyTag {
  id: string;
  companyId: string;
  companyName: string;
  code: string; // e.g. "QF-7K2P9M"
  issuedToName: string;
  issuedToEmail: string;
  issuedToPhone?: string;
  /** Declared by the tradie at claim time; the company verifies on confirm. */
  engagement?: 'employee' | 'contractor';
  status: CompanyTagStatus;
  createdAt: number;
  expiresAt: number; // createdAt + 14 days in ms
  claimedByUserId?: string;
  claimedAt?: number;
  validatedAt?: number;
  removedAt?: number;
  removedBy?: 'company' | 'platform_admin' | 'self';
  removalReason?: string;
}

export interface Tradie {
  id: string;
  role: 'tradie';
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  primaryTrade: TradeCategory;
  secondaryTrades: TradeCategory[];
  approval: 'pending' | 'approved' | 'rejected' | 'suspended';
  status: string;
  yearsExperience: number;
  companyId?: string;
  companyName?: string;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  freeJobCredits?: number;
  paymentHold?: boolean;
  rateCard?: RateCard;
  activeTagId?: string;
  engagement?: 'employee' | 'contractor';
  nzbn?: string;
  prevBusinessName?: string;
  prevNzbn?: string;
  baseLocation?: { latitude: number; longitude: number };
}

export type FeeStatus = 'waived_credit' | 'pending' | 'invoiced' | 'paid';

export interface FeeLineItem {
  id: string;
  tradieId: string;
  tradieName: string;
  jobId: string;
  trade: string;
  companyId?: string;
  amountCents: number;
  gstCents: number;
  status: FeeStatus;
  monthKey: string;
  createdAt: number;
}

export interface Customer {
  id: string;
  role: 'customer';
  email: string;
  firstName: string;
  lastName: string;
  createdAt: number;
}

export interface Complaint {
  id: string;
  kind?: 'job' | 'support';
  jobId?: string;
  customerId: string;
  customerName: string;
  tradieId?: string;
  tradieName?: string;
  trade?: string;
  contactEmail?: string;
  raisedByRole?: 'customer' | 'tradie' | 'company' | 'agency';
  subject: string;
  detail: string;
  status: 'open' | 'resolved';
  createdAt: number;
  resolvedAt?: number;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  role: string;
  createdAt: number;
  source?: string;
}

export interface Rating {
  stars: number;
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
  location: { address: string };
  status: string;
  tradieId?: string;
  tradieName?: string;
  isEmergency?: boolean;
  /** Parts & materials recorded by the tradie at completion. */
  parts?: { description: string; qty: number; unitPriceCents: number }[];
  // Stamped when the job is at a managed/owned property.
  propertyId?: string;
  landlordId?: string;
  landlordName?: string;
  agencyId?: string;
  agencyName?: string;
  agencyBillingEmail?: string;
  timestamps: {
    createdAt: number;
    searchingAt?: number;
    acceptedAt?: number;
    confirmedAt?: number;
    noTradieFoundAt?: number;
    travellingAt?: number;
    onSiteAt?: number;
    completedAt?: number;
    cancelledAt?: number;
  };
  customerRating?: Rating;
}

/** Aggregated per-tradie performance for the company dashboard. */
export interface TradieStats {
  completedJobs: number;
  ratingAvg: number;
  ratingCount: number;
  totalOnSiteMs: number;
  totalDurationMs: number;
}

export const TRADE_LABELS: Record<string, string> = {
  electrician: 'Electrician',
  plumber: 'Plumber',
  gasfitter: 'Gasfitter',
  builder: 'Builder',
  roofer: 'Roofer',
  painter: 'Painter',
  locksmith: 'Locksmith',
  handyman: 'Handyman',
  appliance_repair: 'Appliance Repair',
  landscaper: 'Landscaper',
  cleaner: 'Cleaner',
  pest_control: 'Pest Control',
};

export const tradeLabel = (key: string) => TRADE_LABELS[key] ?? key;

/* ---------------------------------------------------- property agencies --- */

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
  agencyId?: string;
  agencyName?: string;
  agencyBillingEmail?: string;
  /** Invited-by-email tenants who haven't claimed the code yet. */
  invitedTenantEmails?: string[];
}

export type AgencyLinkStatus = 'pending' | 'approved' | 'removed';

export interface Agency {
  id: string;
  name: string;
  adminUserId: string;
  adminEmail: string;
  code: string; // e.g. QF-AG-7K2P
  createdAt: number;
}

export interface AgencyLink {
  id: string;
  agencyId: string;
  agencyName: string;
  kind: 'tradie' | 'company' | 'tenant';
  memberId: string;
  memberName: string;
  memberEmail?: string;
  /** Company links only: whole team or employees-only (no contractors). */
  scope?: 'all' | 'employees';
  status: AgencyLinkStatus;
  requestedAt: number;
  approvedAt?: number;
  removedAt?: number;
}

/** Employment model: employees trade under the company NZBN + personal name;
    contractors keep their own business + NZBN and invoice the company. */
export type Engagement = 'employee' | 'contractor';
