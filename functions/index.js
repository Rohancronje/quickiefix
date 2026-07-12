/**
 * QuickieFix Cloud Functions.
 *
 * - sendWelcomeEmail: branded welcome email (Brevo) for imported tradies.
 *   Only callable by a company admin or platform admin.
 * - onJobRated: recomputes a tradie's rating aggregate when a customer rates a
 *   completed job — server-side so clients can't fake reputation.
 */
const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();

const BREVO_API_KEY = defineSecret('BREVO_API_KEY');
// Expo access token (read-only use) so the /download redirect can resolve the
// latest EAS build at request time.
const EXPO_TOKEN = defineSecret('EXPO_TOKEN');
const EAS_PROJECT_ID = 'af87594c-64e6-4ab1-8796-04cf077c722b';

// Must match PLATFORM_ADMINS in portal/src/config.ts and firestore.rules.
const PLATFORM_ADMINS = ['admin@quickiefix.store'];

// Where waitlist-signup notifications go. Use a real, deliverable inbox (Gmail),
// not admin@quickiefix.store (a login-only address with no mailbox).
const FOUNDER_EMAIL = 'rohan87cronje@gmail.com';

// Must be a VERIFIED sender in your Brevo account.
const SENDER = { email: 'noreply@quickiefix.store', name: 'QuickieFix' };

// Where the reset flow sends the user after they set a new password. Tried in
// order: the branded custom domain first (activates once quickiefix.store is an
// authorised auth domain), then the always-authorised web.app, then a plain
// link with no continue. All point at the same branded "open the app" page.
const RESET_CONTINUE_URLS = [
  'https://quickiefix.store/reset-complete.html',
  'https://quickiefix-2ea2a.web.app/reset-complete.html',
];

const isMissingAcct = (code) => code === 'auth/user-not-found' || code === 'auth/email-not-found';
const isBadContinue = (code) =>
  code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri';

/** Generate a reset link, preferring the branded continue URL, degrading safely. */
async function generateResetLink(email) {
  for (const url of RESET_CONTINUE_URLS) {
    try {
      return await admin.auth().generatePasswordResetLink(email, { url, handleCodeInApp: false });
    } catch (e) {
      if (isMissingAcct(e.code)) throw e; // let the caller swallow it
      if (!isBadContinue(e.code)) throw e; // real error
      // else: this continue URL isn't authorised — try the next one
    }
  }
  return admin.auth().generatePasswordResetLink(email); // plain link, no continue
}

// Wave-dispatch timing — must mirror WAVE in src/constants.ts.
const NO_TRADIE_AFTER_MS = 240_000; // searching → no_tradie_found (pool had candidates)
const NO_CANDIDATES_AFTER_MS = 30_000; // empty pool → fail fast
const EMERGENCY_AUTO_CONFIRM_MS = 180_000; // accepted emergency → confirmed

// Password-reset abuse limits (rolling window). Per-email stops victim inbox
// bombing; per-IP stops one attacker hammering many addresses / burning quota.
const RESET_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RESET_MAX_PER_EMAIL = 3;
const RESET_MAX_PER_IP = 20;

/** Increment a rolling-window counter; returns false once the limit is hit. */
async function underRateLimit(key, max) {
  const ref = admin.firestore().collection('resetThrottle').doc(key);
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    let count = 0;
    let windowStart = now;
    if (snap.exists) {
      const d = snap.data();
      if (now - (d.windowStart || 0) < RESET_WINDOW_MS) {
        count = d.count || 0;
        windowStart = d.windowStart;
      }
    }
    tx.set(ref, { count: count + 1, windowStart });
    return count < max;
  });
}

// Money — must mirror src/constants.ts.
const FEE_CENTS = 1500; // $15.00 per completed job
const GST_RATE = 0.15;
const GST_ENABLED = false; // not GST-registered yet — must mirror src/constants.ts
function monthKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Stable download link. Resolves to the latest Android build at request time via
// the `download` function below — so emails never point at an expired artifact.
const APP_DOWNLOAD_URL = 'https://quickiefix.store/download';

