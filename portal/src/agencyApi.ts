/**
 * Property-agency portal API: agencies manage a property portfolio, link
 * tenants, and run an APPROVED TRADIE PANEL. Jobs at their properties dispatch
 * only to the panel, with rates hidden (agency commercial terms apply).
 */
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, functions } from './firebase';
import { Agency, AgencyLink, Company, Job, Property } from './types';

/* ---------------------------------------------------------- live queries --- */
/* Query builders for useLive() — all narrow, account-scoped. */

export const panelQuery = (agencyId: string) =>
  query(collection(db, 'agencyLinks'), where('agencyId', '==', agencyId));
export const agencyPropertiesQuery = (adminUserId: string) =>
  query(collection(db, 'properties'), where('landlordId', '==', adminUserId));
export const agencyJobsQuery = (agencyId: string) =>
  query(collection(db, 'jobs'), where('agencyId', '==', agencyId));
export const companyAgencyLinksQuery = (companyId: string) =>
  query(collection(db, 'agencyLinks'), where('memberId', '==', companyId));

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateAgencyCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `QF-AG-${code}`;
}

/* ------------------------------------------------------------------ auth --- */

export async function signUpAgency(
  agencyName: string,
  adminName: string,
  email: string,
  password: string,
): Promise<Agency> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const ref = doc(collection(db, 'agencies'));
  const agency: Agency = {
    id: ref.id,
    name: agencyName.trim(),
    adminUserId: cred.user.uid,
    adminEmail: email.trim().toLowerCase(),
    code: generateAgencyCode(),
    createdAt: Date.now(),
  };
  await setDoc(ref, agency);
  void adminName; // kept for future contact records
  return agency;
}

export async function updateAgencyName(agencyId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'agencies', agencyId), { name: name.trim() });
}

export async function getMyAgency(uid: string): Promise<Agency | null> {
  const snap = await getDocs(query(collection(db, 'agencies'), where('adminUserId', '==', uid)));
  return snap.empty ? null : (snap.docs[0].data() as Agency);
}

/* ----------------------------------------------------------------- panel --- */

export async function listPanel(agencyId: string): Promise<AgencyLink[]> {
  const snap = await getDocs(
    query(collection(db, 'agencyLinks'), where('agencyId', '==', agencyId)),
  );
  return snap.docs
    .map((d) => d.data() as AgencyLink)
    .sort((a, b) => b.requestedAt - a.requestedAt);
}

export async function approveAgencyLink(linkId: string): Promise<void> {
  await updateDoc(doc(db, 'agencyLinks', linkId), {
    status: 'approved',
    approvedAt: Date.now(),
  });
}

export async function removeAgencyLink(linkId: string): Promise<void> {
  await updateDoc(doc(db, 'agencyLinks', linkId), {
    status: 'removed',
    removedAt: Date.now(),
  });
}

/** Company admin joins an agency panel with the agent code. `scope` decides
 *  who it covers: the whole roster, or employees only (no contractors).
 *  Pending until the agency approves. */
export async function requestCompanyAgencyLink(
  company: Company,
  code: string,
  scope: 'all' | 'employees',
): Promise<string> {
  const clean = code.trim().toUpperCase();
  // Resolve the code server-side — agencies aren't client-readable by code.
  const found = (await httpsCallable(functions, 'findAgencyByCode')({ code: clean })).data as {
    found: boolean;
    id?: string;
    name?: string;
  };
  if (!found.found || !found.id) throw new Error('No property agency matches that code.');
  const agency = { id: found.id, name: found.name ?? '' } as Agency;
  const existing = await getDocs(
    query(collection(db, 'agencyLinks'), where('memberId', '==', company.id)),
  );
  const dupe = existing.docs
    .map((d) => d.data() as AgencyLink)
    .find((l) => l.agencyId === agency.id && l.status !== 'removed');
  if (dupe) {
    throw new Error(
      dupe.status === 'approved'
        ? `You're already on ${agency.name}'s panel.`
        : `Your request with ${agency.name} is already pending.`,
    );
  }
  const ref = doc(collection(db, 'agencyLinks'));
  const link: AgencyLink = {
    id: ref.id,
    agencyId: agency.id,
    agencyName: agency.name,
    kind: 'company',
    memberId: company.id,
    memberName: company.name,
    scope,
    status: 'pending',
    requestedAt: Date.now(),
  };
  await setDoc(ref, link);
  return agency.name;
}

/** A company's own panel memberships (for the Settings card). */
export async function listCompanyAgencyLinks(companyId: string): Promise<AgencyLink[]> {
  const snap = await getDocs(
    query(collection(db, 'agencyLinks'), where('memberId', '==', companyId)),
  );
  return snap.docs
    .map((d) => d.data() as AgencyLink)
    .filter((l) => l.status !== 'removed')
    .sort((a, b) => b.requestedAt - a.requestedAt);
}

/* ----------------------------------------------------------------- jobs --- */

/** Every job raised at this agency's managed properties (newest first). */
export async function listAgencyJobs(agencyId: string): Promise<Job[]> {
  const snap = await getDocs(query(collection(db, 'jobs'), where('agencyId', '==', agencyId)));
  return snap.docs
    .map((d) => d.data() as Job)
    .sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt);
}

