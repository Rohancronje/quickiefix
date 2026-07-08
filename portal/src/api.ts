import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Company, CompanyAdmin, CompanyTag, Job, RateCard, Tradie, TradieStats } from './types';

const TAG_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TAG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Mirror of the app's tag code generator: "QF-" + 6 chars. */
export function generateTagCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += TAG_ALPHABET[Math.floor(Math.random() * TAG_ALPHABET.length)];
  }
  return `QF-${code}`;
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

export async function updateCompanyProfile(
  companyId: string,
  patch: { billingEmail?: string; nzbn?: string },
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.billingEmail !== undefined) data.billingEmail = patch.billingEmail.trim();
  if (patch.nzbn !== undefined) data.nzbn = patch.nzbn.trim();
  if (Object.keys(data).length === 0) return;
  await updateDoc(doc(db, 'companies', companyId), data);
}

export async function setCompanyRateCard(
  companyId: string,
  rateCard: RateCard,
): Promise<void> {
  await updateDoc(doc(db, 'companies', companyId), { rateCard, status: 'active' });
}

export async function getMyCompany(uid: string): Promise<Company | null> {
  const adminSnap = await getDoc(doc(db, 'companyAdmins', uid));
  if (!adminSnap.exists()) return null;
  const { companyId } = adminSnap.data() as CompanyAdmin;
  const companySnap = await getDoc(doc(db, 'companies', companyId));
  return companySnap.exists() ? (companySnap.data() as Company) : null;
}

/* ---------------------------------------------------------------- tags --- */

export async function issueTag(
  company: Company,
  seat: { name: string; email: string; phone?: string },
): Promise<CompanyTag> {
  const ref = doc(collection(db, 'companyTags'));
  const now = Date.now();
  const tag: CompanyTag = {
    id: ref.id,
    companyId: company.id,
    companyName: company.name,
    code: generateTagCode(),
    issuedToName: seat.name.trim(),
    issuedToEmail: seat.email.trim(),
    status: 'issued',
    createdAt: now,
    expiresAt: now + TAG_TTL_MS,
  };
  // Only include phone when provided (Firestore rejects undefined fields).
  if (seat.phone?.trim()) tag.issuedToPhone = seat.phone.trim();
  await setDoc(ref, tag);
  return tag;
}

export async function listCompanyTags(companyId: string): Promise<CompanyTag[]> {
  const snap = await getDocs(
    query(collection(db, 'companyTags'), where('companyId', '==', companyId)),
  );
  return snap.docs
    .map((d) => d.data() as CompanyTag)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function removeTag(tagId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const tagRef = doc(db, 'companyTags', tagId);
    const snap = await tx.get(tagRef);
    if (!snap.exists()) return;
    const tag = snap.data() as CompanyTag;
    tx.update(tagRef, {
      status: 'removed',
      removedAt: Date.now(),
      removedBy: 'company',
    });
    if (tag.claimedByUserId) {
      tx.update(doc(db, 'users', tag.claimedByUserId), {
        activeTagId: deleteField(),
        companyId: deleteField(),
        companyName: deleteField(),
      });
    }
  });
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
