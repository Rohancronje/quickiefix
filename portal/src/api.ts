import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Company, CompanyAdmin, CompanyInvite, Job, Tradie, TradieStats } from './types';

function inviteToken(): string {
  const raw = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  return raw.slice(0, 10);
}

/* ---------------------------------------------------------------- auth --- */

export async function signUpCompany(
  companyName: string,
  adminName: string,
  email: string,
  password: string,
): Promise<Company> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const uid = cred.user.uid;
  const company: Company = {
    id: uid, // one company per admin (MVP)
    name: companyName.trim(),
    adminUserId: uid,
    adminEmail: email.trim(),
    createdAt: Date.now(),
  };
  await setDoc(doc(db, 'companies', company.id), company);
  const admin: CompanyAdmin = {
    companyId: company.id,
    email: email.trim(),
    name: adminName.trim(),
    createdAt: Date.now(),
  };
  await setDoc(doc(db, 'companyAdmins', uid), admin);
  return company;
}

export async function loginCompany(email: string, password: string): Promise<Company> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const company = await getMyCompany(cred.user.uid);
  if (!company) throw new Error('No company is linked to this account.');
  return company;
}

export async function updateCompanyName(companyId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'companies', companyId), { name: name.trim() });
}

export async function getMyCompany(uid: string): Promise<Company | null> {
  const adminSnap = await getDoc(doc(db, 'companyAdmins', uid));
  if (!adminSnap.exists()) return null;
  const { companyId } = adminSnap.data() as CompanyAdmin;
  const companySnap = await getDoc(doc(db, 'companies', companyId));
  return companySnap.exists() ? (companySnap.data() as Company) : null;
}

/* ------------------------------------------------------------- invites --- */

export async function createInvite(company: Company, email?: string): Promise<CompanyInvite> {
  const token = inviteToken();
  const invite: CompanyInvite = {
    token,
    companyId: company.id,
    companyName: company.name,
    createdAt: Date.now(),
  };
  // Only include email when provided (Firestore rejects undefined fields).
  if (email?.trim()) invite.email = email.trim();
  await setDoc(doc(db, 'invites', token), invite);
  return invite;
}

export async function listInvites(companyId: string): Promise<CompanyInvite[]> {
  const snap = await getDocs(
    query(collection(db, 'invites'), where('companyId', '==', companyId)),
  );
  return snap.docs
    .map((d) => d.data() as CompanyInvite)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeInvite(token: string): Promise<void> {
  await deleteDoc(doc(db, 'invites', token));
}

/* ------------------------------------------------------------- tradies --- */

export async function listCompanyTradies(companyId: string): Promise<Tradie[]> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('companyId', '==', companyId)),
  );
  return snap.docs
    .map((d) => d.data() as Tradie)
    .filter((t) => t.role === 'tradie');
}

export async function getTradie(tradieId: string): Promise<Tradie | null> {
  const snap = await getDoc(doc(db, 'users', tradieId));
  return snap.exists() ? (snap.data() as Tradie) : null;
}

export async function removeTradie(tradieId: string): Promise<void> {
  await updateDoc(doc(db, 'users', tradieId), {
    companyId: deleteField(),
    companyName: deleteField(),
  });
}

export async function getTradieJobs(tradieId: string): Promise<Job[]> {
  const snap = await getDocs(
    query(collection(db, 'jobs'), where('tradieId', '==', tradieId)),
  );
  return snap.docs
    .map((d) => d.data() as Job)
    .sort((a, b) => (b.timestamps.completedAt ?? 0) - (a.timestamps.completedAt ?? 0));
}

export function computeStats(jobs: Job[]): TradieStats {
  const completed = jobs.filter((j) => j.status === 'completed');
  let onSite = 0;
  let duration = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  for (const j of completed) {
    const t = j.timestamps;
    if (t.completedAt && t.onSiteAt) onSite += t.completedAt - t.onSiteAt;
    if (t.completedAt && t.acceptedAt) duration += t.completedAt - t.acceptedAt;
    if (j.customerRating) {
      ratingSum += j.customerRating.stars;
      ratingCount += 1;
    }
  }
  return {
    completedJobs: completed.length,
    ratingAvg: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : 0,
    ratingCount,
    totalOnSiteMs: onSite,
    totalDurationMs: duration,
  };
}