function welcomeHtml({ firstName, companyName, email, tempPassword }) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#0B1220">
    <div style="background:#0B1220;border-radius:16px;padding:28px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#fff">Quickie<span style="color:#FFB020">Fix</span></div>
    </div>
    <div style="padding:28px 8px">
      <h2 style="margin:0 0 8px">Kia ora ${firstName || 'there'},</h2>
      <p style="color:#5A6478;line-height:1.6">
        <strong>${companyName}</strong> has added you to QuickieFix — the on-demand
        marketplace that sends you nearby jobs in real time.
      </p>
      <div style="background:#F4F6FB;border-radius:12px;padding:16px;margin:18px 0">
        <p style="margin:0 0 6px;color:#5A6478;font-size:13px">Your login</p>
        <p style="margin:0;font-weight:700">${email}</p>
        <p style="margin:8px 0 6px;color:#5A6478;font-size:13px">Temporary password</p>
        <p style="margin:0;font-weight:700;font-family:monospace;font-size:16px">${tempPassword}</p>
      </div>
      <p style="color:#5A6478;line-height:1.6">
        Install the QuickieFix app, sign in with the details above, then change your
        password from your profile. Welcome aboard! ⚡
      </p>
      <div style="text-align:center;margin:22px 0 8px">
        <a href="${APP_DOWNLOAD_URL}"
           style="display:inline-block;background:#FFB020;color:#0B1220;font-weight:800;
                  text-decoration:none;padding:15px 28px;border-radius:12px;font-size:15px">
          📲 Download the QuickieFix app
        </a>
        <p style="color:#8A93A6;font-size:12px;margin-top:10px">
          Android · tap the file, allow install, and you're in.
        </p>
      </div>
    </div>
    <div style="text-align:center;color:#8A93A6;font-size:12px;padding:12px">
      QuickieFix · Get trusted help fast
    </div>
  </div>`;
}

exports.sendWelcomeEmail = onCall(
  { secrets: [BREVO_API_KEY], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }
    // Only company admins or platform admins may send invites.
    const email = (request.auth.token.email || '').toLowerCase();
    const isPlatform = PLATFORM_ADMINS.includes(email);
    let isCompanyAdmin = false;
    if (!isPlatform) {
      const adminDoc = await admin
        .firestore()
        .collection('companyAdmins')
        .doc(request.auth.uid)
        .get();
      isCompanyAdmin = adminDoc.exists;
    }
    if (!isPlatform && !isCompanyAdmin) {
      throw new HttpsError('permission-denied', 'Not authorised to send invites.');
    }

    const { email: to, firstName, companyName, tempPassword } = request.data || {};
    if (!to || !tempPassword || !companyName) {
      throw new HttpsError('invalid-argument', 'Missing email, password or company.');
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY.value(),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: to, name: firstName || to }],
        subject: `You've been added to ${companyName} on QuickieFix`,
        htmlContent: welcomeHtml({ firstName, companyName, email: to, tempPassword }),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new HttpsError('internal', `Email provider error: ${text.slice(0, 200)}`);
    }
    return { ok: true };
  },
);

/**
 * Wave-dispatch heartbeat. Every minute, sweep jobs whose wave clock has run out:
 *  - a searching job past the final wave with no acceptance → no_tradie_found
 *    (the admin live-job list surfaces these for founder concierge rescue), and
 *  - an accepted EMERGENCY job past its auto-confirm window → confirmed.
 * Standard (non-emergency) jobs are left for the customer to confirm explicitly.
 */
