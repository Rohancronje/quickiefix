/** Minimal, fully-typed factories for building Job/Tradie fixtures in tests. */
import { Job, Tradie } from '../src/types';
import { TradieCandidate } from '../src/services/backend';

export function makeTradie(over: Partial<Tradie> = {}): Tradie {
  return {
    id: 'tr_1',
    role: 'tradie',
    email: 't@example.com',
    firstName: 'Test',
    lastName: 'Tradie',
    createdAt: 0,
    businessName: 'Test Trade Co',
    yearsExperience: 5,
    primaryTrade: 'electrician',
    secondaryTrades: [],
    qualifications: [],
    approval: 'approved',
    status: 'available',
    serviceRadiusKm: 20,
    ratingAvg: 4.5,
    ratingCount: 10,
    completedJobs: 20,
    jobsOffered: 30,
    jobsAccepted: 25,
    freeJobCredits: 5,
    paymentHold: false,
    ...over,
  };
}

export function makeCandidate(over: Partial<Tradie> = {}, distanceKm = 1): TradieCandidate {
  return { tradie: makeTradie(over), distanceKm, etaMinutes: Math.round(distanceKm * 2) };
}

export function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: 'job_1',
    customerId: 'cust_1',
    customerName: 'Test Customer',
    trade: 'electrician',
    description: 'Something is broken.',
    photos: [],
    location: { address: '1 Test St', latitude: -36.79, longitude: 174.76 },
    urgency: 'now',
    status: 'searching',
    timestamps: { createdAt: 0, searchingAt: 0 },
    dispatch: { candidateIds: [], startedAt: 0 },
    declinedBy: [],
    ...over,
  };
}
