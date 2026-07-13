/**
 * Property-agency portal API: agencies manage a property portfolio, link
 * tenants, and run an APPROVED TRADIE PANEL. Jobs at their properties dispatch
 * only to the panel, with rates hidden (agency commercial terms apply).
 */
import { createUserWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Agency, AgencyLink, Company, Property } from './types';

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
  const agencySnap = await getDocs(query(collection(db, 'agencies'), where('code', '==', clean)));
  if (agencySnap.empty) throw new Error('No property agency matches that code.');
  const agency = agencySnap.docs[0].data() as Agency;
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
  input: { label?: string; address: string },
): Promise<void> {
  const ref = doc(collection(db, 'properties'));
  await setDoc(ref, {
    id: ref.id,
    landlordId: agency.adminUserId,
    landlordName: agency.name,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    address: input.address.trim(),
    tenantIds: [],
    tenantEmails: [],
    createdAt: Date.now(),
    agencyId: agency.id,
    agencyName: agency.name,
  });
}

export async function linkTenantByEmail(property: Property, email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  // Emails are stored as-typed — match case-insensitively (pilot-scale scan).
  const snap = await getDocs(collection(db, 'users'));
  const user = snap.docs
    .map((d) => d.data() as { id: string; role: string; email?: string })
    .find((u) => u.role === 'customer' && (u.email ?? '').toLowerCase() === clean);
  if (!user) throw new Error('No QuickieFix customer account with that email. Ask them to sign up in the app first.');
  await updateDoc(doc(db, 'properties', property.id), {
    tenantIds: [...new Set([...property.tenantIds, user.id])],
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