function resetHtml({ link }) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#0B1220">
    <div style="background:#0B1220;border-radius:16px;padding:28px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#fff">Quickie<span style="color:#FFB020">Fix</span></div>
    </div>
    <div style="padding:28px 8px">
      <h2 style="margin:0 0 8px">Reset your password</h2>
      <p style="color:#5A6478;line-height:1.6">
        We received a request to reset your QuickieFix password. Tap the button below to choose a new
        one. If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
      <div style="text-align:center;margin:24px 0 8px">
        <a href="${link}"
           style="display:inline-block;background:#FFB020;color:#0B1220;font-weight:800;
                  text-decoration:none;padding:15px 30px;border-radius:12px;font-size:15px">
          Reset my password
        </a>
      </div>
      <p style="color:#8A93A6;font-size:12px;line-height:1.6">
        Button not working? Paste this link into your browser:<br/>
        <a href="${link}" style="color:#3D7BFF;word-break:break-all">${link}</a>
      </p>
    </div>
    <div style="text-align:center;color:#8A93A6;font-size:12px;padding:12px">
      QuickieFix · Get trusted help fast
    </div>
  </div>`;
}

// Branded password reset via Brevo (better deliverability than Firebase's
// default sender). Generates the reset link with the Admin SDK and emails it.
exports.sendPasswordReset = onCall(
  { secrets: [BREVO_API_KEY], cors: true },
  async (request) => {
    const email = String(request.data?.email || '').trim().toLowerCase();
    if (!email) throw new HttpsError('invalid-argument', 'Email is required.');

    // Rate-limit before doing any work. If throttled, return success without
    // sending — this neither reveals the throttle nor lets a victim be spammed.
    const req = request.rawRequest;
    const ipRaw =
      (req && (req.headers['x-forwarded-for'] || req.ip)) || 'unknown';
    const ip = String(ipRaw).split(',')[0].trim().replace(/[^\w.:-]/g, '_') || 'unknown';
    const emailKey = `email_${email.replace(/[^\w.@-]/g, '_')}`;
    const [emailOk, ipOk] = await Promise.all([
      underRateLimit(emailKey, RESET_MAX_PER_EMAIL),
      underRateLimit(`ip_${ip}`, RESET_MAX_PER_IP),
    ]);
    if (!emailOk || !ipOk) {
      console.warn('reset throttled', { emailOk, ipOk });
      return { ok: true };
    }

    let link;
    try {
      link = await generateResetLink(email);
    } catch (e) {
      if (isMissingAcct(e.code)) return { ok: true }; // never reveal account existence
      console.error('generatePasswordResetLink failed', e);
      throw new HttpsError('internal', 'Could not start the reset. Please try again.');
    }
    await brevoSend({
      to: email,
      toName: email,
      subject: 'Reset your QuickieFix password',
      html: resetHtml({ link }),
    });
    return { ok: true };
  },
);

exports.dispatchSweep = onSchedule('every 1 minutes', async () => {
  const db = admin.firestore();
  const now = Date.now();

  // searching → no_tradie_found (+ widen the push wave as the clock runs)
  const searching = await db.collection('jobs').where('status', '==', 'searching').get();
  await Promise.all(
    searching.docs.map(async (d) => {
      const job = d.data();
      // Browse-and-choose has no wave clock — the customer drives it, so never
      // auto-expire it here.
      if (job.assignmentMode === 'choose') return;
      const startedAt = job.dispatch?.startedAt ?? job.timestamps?.searchingAt ?? job.timestamps?.createdAt;
      const noCandidates = !(job.dispatch?.candidateIds && job.dispatch.candidateIds.length);
      const threshold = noCandidates ? NO_CANDIDATES_AFTER_MS : NO_TRADIE_AFTER_MS;
      if (startedAt && now - startedAt >= threshold) {
        await d.ref.update({
          status: 'no_tradie_found',
          'timestamps.noTradieFoundAt': now,
        });
        return;
      }
      // Wave widening: push newly-eligible candidates (skip declines + already-
      // notified). Nearest-first order is the candidateIds ranking.
      if (!noCandidates && startedAt) {
        const allowed = pushWaveSize(now - startedAt);
        const declined = job.declinedBy ?? [];
        const eligible = job.dispatch.candidateIds
          .filter((id) => !declined.includes(id))
          .slice(0, allowed === Infinity ? undefined : allowed);
        await notifyOfferCandidates(d.ref, job, d.id, eligible);
      }
    }),
  );

  // accepted emergency → confirmed
  const accepted = await db.collection('jobs').where('status', '==', 'accepted').get();
  await Promise.all(
    accepted.docs.map(async (d) => {
      const job = d.data();
      if (job.isEmergency && job.timestamps?.acceptedAt && now - job.timestamps.acceptedAt >= EMERGENCY_AUTO_CONFIRM_MS) {
        await d.ref.update({
          status: 'confirmed',
          'timestamps.confirmedAt': now,
        });
      }
    }),
  );
});

/**
 * On job completion (clients can't write these fields directly):
 *  - increment the tradie's completed-job count, and
 *  - record the platform fee (Pilot Spec §5.3). A free credit waives it and is
 *    decremented; otherwise the fee is billable and `pending`. The fee doc id is
 *    the jobId, so this is idempotent — a job is only ever billed once.
 */
exports.onJobCompleted = onDocumentUpdated('jobs/{jobId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after || after.status !== 'completed' || before?.status === 'completed') return;
  const tradieId = after.tradieId;
  if (!tradieId) return;

  const db = admin.firestore();
  const jobId = event.params.jobId;
  const feeRef = db.collection('feeLineItems').doc(jobId);
  const tradieRef = db.collection('users').doc(tradieId);
  // Company is stamped on the job at acceptance (immutable).
  const companyId = after.companyId || null;
  const companyRef = companyId ? db.collection('companies').doc(companyId) : null;

  await db.runTransaction(async (tx) => {
    const feeSnap = await tx.get(feeRef);
    if (feeSnap.exists) return; // already billed — idempotent
    const tradieSnap = await tx.get(tradieRef);
    if (!tradieSnap.exists) return;
    const tradie = tradieSnap.data();
    const companySnap = companyRef ? await tx.get(companyRef) : null;

    // Company shared credits are consumed before the tradie's own (§6.5).
    const sharedCredits = companySnap && companySnap.exists ? companySnap.data().sharedCredits || 0 : 0;
    const personalCredits = tradie.freeJobCredits || 0;
    let useCredit = false;
    let useShared = false;
    if (sharedCredits > 0) {
      useShared = true;
      useCredit = true;
    } else if (personalCredits > 0) {
      useCredit = true;
    }
    const completedAt = after.timestamps?.completedAt || Date.now();

    tx.update(tradieRef, {
      completedJobs: admin.firestore.FieldValue.increment(1),
      ...(useCredit && !useShared ? { freeJobCredits: admin.firestore.FieldValue.increment(-1) } : {}),
    });
    if (useShared && companyRef) {
      tx.update(companyRef, { sharedCredits: admin.firestore.FieldValue.increment(-1) });
    }
    tx.set(feeRef, {
      id: jobId,
      tradieId,
      tradieName: tradie.businessName || '',
      jobId,
      trade: after.trade,
      ...(companyId ? { companyId } : {}),
      amountCents: FEE_CENTS,
      gstCents: GST_ENABLED ? Math.round(FEE_CENTS * GST_RATE) : 0,
      status: useCredit ? 'waived_credit' : 'pending',
      monthKey: monthKeyOf(completedAt),
      createdAt: Date.now(),
    });
  });
});

/**
 * Release the assigned tradie back to `available` when their job ends
 * (completed or cancelled). This runs server-side because a cancelling CUSTOMER
 * has no permission to write the tradie's user doc — so the client no longer
 * touches it. Idempotent, and never overrides an `offline` tradie.
 */
exports.onJobReleased = onDocumentUpdated('jobs/{jobId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after) return;
  const ended = after.status === 'completed' || after.status === 'cancelled';
  const wasEnded = before?.status === 'completed' || before?.status === 'cancelled';
  if (!ended || wasEnded) return;
  const tradieId = after.tradieId;
  if (!tradieId) return;

  const db = admin.firestore();
  const tradieRef = db.collection('users').doc(tradieId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(tradieRef);
    if (!snap.exists) return;
    const t = snap.data();
    if (t.status === 'offline' || t.status === 'available') return;
    tx.update(tradieRef, { status: 'available' });
  });
});

/**
 * Append-only audit trail. Written ONLY server-side (Admin SDK bypasses rules;
 * clients are denied by firestore.rules). Captures money- and status-changing
 * events so there's an immutable record for support/disputes. Best-effort: an
 * audit failure never breaks the triggering operation.
 */
async function writeAudit(entry) {
  try {
    await admin
      .firestore()
      .collection('auditLog')
      .add({ ...entry, at: Date.now(), createdAt: admin.firestore.FieldValue.serverTimestamp() });
  } catch (e) {
    console.error('audit write failed:', entry.type, e);
  }
}

/** Audit job lifecycle transitions (assigned / completed / cancelled / no-match). */
exports.onJobAudit = onDocumentUpdated('jobs/{jobId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after || before?.status === after.status) return;
  const base = {
    jobId: event.params.jobId,
    trade: after.trade,
    customerId: after.customerId,
    tradieId: after.tradieId || null,
  };
  switch (after.status) {
    case 'accepted':
    case 'confirmed':
      await writeAudit({ type: 'job.assigned', mode: after.assignmentMode || 'auto', ...base });
      break;
    case 'completed':
      await writeAudit({ type: 'job.completed', ...base });
      break;
    case 'cancelled':
      await writeAudit({ type: 'job.cancelled', ...base });
      break;
    case 'no_tradie_found':
      await writeAudit({ type: 'job.no_tradie_found', ...base });
      break;
    default:
      break;
  }
});

/** Audit tradie account levers: approval, payment hold, and free-credit changes. */
exports.onUserAudit = onDocumentUpdated('users/{uid}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after || after.role !== 'tradie') return;
  const base = { subjectId: event.params.uid, businessName: after.businessName || null };
  if (before?.approval !== after.approval) {
    await writeAudit({ type: 'tradie.approval', from: before?.approval || null, to: after.approval, ...base });
  }
  if (Boolean(before?.paymentHold) !== Boolean(after.paymentHold)) {
    await writeAudit({ type: 'tradie.paymentHold', to: Boolean(after.paymentHold), ...base });
  }
  if ((before?.freeJobCredits ?? null) !== (after.freeJobCredits ?? null)) {
    await writeAudit({
      type: 'tradie.credits',
      from: before?.freeJobCredits ?? null,
      to: after.freeJobCredits ?? null,
      ...base,
    });
  }
});

/**
 * Completion record (billing handshake). When a job completes:
 *  - generate the deterministic confirmation code (QF-XXXXXX) server-side so
 *    neither party can forge it (clients are rule-blocked from writing it),
 *  - email the customer their completion record at the invoicing address
 *    confirmed on-site (falls back to their account email).
 * The code is the invoice reference for the future Xero push.
 */
exports.onJobCompletionRecord = onDocumentUpdated(
  { document: 'jobs/{jobId}', secrets: [BREVO_API_KEY] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after || after.status !== 'completed' || before?.status === 'completed') return;

    const jobId = event.params.jobId;
    const code = `QF-${jobId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
    if (!after.completionCode) {
      await event.data.after.ref.update({ completionCode: code });
    }

    // Resolve the invoicing email: confirmed billing contact first, else the
    // customer's account email.
    let to = after.billing && after.billing.contactEmail;
    let toName = (after.billing && after.billing.contactName) || after.customerName || 'there';
    if (!to && after.customerId) {
      const snap = await admin.firestore().collection('users').doc(after.customerId).get();
      if (snap.exists) to = snap.data().email;
    }
    if (!to) return;

    const trade = String(after.trade || 'job').replace(/_/g, ' ');
    const when = new Date(after.timestamps?.completedAt || Date.now()).toLocaleString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      dateStyle: 'long',
      timeStyle: 'short',
    });
    const rc = after.rateSnapshot && after.rateSnapshot.rateCard;
    const money = (c) => `$${(c / 100).toFixed(2)}`;
    const rates = rc
      ? `<tr><td style="padding:4px 0;color:#5A6478">Hourly rate</td><td align="right"><b>${money(rc.hourlyRateCents)}</b></td></tr>` +
        (rc.calloutFeeCents != null
          ? `<tr><td style="padding:4px 0;color:#5A6478">Call-out fee</td><td align="right"><b>${money(rc.calloutFeeCents)}</b></td></tr>`
          : '')
      : '';

    try {
      await brevoSend({
        to,
        toName,
        subject: `Job complete — confirmation ${code}`,
        html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#0B1220">
          <h2 style="color:#0B1220">Your ${trade} job is complete ✅</h2>
          <p>${after.tradieName || 'Your tradie'} has marked this job complete (${when}).</p>
          <div style="background:#F4F6FB;border-radius:12px;padding:16px;margin:16px 0;text-align:center">
            <div style="color:#5A6478;font-size:13px">Completion confirmation code</div>
            <div style="font-size:28px;font-weight:800;letter-spacing:2px">${code}</div>
          </div>
          <table width="100%" style="font-size:14px">${rates}</table>
          <p style="color:#5A6478;font-size:13px">The tradie invoices you directly at the rates agreed
          when you confirmed them. Quote the confirmation code on any invoice query — it's your
          shared record of this job.</p>
        </div>`,
      });
    } catch (e) {
      console.error('completion email failed:', e);
    }
  },
);

/**
 * Data retention. Two policies:
 *  - In-app messages are working chatter, not records: the thread is deleted
 *    the moment a job ends (completed or cancelled). The completion code +
 *    audit trail remain the durable record.
 *  - Job photos are deleted 24h AFTER the job ends (not after upload, so a
 *    scheduled job never loses its photos while still active).
 */
exports.onJobThreadCleanup = onDocumentUpdated('jobs/{jobId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after) return;
  const TERMINAL = ['completed', 'cancelled'];
  if (!TERMINAL.includes(after.status) || TERMINAL.includes(before?.status)) return;

  const db = admin.firestore();
  const snap = await db.collection('messages').where('jobId', '==', event.params.jobId).get();
  if (snap.empty) return;
  // Batches cap at 500 ops; chunk defensively.
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = db.batch();
    docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`thread cleanup: deleted ${docs.length} messages for job ${event.params.jobId}`);
});

/** Daily sweep: purge Storage photos for jobs that ended over 24h ago. */
exports.mediaRetentionSweep = onSchedule('every 24 hours', async () => {
  const db = admin.firestore();
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const snap = await db
    .collection('jobs')
    .where('status', 'in', ['completed', 'cancelled', 'no_tradie_found'])
    .get();
  const bucket = admin.storage().bucket();
  let purged = 0;
  for (const d of snap.docs) {
    const j = d.data();
    if (!Array.isArray(j.photos) || j.photos.length === 0) continue;
    const endedAt =
      j.timestamps?.completedAt || j.timestamps?.cancelledAt || j.timestamps?.noTradieFoundAt;
    if (!endedAt || endedAt > cutoff) continue;
    try {
      await bucket.deleteFiles({ prefix: `jobs/${d.id}/` });
      await d.ref.update({ photos: [] });
      purged++;
    } catch (e) {
      console.error('photo purge failed for job', d.id, e);
    }
  }
  if (purged) console.log(`media retention: purged photos for ${purged} job(s)`);
});

/* ------------------------------------------------------------- push ------ */

/** Send messages via the Expo push service (chunked; best-effort). */
async function expoPush(messages) {
  const valid = messages.filter((m) => m.to && String(m.to).startsWith('ExponentPushToken'));
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) console.error('expo push failed:', res.status, await res.text());
    } catch (e) {
      console.error('expo push error:', e);
    }
  }
}

/** Look up push tokens for a list of user ids. */
async function pushTokensFor(userIds) {
  const db = admin.firestore();
  const snaps = await Promise.all(userIds.map((id) => db.collection('users').doc(id).get()));
  return snaps
    .map((s) => (s.exists ? s.data().pushToken : null))
    .filter(Boolean);
}

// Push-wave pacing (mirrors src/constants WAVE): nearest 3 first, widen to 8
// at 90s, everyone at 180s. Declines advance the line immediately.
const PUSH_WAVE = { first: 3, second: 8, widenAt1Ms: 90_000, widenAt2Ms: 180_000 };
const pushWaveSize = (elapsedMs) =>
  elapsedMs >= PUSH_WAVE.widenAt2Ms ? Infinity : elapsedMs >= PUSH_WAVE.widenAt1Ms ? PUSH_WAVE.second : PUSH_WAVE.first;

/** Send the offer push to `ids` that haven't been notified yet; record them. */
async function notifyOfferCandidates(jobRef, job, jobId, ids) {
  const notified = job.dispatch?.notifiedIds ?? [];
  const fresh = ids.filter((id) => !notified.includes(id));
  if (!fresh.length) return;
  const tokens = await pushTokensFor(fresh);
  const trade = String(job.trade || 'job').replace(/_/g, ' ');
  await expoPush(
    tokens.map((to) => ({
      to,
      title: job.isEmergency ? '🚨 Emergency job near you' : '⚡ New job near you',
      body: `${job.customerName || 'A customer'} needs a ${trade} — first to accept wins.`,
      sound: 'default',
      channelId: 'offers',
      priority: 'high',
      data: { jobId, role: 'tradie' },
    })),
  );
  await jobRef.update({
    'dispatch.notifiedIds': admin.firestore.FieldValue.arrayUnion(...fresh),
  });
}

/**
 * New job created → AUTO mode only: push the nearest wave (ranked order).
 * Browse-and-choose sends nothing at creation — only the tradie the customer
 * picks is notified (see onJobPushUpdates).
 */
exports.onJobPushOffers = onDocumentCreated('jobs/{jobId}', async (event) => {
  const job = event.data?.data();
  if (!job || job.status !== 'searching') return;
  if (job.assignmentMode === 'choose') return;
  const candidates = job.dispatch?.candidateIds ?? [];
  if (!candidates.length) return;
  await notifyOfferCandidates(
    event.data.ref,
    job,
    event.params.jobId,
    candidates.slice(0, PUSH_WAVE.first),
  );
});

/** Job transitions → push the people who need to act. */
exports.onJobPushUpdates = onDocumentUpdated('jobs/{jobId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  const jobId = event.params.jobId;

  // AUTO mode: a decline advances the line — push the next unnotified
  // candidate immediately (nearest-first order is baked into candidateIds).
  if (
    after.status === 'searching' &&
    after.assignmentMode !== 'choose' &&
    (after.declinedBy?.length ?? 0) > (before.declinedBy?.length ?? 0)
  ) {
    const declined = after.declinedBy ?? [];
    const notified = after.dispatch?.notifiedIds ?? [];
    const next = (after.dispatch?.candidateIds ?? []).find(
      (id) => !declined.includes(id) && !notified.includes(id),
    );
    if (next) await notifyOfferCandidates(event.data.after.ref, after, jobId, [next]);
  }

  // Browse-and-choose: the customer picked a tradie → prompt them to accept.
  if (after.selectedTradieId && after.selectedTradieId !== before.selectedTradieId) {
    const tokens = await pushTokensFor([after.selectedTradieId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: '⭐ A customer chose you',
        body: `${after.customerName || 'A customer'} picked you — accept to lock it in.`,
        sound: 'default',
        channelId: 'offers',
        priority: 'high',
        data: { jobId, role: 'tradie' },
      })),
    );
  }

  // A tradie took the job → tell the customer.
  const engaged = ['accepted', 'confirmed'];
  if (engaged.includes(after.status) && !engaged.includes(before.status) && after.customerId) {
    const tokens = await pushTokensFor([after.customerId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: '✅ Tradie found!',
        body: `${after.tradieName || 'A tradie'} accepted your ${String(after.trade || 'job').replace(/_/g, ' ')} job.`,
        sound: 'default',
        data: { jobId, role: 'customer' },
      })),
    );
  }

  // Tradie is on the way / arrived → keep the customer in the loop.
  if (after.status === 'travelling' && before.status !== 'travelling' && after.customerId) {
    const tokens = await pushTokensFor([after.customerId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: '🚗 On the way',
        body: `${after.tradieName || 'Your tradie'} is heading to you now.`,
        sound: 'default',
        data: { jobId, role: 'customer' },
      })),
    );
  }
});

/**
 * Stable app-download redirect. Served at quickiefix.store/download (Hosting
 * rewrite) — resolves the newest FINISHED internal Android build from EAS at
 * request time and 302-redirects to its APK. Emails/links never go stale: as
 * long as a recent build exists, this always points at the latest one.
 */
exports.download = onRequest(
  { secrets: [EXPO_TOKEN], region: 'us-central1', cors: true },
  async (req, res) => {
    try {
      const resp = await fetch('https://api.expo.dev/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${EXPO_TOKEN.value()}`,
        },
        body: JSON.stringify({
          query:
            'query($id:String!){ app { byId(appId:$id){ builds(limit:1, offset:0, filter:{platform:ANDROID, status:FINISHED, distribution:INTERNAL}){ artifacts { applicationArchiveUrl } } } } }',
          variables: { id: EAS_PROJECT_ID },
        }),
      });
      const data = await resp.json();
      const url = data?.data?.app?.byId?.builds?.[0]?.artifacts?.applicationArchiveUrl;
      if (!url) {
        res.status(503).send('No installable build is available yet. Please check back shortly.');
        return;
      }
      // Short cache so bursts of clicks don't hammer the EAS API, but new builds
      // still surface quickly.
      res.set('Cache-Control', 'public, max-age=300');
      res.redirect(302, url);
    } catch (e) {
      console.error('download redirect failed:', e);
      res.status(500).send('Download temporarily unavailable. Please try again shortly.');
    }
  },
);