/* ------------------------------------------------------------ properties --- */

export async function listAgencyProperties(adminUserId: string): Promise<Property[]> {
  const snap = await getDocs(
    query(collection(db, 'properties'), where('landlordId', '==', adminUserId)),
  );
  return snap.docs
    .map((d) => d.data() as Property)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function addAgencyProperty(
  agency: Agency,
  input: {
    label?: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
    invitedTenantEmail?: string;
  },
): Promise<string> {
  const ref = doc(collection(db, 'properties'));
  await setDoc(ref, {
    id: ref.id,
    landlordId: agency.adminUserId,
    landlordName: agency.name,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    address: input.address.trim(),
    ...(input.latitude != null && input.longitude != null
      ? { latitude: input.latitude, longitude: input.longitude }
      : {}),
    tenantIds: [],
    tenantEmails: [],
    invitedTenantEmails: input.invitedTenantEmail ? [input.invitedTenantEmail.trim().toLowerCase()] : [],
    createdAt: Date.now(),
    agencyId: agency.id,
    agencyName: agency.name,
    // Denormalised billing contact shown read-only to tenants (agencies doc is
    // not tenant-readable).
    agencyBillingEmail: agency.adminEmail,
  });
  return ref.id;
}

/** Remove a property from the portfolio. Past jobs keep their own copies of
 *  the property/agency stamps, so history is unaffected. */
export async function removeProperty(propertyId: string): Promise<void> {
  await deleteDoc(doc(db, 'properties', propertyId));
}

/** Record a tenant invite against a property (the email invite itself is sent
 *  via the sendAgencyInvite callable). */
export async function recordTenantInvite(property: Property, email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  await updateDoc(doc(db, 'properties', property.id), {
    invitedTenantEmails: [...new Set([...(property.invitedTenantEmails ?? []), clean])],
  });
}

/**
 * Agency confirms a tenant: approves the link AND auto-attaches them to the
 * property they were invited to (matched by email). Returns the matched
 * property address, or null if no invite matched (manual link needed).
 */
export async function confirmTenantLink(
  agency: Agency,
  link: AgencyLink,
): Promise<string | null> {
  await approveAgencyLink(link.id);
  const email = (link.memberEmail ?? '').toLowerCase();
  if (!email) return null;
  const properties = await listAgencyProperties(agency.adminUserId);
  const match = properties.find((p) => (p.invitedTenantEmails ?? []).includes(email));
  if (!match) return null;
  await updateDoc(doc(db, 'properties', match.id), {
    tenantIds: [...new Set([...match.tenantIds, link.memberId])],
    tenantEmails: [...new Set([...match.tenantEmails, email])],
    invitedTenantEmails: (match.invitedTenantEmails ?? []).filter((e) => e !== email),
  });
  return match.label || match.address;
}

/* ---------------------------------------------------------- bulk import --- */

export interface PortfolioRow {
  label?: string;
  address: string;
  tenantName?: string;
  tenantEmail?: string;
  error?: string;
}

export const PORTFOLIO_TEMPLATE =
  'label,address,tenantName,tenantEmail\nUnit 4,12 Queen Street Auckland,Sam Taylor,sam@example.com\n';

/** Parse the portfolio CSV: one row = one property (+ optional tenant). */
export function parsePortfolioCsv(text: string): PortfolioRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name.toLowerCase());
  const iLabel = col('label');
  const iAddress = col('address');
  const iName = col('tenantname');
  const iEmail = col('tenantemail');
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: PortfolioRow = {
      label: iLabel >= 0 ? cells[iLabel] : undefined,
      address: iAddress >= 0 ? (cells[iAddress] ?? '') : '',
      tenantName: iName >= 0 ? cells[iName] : undefined,
      tenantEmail: iEmail >= 0 ? cells[iEmail] : undefined,
    };
    if (!row.address) row.error = 'Missing address';
    else if (row.tenantEmail && !/.+@.+\..+/.test(row.tenantEmail)) row.error = 'Invalid tenant email';
    return row;
  });
}

export async function linkTenantByEmail(property: Property, email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  // Resolve email → user id server-side (users collection is no longer readable).
  const res = (await httpsCallable(functions, 'findUserIdByEmail')({ email: clean })).data as {
    found: boolean;
    id?: string;
    role?: string;
  };
  if (!res.found || res.role !== 'customer' || !res.id)
    throw new Error('No QuickieFix customer account with that email. Ask them to sign up in the app first.');
  await updateDoc(doc(db, 'properties', property.id), {
    tenantIds: [...new Set([...property.tenantIds, res.id])],
    tenantEmails: [...new Set([...property.tenantEmails, clean])],
  });
}

export async function unlinkTenant(property: Property, tenantId: string, tenantEmail?: string): Promise<void> {
  await updateDoc(doc(db, 'properties', property.id), {
    tenantIds: property.tenantIds.filter((id) => id !== tenantId),
    tenantEmails: tenantEmail
      ? property.tenantEmails.filter((e) => e !== tenantEmail)
      : property.tenantEmails,
  });
}
