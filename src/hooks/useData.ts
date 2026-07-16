import { useEffect, useState } from 'react';
import { AgencyPanel } from '../lib/panel';
import { backend, ChooseFeed, JobOffer, SupplySnapshot, TradieCandidate } from '../services';
import { Agency, FeeLineItem, Job, Location, Message, Property, TradeCategory } from '../types';

/** A single user (live) — used to render tradie profiles to customers. */
import { AppUser } from '../types';

/** Live message thread for a job (oldest first). */
export function useMessages(jobId: string | undefined): Message[] {
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    if (!jobId) return;
    return backend.subscribeMessages(jobId, setMessages);
  }, [jobId]);
  return messages;
}

/** Properties a landlord owns (live). */
export function useLandlordProperties(landlordId: string | undefined): Property[] {
  const [props, setProps] = useState<Property[]>([]);
  useEffect(() => {
    if (!landlordId) return;
    return backend.subscribeLandlordProperties(landlordId, setProps);
  }, [landlordId]);
  return props;
}

/** Public agency record — billing contact shown read-only when the agency
 *  pays for a managed-property job. */
export function useAgency(agencyId: string | undefined): Agency | null {
  const [agency, setAgency] = useState<Agency | null>(null);
  useEffect(() => {
    setAgency(null);
    if (!agencyId) return;
    let live = true;
    void backend.getAgency(agencyId).then((a) => {
      if (live) setAgency(a);
    });
    return () => {
      live = false;
    };
  }, [agencyId]);
  return agency;
}

/** An agency's approved tradie panel — who may serve its properties. Used by
 *  the request-flow preview so tenants only see agency-approved tradies. */
export function useAgencyPanel(agencyId: string | undefined): AgencyPanel | null {
  const [panel, setPanel] = useState<AgencyPanel | null>(null);
  useEffect(() => {
    setPanel(null);
    if (!agencyId) return;
    let live = true;
    void backend.getAgencyPanel(agencyId).then((p) => {
      if (live) setPanel(p);
    });
    return () => {
      live = false;
    };
  }, [agencyId]);
  return panel;
}

/** Properties a tenant is linked to (live). */
export function useTenantProperties(tenantId: string | undefined): Property[] {
  const [props, setProps] = useState<Property[]>([]);
  useEffect(() => {
    if (!tenantId) return;
    return backend.subscribeTenantProperties(tenantId, setProps);
  }, [tenantId]);
  return props;
}

/** Jobs at a landlord's properties (live, visibility only). */
export function useLandlordJobs(landlordId: string | undefined): Job[] {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    if (!landlordId) return;
    return backend.subscribeLandlordJobs(landlordId, setJobs);
  }, [landlordId]);
  return jobs;
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

/** A tradie's `choose`-mode feed: jobs they've been picked for + opt-in requests. */
export function useChooseFeed(tradieId: string | undefined): ChooseFeed {
  const [feed, setFeed] = useState<ChooseFeed>({ selected: [], requests: [] });
  useEffect(() => {
    if (!tradieId) return;
    return backend.subscribeChooseFeed(tradieId, setFeed);
  }, [tradieId]);
  return feed;
}

/** Live proof of supply — count / nearest ETA / from-price (home hero, step 4). */
export function useSupply(location?: { latitude?: number; longitude?: number }): SupplySnapshot {
  const [supply, setSupply] = useState<SupplySnapshot>({ count: 0 });
  const lat = location?.latitude;
  const lng = location?.longitude;
  useEffect(() => {
    return backend.subscribeSupply(
      lat != null && lng != null ? { latitude: lat, longitude: lng } : undefined,
      setSupply,
    );
  }, [lat, lng]);
  return supply;
}

/** Live list of available tradies for a trade near a location (browse list). */
export function useAvailableTradies(
  trade: TradeCategory | undefined,
  location: Location | undefined,
): TradieCandidate[] {
  const [tradies, setTradies] = useState<TradieCandidate[]>([]);
  const lat = location?.latitude;
  const lng = location?.longitude;
  useEffect(() => {
    if (!trade || !location) return;
    return backend.subscribeAvailableTradies(trade, location, setTradies);
    // Re-subscribe only when the trade or coordinates change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade, lat, lng]);
  return tradies;
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
/** Public profile of ANOTHER user (a customer viewing their tradie, a tradie
 *  viewing their customer). Reads the publicProfiles mirror — the private
 *  `users` doc is only readable by its owner. For the signed-in user's OWN doc
 *  use AuthContext, which subscribes to `users` directly. */
export function useUser(userId: string | undefined): AppUser | null {
  const [user, setUser] = useState<AppUser | null>(null);
  useEffect(() => {
    if (!userId) return;
    return backend.subscribePublicProfile(userId, setUser);
  }, [userId]);
  return user;
}
