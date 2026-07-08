import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { collection, doc, getFirestore, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { generateTagCode } from './api';
import { firebaseConfig } from './firebase';
import { CompanyTag, Company, TRADE_LABELS } from './types';

const TAG_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const IMPORT_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'businessName',
  'primaryTrade',
  'secondaryTrades',
  'yearsExperience',
  'licenceNumber',
];

export const VALID_TRADES = Object.keys(TRADE_LABELS);

/** Build the CSV template (opens in Excel) with a sample row. */
export function templateCsv(): string {
  const sample = [
    'Mike',
    'Jones',
    'mike@example.com',
    'Lazer Plumbing',
    'plumber',
    'gasfitter;handyman',
    '8',
    'PGDB-12345',
  ];
  return `${IMPORT_HEADERS.join(',')}\n${sample.join(',')}\n`;
}

export function downloadTemplate() {
  const blob = new Blob([templateCsv()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'quickiefix-tradies-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ----------------------------------------------------------------- parse -- */

export interface ImportRow {
  firstName: string;
  lastName: string;
  email: string;
  businessName: string;
  primaryTrade: string;
  secondaryTrades: string[];
  yearsExperience: number;
  licenceNumber?: string;
  _error?: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeTrade(raw: string): string | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (VALID_TRADES.includes(v)) return v;
  const byLabel = VALID_TRADES.find((k) => TRADE_LABELS[k].toLowerCase() === raw.trim().toLowerCase());
  return byLabel ?? null;
}

export function parseImportCsv(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? cells[j] ?? '' : '';
    };
    const email = get('email');
    const primary = normalizeTrade(get('primaryTrade'));
    const row: ImportRow = {
      firstName: get('firstName'),
      lastName: get('lastName'),
      email,
      businessName: get('businessName') || `${get('firstName')} ${get('lastName')}`,
      primaryTrade: primary ?? get('primaryTrade'),
      secondaryTrades: get('secondaryTrades')
        .split(/[;|]/)
        .map((s) => normalizeTrade(s))
        .filter((s): s is string => !!s),
      yearsExperience: parseInt(get('yearsExperience'), 10) || 0,
      licenceNumber: get('licenceNumber') || undefined,
    };
    if (!row.firstName || !row.lastName) row._error = 'Missing name';
    else if (!/.+@.+\..+/.test(email)) row._error = 'Invalid email';
    else if (!primary) row._error = `Unknown trade "${get('primaryTrade')}"`;
    rows.push(row);
  }
  return rows;
}

/* ---------------------------------------------------------------- import -- */

export interface ImportResult {
  email: string;
  ok: boolean;
  message: string;
}

function tempPassword(): string {
  return `Qf-${crypto.randomUUID().slice(0, 12)}`;
}

/**
 * Creates each tradie's account + profile (bound to the company) and emails
 * them a password-setup link. Uses a SECONDARY Firebase app so the signed-in
 * company admin's session is never disturbed.
 */
export async function importTradies(
  company: Company,
  rows: ImportRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult[]> {
  const valid = rows.filter((r) => !r._error);
  const secondary = initializeApp(firebaseConfig, `import-${Date.now()}`);
  const secAuth = getAuth(secondary);
  const secDb = getFirestore(secondary);
  const results: ImportResult[] = [];

  for (const r of rows) {
    if (r._error) {
      results.push({ email: r.email, ok: false, message: r._error });
      continue;
    }
    try {
      const pw = tempPassword();
      const cred = await createUserWithEmailAndPassword(secAuth, r.email, pw);
      const uid = cred.user.uid;
      // Create an already-validated company tag so the roster + billing stay
      // consistent with the tag model (imported members skip the claim flow).
      const now = Date.now();
      const tagRef = doc(collection(secDb, 'companyTags'));
      const tag: CompanyTag = {
        id: tagRef.id,
        companyId: company.id,
        companyName: company.name,
        code: generateTagCode(),
        issuedToName: `${r.firstName} ${r.lastName}`.trim(),
        issuedToEmail: r.email,
        status: 'validated',
        createdAt: now,
        expiresAt: now + TAG_TTL_MS,
        claimedByUserId: uid,
        claimedAt: now,
        validatedAt: now,
      };
      await setDoc(tagRef, tag);
      // Written by the new tradie (secondary auth) so it satisfies the rules.
      await setDoc(doc(secDb, 'users', uid), {
        activeTagId: tagRef.id,
        id: uid,
        role: 'tradie',
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        createdAt: Date.now(),
        businessName: r.businessName,
        yearsExperience: r.yearsExperience,
        primaryTrade: r.primaryTrade,
        secondaryTrades: r.secondaryTrades,
        qualifications: r.licenceNumber
          ? [{ trade: r.primaryTrade, licenceNumber: r.licenceNumber }]
          : [],
        approval: 'pending',
        status: 'offline',
        serviceRadiusKm: 15,
        ratingAvg: 0,
        ratingCount: 0,
        completedJobs: 0,
        jobsOffered: 0,
        jobsAccepted: 0,
        companyId: company.id,
        companyName: company.name,
      });
      // Preferred: branded welcome email (Brevo) via Cloud Function.
      // Fallback: Firebase's free "set your password" email.
      let message = 'Account created';
      try {
        const fn = httpsCallable(getFunctions(), 'sendWelcomeEmail');
        await fn({
          email: r.email,
          firstName: r.firstName,
          companyName: company.name,
          tempPassword: pw,
        });
        message = 'Invited — welcome email sent';
      } catch {
        try {
          await sendPasswordResetEmail(secAuth, r.email);
          message = 'Invited — set-password email sent';
        } catch {
          message = 'Account created (email pending)';
        }
      }
      await signOut(secAuth);
      results.push({ email: r.email, ok: true, message });
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      results.push({
        email: r.email,
        ok: false,
        message: code === 'auth/email-already-in-use' ? 'Email already registered' : code || 'Failed',
      });
    }
    onProgress?.(results.length, valid.length);
  }

  await deleteApp(secondary);
  return results;
}
