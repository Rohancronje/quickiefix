import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Company, Complaint, Customer, Job, Tradie } from './types';

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

export function isTradie(u: Tradie | Customer): u is Tradie {
  return u.role === 'tradie';
}
