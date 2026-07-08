import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { Company, CompanyTag, Complaint, Customer, FeeLineItem, Job, Tradie } from './types';

export async function listAllUsers(): Promise<(Tradie | Customer)[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => d.data() as Tradie | Customer);
}

export async function listAllJobs(): Promise<Job[]> {
  const snap = await getDocs(collection(db, 'jobs'));
  return snap.docs
    .map((d) => d.data() as Job)
    .sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt);
}

export async function listCompanies(): Promise<Company[]> {
  const snap = await getDocs(collection(db, 'companies'));
  return snap.docs.map((d) => d.data() as Company);
}

export async function listComplaints(): Promise<Complaint[]> {
  const snap = await getDocs(collection(db, 'complaints'));
  return snap.docs
    .map((d) => d.data() as Complaint)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function setApproval(
  tradieId: string,
  approval: Tradie['approval'],
): Promise<void> {
  await updateDoc(doc(db, 'users', tradieId), { approval });
}

export async function resolveComplaint(id: string): Promise<void> {
  await updateDoc(doc(db, 'complaints', id), { status: 'resolved', resolvedAt: Date.now() });
}

export async function listFeeLineItems(): Promise<FeeLineItem[]> {
  const snap = await getDocs(collection(db, 'feeLineItems'));
  return snap.docs
    .map((d) => d.data() as FeeLineItem)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Founder access lever: pause/reinstate a tradie from dispatch (§5.4). */
export async function setPaymentHold(tradieId: string, hold: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', tradieId), { paymentHold: hold });
}

/** Founder credit control: set a tradie's remaining free-job credits (§5.2). */
export async function setFreeCredits(tradieId: string, credits: number): Promise<void> {
  await updateDoc(doc(db, 'users', tradieId), {
    freeJobCredits: Math.max(0, Math.floor(credits)),
  });
}

/* --------------------------------------------------------------- tags --- */

/** Tags awaiting platform validation (claimed by a tradie, not yet validated). */
export async function listPendingTags(): Promise<CompanyTag[]> {
  const snap = await getDocs(
    query(collection(db, 'companyTags'), where('status', '==', 'claimed')),
  );
  return snap.docs
    .map((d) => d.data() as CompanyTag)
    .sort((a, b) => (a.claimedAt ?? a.createdAt) - (b.claimedAt ?? b.createdAt));
}

/** Approve a claimed tag: mark validated and bind the tradie to the company. */
export async function validateTag(tagId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const tagRef = doc(db, 'companyTags', tagId);
    const snap = await tx.get(tagRef);
    if (!snap.exists()) return;
    const tag = snap.data() as CompanyTag;
    tx.update(tagRef, { status: 'validated', validatedAt: Date.now() });
    if (tag.claimedByUserId) {
      tx.update(doc(db, 'users', tag.claimedByUserId), {
        companyId: tag.companyId,
        companyName: tag.companyName,
      });
    }
  });
}

/** Platform credit control: set a company's shared credit pool. */
export async function setSharedCredits(companyId: string, n: number): Promise<void> {
  await updateDoc(doc(db, 'companies', companyId), {
    sharedCredits: Math.max(0, Math.floor(n)),
  });
}

export function isTradie(u: Tradie | Customer): u is Tradie {
  return u.role === 'tradie';
}
