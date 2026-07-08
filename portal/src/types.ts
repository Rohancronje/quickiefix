// Minimal shared shapes (mirrors the mobile app's domain model).

export type TradeCategory = string;

export interface Company {
  id: string;
  name: string;
  tradingName?: string;
  adminUserId: string;
  adminEmail: string;
  createdAt: number;
}

export interface CompanyAdmin {
  companyId: string;
  email: string;
  name: string;
  createdAt: number;
}

export interface CompanyInvite {
  token: string;
  companyId: string;
  companyName: string;
  email?: string;
  createdAt: number;
  redeemedBy?: string;
  redeemedAt?: number;
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
  timestamps: {
    createdAt: number;
    acceptedAt?: number;
    onSiteAt?: number;
    completedAt?: number;
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
