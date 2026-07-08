/**
 * QuickieFix Cloud Functions.
 *
 * - sendWelcomeEmail: branded welcome email (Brevo) for imported tradies.
 *   Only callable by a company admin or platform admin.
 * - onJobRated: recomputes a tradie's rating aggregate when a customer rates a
 *   completed job — server-side so clients can't fake reputation.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();

const BREVO_API_KEY = defineSecret('BREVO_API_KEY');

// Must match PLATFORM_ADMINS in portal/src/config.ts and firestore.rules.
const PLATFORM_ADMINS = ['admin@quickiefix.app'];

// Must be a VERIFIED sender in your Brevo account.
const SENDER = { email: 'noreply@quickiefix.app', name: 'QuickieFix' };

// Wave-dispatch timing — must mirror WAVE in src/constants.ts.
const NO_TRADIE_AFTER_MS = 240_000; // searching → no_tradie_found
const EMERGENCY_AUTO_CONFIRM_MS = 180_000; // accepted emergency → confirmed

// Money — must mirror src/constants.ts.
const FEE_CENTS = 1500; // $15.00 ex-GST per completed job
const GST_RATE = 0.15;
function monthKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Latest installable Android build. Update when you cut a new APK.
const APP_DOWNLOAD_URL =
  'https://expo.dev/artifacts/eas/9ABmgBQRuYl8t_JZNr4jNxwp2i6qgGg_m2-xzGQxN2s.apk';

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
exports.dispatchSweep = onSchedule('every 1 minutes', async () => {
  const db = admin.firestore();
  const now = Date.now();

  // searching → no_tradie_found
  const searching = await db.collection('jobs').where('status', '==', 'searching').get();
  await Promise.all(
    searching.docs.map(async (d) => {
      const job = d.data();
      const startedAt = job.dispatch?.startedAt ?? job.timestamps?.searchingAt ?? job.timestamps?.createdAt;
      if (startedAt && now - startedAt >= NO_TRADIE_AFTER_MS) {
        await d.ref.update({
          status: 'no_tradie_found',
          'timestamps.noTradieFoundAt': now,
        });
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
      gstCents: Math.round(FEE_CENTS * GST_RATE),
      status: useCredit ? 'waived_credit' : 'pending',
      monthKey: monthKeyOf(completedAt),
      createdAt: Date.now(),
    });
  });
});

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