/** Send a branded transactional email via Brevo. */
async function brevoSend({ to, toName, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY.value(),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Brevo send failed:', text.slice(0, 200));
  }
}

function landlordEmailHtml({ heading, intro, job }) {
  const t = job.timestamps || {};
  const line = (label, val) => (val ? `<tr><td style="color:#5A6478;padding:2px 12px 2px 0">${label}</td><td style="font-weight:600">${val}</td></tr>` : '');
  const when = (ts) => (ts ? new Date(ts).toLocaleString('en-NZ') : '');
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#0B1220">
    <div style="background:#0B1220;border-radius:16px;padding:24px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#fff">Quickie<span style="color:#FFB020">Fix</span></div>
    </div>
    <div style="padding:24px 8px">
      <h2 style="margin:0 0 8px">${heading}</h2>
      <p style="color:#5A6478;line-height:1.6">${intro}</p>
      <table style="margin:14px 0;font-size:14px;border-collapse:collapse">
        ${line('Property', job.location?.address)}
        ${line('Service', job.trade)}
        ${line('Issue', job.description)}
        ${line('Status', (job.status || '').replace('_', ' '))}
        ${line('Tradie', job.tradieName)}
        ${line('Accepted', when(t.acceptedAt))}
        ${line('On site', when(t.onSiteAt))}
        ${line('Completed', when(t.completedAt))}
        ${line('Customer rating', job.customerRating ? job.customerRating.stars + '/5' : '')}
      </table>
      <p style="color:#8A93A6;font-size:12px">You're receiving this because you're the landlord of record for this property on QuickieFix.</p>
    </div>
  </div>`;
}

// Landlord visibility (§2): notify at creation and completion of jobs at their
// property. The email is a formatted summary assembled from existing job data.
exports.onLandlordJobCreated = onDocumentCreated(
  { document: 'jobs/{jobId}', secrets: [BREVO_API_KEY] },
  async (event) => {
    const job = event.data?.data();
    if (!job || !job.landlordId) return;
    await emailLandlordRecord(job, {
      subject: `New job requested at your property`,
      heading: 'A job was requested at your property',
      intro: `${job.customerName || 'Your tenant'} requested a ${job.trade} at ${job.location?.address || 'your property'}. We're dispatching a verified tradie now.`,
    });
  },
);

