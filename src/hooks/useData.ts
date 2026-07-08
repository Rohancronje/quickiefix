import { useEffect, useState } from 'react';
import { backend, JobOffer, TradieCandidate } from '../services';
import { Job, Location, TradeCategory } from '../types';

/** Fetch available tradies for a trade + location (one-shot, with refresh). */
export function useAvailableTradies(trade: TradeCategory | null, location: Location | null) {
  const [candidates, setCandidates] = useState<TradieCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!trade || !location) return;
    let active = true;
    setLoading(true);
    backend
      .getAvailableTradies(trade, location)
      .then((c) => active && setCandidates(c))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [trade, location?.address, location?.latitude, location?.longitude, tick]);

  return { candidates, loading, refresh: () => setTick((t) => t + 1) };
}

/** All of a customer's jobs, newest first (live). */
export function useCustomerJobs(customerId: string | undefined): Job[] {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    if (!customerId) return;
    return backend.subscribeCustomerJobs(customerId, setJobs);
  }, [customerId]);
  return jobs;
}

/** A single job (live). `undefined` = still loading, `null` = not found. */
export function useJob(jobId: string | undefined): Job | null | undefined {
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  useEffect(() => {
    if (!jobId) return;
    return backend.subscribeJob(jobId, setJob);
  }, [jobId]);
  return job;
}

/** A tradie's live feed of matching job offers. */
export function useJobOffers(tradieId: string | undefined): JobOffer[] {
  const [offers, setOffers] = useState<JobOffer[]>([]);
  useEffect(() => {
    if (!tradieId) return;
    return backend.subscribeJobOffers(tradieId, setOffers);
  }, [tradieId]);
  return offers;
}

/** A tradie's current active job (accepted/travelling/on-site), or null. */
export function useTradieActiveJob(tradieId: string | undefined): Job | null {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    if (!tradieId) return;
    return backend.subscribeTradieActiveJob(tradieId, setJob);
  }, [tradieId]);
  return job;
}

/** A tradie's completed job history (live). */
export function useTradieHistory(tradieId: string | undefined): Job[] {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    if (!tradieId) return;
    return backend.subscribeTradieHistory(tradieId, setJobs);
  }, [tradieId]);
  return jobs;
}

/** A single user (live) — used to render tradie profiles to customers. */
import { AppUser } from '../types';
export function useUser(userId: string | undefined): AppUser | null {
  const [user, setUser] = useState<AppUser | null>(null);
  useEffect(() => {
    if (!userId) return;
    return backend.subscribeUser(userId, setUser);
  }, [userId]);
  return user;
}
