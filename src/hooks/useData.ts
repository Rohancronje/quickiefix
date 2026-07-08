import { useEffect, useState } from 'react';
import { backend, JobOffer } from '../services';
import { FeeLineItem, Job } from '../types';

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

/** A tradie's platform-fee ledger (live). */
export function useTradieFees(tradieId: string | undefined): FeeLineItem[] {
  const [fees, setFees] = useState<FeeLineItem[]>([]);
  useEffect(() => {
    if (!tradieId) return;
    return backend.subscribeTradieFees(tradieId, setFees);
  }, [tradieId]);
  return fees;
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