exports.onLandlordJobCompleted = onDocumentUpdated(
  { document: 'jobs/{jobId}', secrets: [BREVO_API_KEY] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after || !after.landlordId) return;
    if (after.status !== 'completed' || before?.status === 'completed') return;
    await emailLandlordRecord(after, {
      subject: `Job completed at your property`,
      heading: 'A job was completed at your property',
      intro: `Here's the record of the ${after.trade} completed at ${after.location?.address || 'your property'}.`,
    });
  },
);

async function emailLandlordRecord(job, { subject, heading, intro }) {
  const snap = await admin.firestore().collection('users').doc(job.landlordId).get();
  if (!snap.exists) return;
  const landlord = snap.data();
  if (!landlord.email) return;
  await brevoSend({
    to: landlord.email,
    toName: `${landlord.firstName || ''} ${landlord.lastName || ''}`.trim(),
    subject,
    html: landlordEmailHtml({ heading, intro, job }),
  }).catch((e) => console.error('emailLandlordRecord error', e));
}

function waitlistThanksHtml({ role }) {
  const line =
    role === 'tradie'
      ? 'the moment we open to tradies in your area, so you can start getting jobs first.'
      : "the moment we launch in your area, so you're first in line for fast, verified help.";
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#0B1220">
    <div style="background:#0B1220;border-radius:16px;padding:28px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#fff">Quickie<span style="color:#FFB020">Fix</span></div>
    </div>
    <div style="padding:28px 8px">
      <h2 style="margin:0 0 8px">You're on the list 🎉</h2>
      <p style="color:#5A6478;line-height:1.6">
        Thanks for joining the QuickieFix waitlist. We'll email you ${line}
      </p>
      <p style="color:#8A93A6;font-size:12px;margin-top:18px">
        You're receiving this because you signed up at quickiefix.store. No further action needed.
      </p>
    </div>
    <div style="text-align:center;color:#8A93A6;font-size:12px;padding:12px">
      QuickieFix · Get trusted help fast
    </div>
  </div>`;
}

// Waitlist signup → confirm to the person, notify the founder.
exports.onWaitlistJoined = onDocumentCreated(
  { document: 'waitlist/{id}', secrets: [BREVO_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data || !data.email) return;
    const email = String(data.email).trim();
    const role = data.role === 'tradie' ? 'tradie' : 'customer';
    await brevoSend({
      to: email,
      toName: email,
      subject: "You're on the QuickieFix waitlist 🎉",
      html: waitlistThanksHtml({ role }),
    }).catch((e) => console.error('waitlist confirm failed', e));
    await brevoSend({
      to: FOUNDER_EMAIL,
      toName: 'QuickieFix',
      subject: `New waitlist signup: ${email} (${role})`,
      html: `<p>New <strong>${role}</strong> waitlist signup:</p><p style="font-size:16px"><strong>${email}</strong></p><p style="color:#8A93A6">Source: ${data.source || 'landing'}</p>`,
    }).catch((e) => console.error('waitlist notify failed', e));
  },
);

// Server-side reputation: recompute the tradie's rating when a job is rated.
exports.onJobRated = onDocumentUpdated('jobs/{jobId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after || !after.customerRating || before?.customerRating) return; // only new ratings
  const tradieId = after.tradieId;
  const stars = after.customerRating.stars;
  if (!tradieId || typeof stars !== 'number') return;

  const db = admin.firestore();
  await db.runTransaction(async (tx) => {
    const ref = db.collection('users').doc(tradieId);
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const t = snap.data();
    const count = (t.ratingCount || 0) + 1;
    const avg = Math.round((((t.ratingAvg || 0) * (t.ratingCount || 0) + stars) / count) * 10) / 10;
    tx.update(ref, { ratingAvg: avg, ratingCount: count });
  });
});
