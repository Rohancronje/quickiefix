import { Customer, Tradie } from '../types';

/**
 * Demo data so the app is usable the moment it boots — no manual setup.
 * All accounts share the password `password`. Coordinates are around
 * Auckland CBD (-36.8485, 174.7633) so the dispatch radius logic has real
 * distances to work with.
 */

export const DEMO_PASSWORD = 'password';

export const seedCustomers: Customer[] = [
  {
    id: 'cust_demo',
    role: 'customer',
    email: 'customer@quickiefix.store',
    firstName: 'Sam',
    lastName: 'Taylor',
    createdAt: 0,
    homeAddress: {
      address: '12 Queen Street, Auckland CBD',
      latitude: -36.8485,
      longitude: 174.7633,
    },
  },
];

export const seedTradies: Tradie[] = [
  mkTradie({
    id: 'trade_electric',
    email: 'electrician@quickiefix.store',
    firstName: 'Mia',
    lastName: 'Wallace',
    businessName: 'Bright Spark Electrical',
    primaryTrade: 'electrician',
    secondaryTrades: ['handyman'],
    years: 11,
    lat: -36.852,
    lng: 174.768,
    ratingAvg: 4.9,
    ratingCount: 128,
    completedJobs: 134,
    licence: 'EWRB-104882',
  }),
  mkTradie({
    id: 'trade_plumb',
    email: 'plumber@quickiefix.store',
    firstName: 'Jack',
    lastName: 'Rivers',
    businessName: 'RiverFlow Plumbing & Gas',
    primaryTrade: 'plumber',
    secondaryTrades: ['gasfitter'],
    years: 8,
    lat: -36.845,
    lng: 174.758,
    ratingAvg: 4.7,
    ratingCount: 86,
    completedJobs: 92,
    licence: 'PGDB-55210',
  }),
  mkTradie({
    id: 'trade_lock',
    email: 'locksmith@quickiefix.store',
    firstName: 'Noa',
    lastName: 'Kingi',
    businessName: 'CityLock Rapid Response',
    primaryTrade: 'locksmith',
    secondaryTrades: [],
    years: 6,
    lat: -36.856,
    lng: 174.762,
    ratingAvg: 4.8,
    ratingCount: 54,
    completedJobs: 61,
  }),
  mkTradie({
    id: 'trade_handy',
    email: 'handyman@quickiefix.store',
    firstName: 'Tom',
    lastName: 'Beck',
    businessName: 'FixIt Handyman Services',
    primaryTrade: 'handyman',
    secondaryTrades: ['painter', 'appliance_repair'],
    years: 4,
    lat: -36.841,
    lng: 174.77,
    ratingAvg: 4.5,
    ratingCount: 39,
    completedJobs: 44,
  }),
];

interface MkArgs {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  primaryTrade: Tradie['primaryTrade'];
  secondaryTrades: Tradie['secondaryTrades'];
  years: number;
  lat: number;
  lng: number;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  licence?: string;
}

function mkTradie(a: MkArgs): Tradie {
  return {
    id: a.id,
    role: 'tradie',
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    createdAt: 0,
    businessName: a.businessName,
    tradingName: a.businessName,
    yearsExperience: a.years,
    businessType: 'Sole trader',
    primaryTrade: a.primaryTrade,
    secondaryTrades: a.secondaryTrades,
    qualifications: a.licence
      ? [{ trade: a.primaryTrade, licenceNumber: a.licence, details: 'Verified licence' }]
      : [],
    approval: 'approved',
    status: 'available',
    serviceRadiusKm: 15,
    baseLocation: { latitude: a.lat, longitude: a.lng },
    ratingAvg: a.ratingAvg,
    ratingCount: a.ratingCount,
    completedJobs: a.completedJobs,
    jobsOffered: a.completedJobs + 8,
    jobsAccepted: a.completedJobs,
    freeJobCredits: 0, // established demo tradies have used their free credits
    paymentHold: false,
    rateCard: { hourlyRateCents: 9500, calloutFeeCents: 8000, afterHoursCalloutFeeCents: 14000 },
  };
}
