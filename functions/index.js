/**
 * QuickieFix Cloud Functions.
 *
 * - sendWelcomeEmail: branded welcome email (Brevo) for imported tradies.
 *   Only callable by a company admin or platform admin.
 * - onJobRated: recomputes a tradie's rating aggregate when a customer rates a
 *   completed job — server-side so clients can't fake reputation.
 */
const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();

const BREVO_API_KEY = defineSecret('BREVO_API_KEY');
// Expo access token (read-only use) so the /download redirect can resolve the
// latest EAS build at request time.
const EXPO_TOKEN = defineSecret('EXPO_TOKEN');
// Google Places API key — server-side only; the app talks to our proxy below.
const PLACES_API_KEY = defineSecret('PLACES_API_KEY');
const EAS_PROJECT_ID = 'af87594c-64e6-4ab1-8796-04cf077c722b';

// Must match PLATFORM_ADMINS in portal/src/config.ts and firestore.rules.
const PLATFORM_ADMINS = ['admin@quickiefix.store'];

// Where waitlist signups, support tickets and job-rescue alerts go — the
// founder's Workspace inbox on the company domain.
const FOUNDER_EMAIL = 'rohan@quickiefix.app';

// Domain-authenticated in Brevo (quickiefix.app verified 15 Jul 2026).
const SENDER = { email: 'noreply@quickiefix.app', name: 'QuickieFix' };

// Where the reset flow sends the user after they set a new password. Tried in
// order: the branded custom domain first (activates once quickiefix.app is an
// authorised auth domain), then the always-authorised web.app, then a plain
// link with no continue. All point at the same branded "open the app" page.
const RESET_CONTINUE_URLS = [
  'https://quickiefix.app/reset-complete.html',
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
// Browse-and-choose jobs are customer-driven, but an abandoned one must not
// haunt tradie feeds / block the customer's trade slot forever.
const CHOOSE_EXPIRE_MS = 24 * 60 * 60 * 1000;

// Scheduled-booking timing — must mirror BOOKING in src/constants.ts. A `booked`
// job (pre-assigned to a tradie for a future time) fires a T-2h "confirm you'll
// attend" nudge, a T-1h reminder (+ PM alert if still unconfirmed), and a
// no-show escalation if "Go now" hasn't happened by the booked time + grace.
const BOOKING = {
  confirmLeadMs: 2 * 60 * 60 * 1000, // 2 hours
  reminderLeadMs: 60 * 60 * 1000, // 1 hour
  noShowGraceMs: 10 * 60 * 1000, // 10 minutes past the booked time
};

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
const APP_DOWNLOAD_URL = 'https://quickiefix.app/download';

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

exports.dispatchSweep = onSchedule(
  { schedule: 'every 1 minutes', secrets: [BREVO_API_KEY] },
  async () => {
  const db = admin.firestore();
  const now = Date.now();

  // searching → no_tradie_found (+ widen the push wave as the clock runs)
  const searching = await db.collection('jobs').where('status', '==', 'searching').get();
  await Promise.all(
    searching.docs.map(async (d) => {
      const job = d.data();
      // Browse-and-choose has no wave clock — the customer drives it — but an
      // abandoned one must still expire, or it blocks the customer's one-live-
      // job-per-trade slot and ghosts every candidate's feed forever.
      if (job.assignmentMode === 'choose') {
        const openedAt = job.timestamps?.searchingAt ?? job.timestamps?.createdAt;
        if (openedAt && now - openedAt >= CHOOSE_EXPIRE_MS) {
          await d.ref.update({
            status: 'no_tradie_found',
            'timestamps.noTradieFoundAt': now,
          });
          // Nobody should learn about the expiry from a stale screen: the
          // customer can retry, and interested tradies stop waiting.
          const interested = (job.interestedTradies ?? []).map((t) => t.tradieId).filter(Boolean);
          const custTokens = await pushTokensFor(job.customerId ? [job.customerId] : []);
          const tradTokens = await pushTokensFor(interested);
          await expoPush([
            ...custTokens.map((to) => ({
              to,
              title: '⏳ Your job request expired',
              body: 'Your browse-and-choose request sat for 24 hours — open it to try again.',
              sound: 'default',
              data: { jobId: d.id, role: 'customer' },
            })),
            ...tradTokens.map((to) => ({
              to,
              title: 'Job expired',
              body: 'A job you were keen on expired before the customer chose — more are always coming.',
              data: { jobId: d.id, role: 'tradie' },
            })),
          ]);
        }
        return;
      }
      const startedAt = job.dispatch?.startedAt ?? job.timestamps?.searchingAt ?? job.timestamps?.createdAt;
      // Scheduled jobs: the dispatch clock starts at the booked time — until
      // then there is nothing to expire and nobody to push.
      if (startedAt && startedAt > now) return;
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
      // notified). Nearest-first order is the candidateIds ranking. This is
      // also what sends the FIRST wave for scheduled jobs once they come due.
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

  // Scheduled bookings: lead-up reminders + no-show escalation. One action per
  // job per tick (return after each) — the stages are minutes apart anyway.
  const booked = await db.collection('jobs').where('status', '==', 'booked').get();
  await Promise.all(
    booked.docs.map(async (d) => {
      const job = d.data();
      const start = job.scheduledFor;
      if (!start) return;
      const b = job.booking || {};
      const confirmLead = b.confirmLeadMs ?? BOOKING.confirmLeadMs;
      const reminderLead = b.reminderLeadMs ?? BOOKING.reminderLeadMs;
      const trade = String(job.trade || 'job').replace(/_/g, ' ');
      const area = areaOnly(job.location?.address);
      const tradieTokens = () => pushTokensFor(job.tradieId ? [job.tradieId] : []);

      // T-2h — confirm you'll attend.
      if (!b.remindedT2hAt && now >= start - confirmLead && now < start) {
        const tokens = await tradieTokens();
        await expoPush(
          tokens.map((to) => ({
            to,
            title: "🗓️ Job today — confirm you'll attend",
            body: `${trade} · ${whenNZ(start)}${area ? ` · ${area}` : ''}. Tap to confirm.`,
            sound: 'default',
            channelId: 'offers',
            priority: 'high',
            data: { jobId: d.id, role: 'tradie' },
          })),
        );
        await d.ref.update({ 'booking.remindedT2hAt': now });
        return;
      }

      // T-1h — job soon; if still unconfirmed, alert the PM with runway to act.
      if (!b.remindedT1hAt && now >= start - reminderLead && now < start) {
        const tokens = await tradieTokens();
        await expoPush(
          tokens.map((to) => ({
            to,
            title: `⏰ Your ${trade} job starts soon`,
            body: `${whenNZ(start)}${area ? ` · ${area}` : ''}. Tap "Go now" when you're ready to leave.`,
            sound: 'default',
            channelId: 'offers',
            priority: 'high',
            data: { jobId: d.id, role: 'tradie' },
          })),
        );
        await d.ref.update({ 'booking.remindedT1hAt': now });
        if (!b.attendanceConfirmedAt) await escalateBooking(d.id, job, 'unconfirmed');
        return;
      }

      // No "Go now" by the booked time + grace → no-show risk. Nudge the tradie
      // and alert the PM/desk to reassign.
      if (!b.noShowFlaggedAt && !b.departedAt && now >= start + BOOKING.noShowGraceMs) {
        const tokens = await tradieTokens();
        await expoPush(
          tokens.map((to) => ({
            to,
            title: '⚠️ Are you on your way?',
            body: `Your ${trade} booking was due at ${whenNZ(start)}. Open it and tap "Go now", or hand it back.`,
            sound: 'default',
            channelId: 'offers',
            priority: 'high',
            data: { jobId: d.id, role: 'tradie' },
          })),
        );
        await d.ref.update({ 'booking.noShowFlaggedAt': now });
        await escalateBooking(d.id, job, 'no_show');
      }
    }),
  );
});

/**
 * Alert the property manager (agency billing contact, else the landlord, else
 * the founder) when a booking is at risk: the assigned tradie hasn't confirmed
 * by T-1h, or hasn't departed by the booked time. Best-effort email.
 */
async function escalateBooking(jobId, job, kind) {
  let email = job.agencyBillingEmail || null;
  let name = job.agencyName || 'Property manager';
  if (!email && job.landlordId) {
    const snap = await admin.firestore().collection('users').doc(job.landlordId).get();
    if (snap.exists) {
      email = snap.data().email || null;
      name = `${snap.data().firstName || ''} ${snap.data().lastName || ''}`.trim() || name;
    }
  }
  if (!email) {
    email = FOUNDER_EMAIL;
    name = 'QuickieFix Ops';
  }
  const trade = String(job.trade || 'job').replace(/_/g, ' ');
  const noShow = kind === 'no_show';
  const heading = noShow
    ? `Tradie hasn't departed for a ${trade} booking`
    : `A ${trade} booking isn't confirmed yet`;
  const intro = noShow
    ? `The tradie assigned to this ${trade} booking hadn't tapped "Go now" by the scheduled time. We've nudged them — reply if you'd like us to reassign.`
    : `The tradie assigned to this upcoming ${trade} booking hasn't confirmed attendance yet. We've reminded them; there's still time to reassign if needed.`;
  await brevoSend({
    to: email,
    toName: name,
    subject: noShow ? `⚠️ ${heading}` : `Heads up — ${heading}`,
    html: landlordEmailHtml({ heading, intro, job }),
  }).catch((e) => console.error('booking escalation email failed', e));
}

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
    case 'travelling':
      // A booking departing ("Go now") — the pre-assigned tradie is on the way.
      if (before?.status === 'booked') await writeAudit({ type: 'job.departed', ...base });
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
 * Public profile mirror (§ security). `users` docs hold PRIVATE fields (email,
 * pushToken) and are locked to self + platform admin. Everything the rest of the
 * app needs to display or match on — tradie name, trade, rating, rate card,
 * availability — is mirrored here into `publicProfiles/{uid}`, which is readable
 * by any signed-in user. Written ONLY by this trigger (Admin SDK), so clients
 * can never inject email/pushToken into the readable copy.
 */
const PUBLIC_PROFILE_FIELDS = [
  'role', 'firstName', 'lastName', 'photoUrl', 'createdAt',
  // tradie profile + dispatch-matching fields
  'businessName', 'tradingName', 'yearsExperience', 'companyId', 'companyName',
  'engagement', 'rateCard', 'primaryTrade', 'secondaryTrades', 'qualifications',
  'approval', 'status', 'serviceRadiusKm', 'baseLocation',
  'ratingAvg', 'ratingCount', 'completedJobs', 'jobsOffered', 'jobsAccepted',
  'paymentHold',
];
function publicProfileFrom(data) {
  const out = { id: data.id };
  for (const k of PUBLIC_PROFILE_FIELDS) {
    if (data[k] !== undefined) out[k] = data[k];
  }
  return out;
}

exports.mirrorPublicProfile = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const ref = admin.firestore().collection('publicProfiles').doc(uid);
  const after = event.data?.after?.data();
  if (!after) {
    await ref.delete().catch(() => {});
    return;
  }
  await ref.set(publicProfileFrom({ id: uid, ...after }), { merge: false });
});

/** One-shot backfill of publicProfiles from existing users. Platform admin only.
 *  Idempotent — safe to re-run. */
exports.backfillPublicProfiles = onCall({ cors: true }, async (request) => {
  const email = request.auth?.token?.email;
  if (!email || !PLATFORM_ADMINS.includes(email)) {
    throw new HttpsError('permission-denied', 'Platform admin only.');
  }
  const db = admin.firestore();
  const users = await db.collection('users').get();
  let written = 0;
  let batch = db.batch();
  let n = 0;
  for (const doc of users.docs) {
    batch.set(db.collection('publicProfiles').doc(doc.id), publicProfileFrom({ id: doc.id, ...doc.data() }), { merge: false });
    written++;
    if (++n === 400) { await batch.commit(); batch = db.batch(); n = 0; }
  }
  if (n > 0) await batch.commit();
  return { written };
});

/** Resolve a registered user by email → minimal public identity. Replaces the
 *  old client-side `users where email==` query (which required the users
 *  collection to be world-readable). Any signed-in user may call it; it returns
 *  only id + name + role, never contact details. */
exports.findUserIdByEmail = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const email = String(request.data?.email ?? '').trim().toLowerCase();
  if (!email) throw new HttpsError('invalid-argument', 'email required.');
  const snap = await admin.firestore().collection('users').where('email', '==', email).limit(1).get();
  if (snap.empty) return { found: false };
  const u = snap.docs[0].data();
  return { found: true, id: snap.docs[0].id, firstName: u.firstName ?? '', lastName: u.lastName ?? '', role: u.role ?? null };
});

/** Claim a company seat by code. Server-side (Admin SDK) so the `companyTags`
 *  collection can stay locked — the tradie never reads the tag (and its
 *  issuedToEmail/Phone) directly. The caller is the claiming tradie. */
exports.claimSeatTag = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const code = String(request.data?.code ?? '').trim().toUpperCase();
  const engagement = request.data?.engagement === 'contractor' ? 'contractor' : 'employee';
  if (!code) throw new HttpsError('invalid-argument', 'code required.');
  const db = admin.firestore();
  const found = await db.collection('companyTags').where('code', '==', code).limit(1).get();
  if (found.empty) throw new HttpsError('not-found', 'That code is not valid.');
  const tagRef = found.docs[0].ref;
  return db.runTransaction(async (tx) => {
    const tagSnap = await tx.get(tagRef);
    const tag = tagSnap.data();
    if (tag.status !== 'issued') throw new HttpsError('failed-precondition', 'That code has already been used.');
    if (Date.now() > tag.expiresAt) throw new HttpsError('failed-precondition', 'That code has expired.');
    const userRef = db.collection('users').doc(uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError('not-found', 'Tradie not found.');
    if (userSnap.data().activeTagId) throw new HttpsError('failed-precondition', 'You already belong to a company.');
    const companySnap = await tx.get(db.collection('companies').doc(tag.companyId));
    if (!companySnap.exists) throw new HttpsError('failed-precondition', 'That company no longer exists.');
    tx.update(tagRef, {
      status: 'claimed',
      claimedByUserId: uid,
      claimedAt: Date.now(),
      engagement: tag.engagement ?? engagement,
    });
    tx.update(userRef, { activeTagId: tag.id });
    return { id: tag.companyId, name: tag.companyName };
  });
});

/* ---- Agency panel mirror + code lookup (§ security) ----
 * agencyLinks carry member emails and the full membership graph, so they're
 * locked to the parties. Dispatch + the request-flow preview instead read this
 * distilled, non-PII projection — the approved panel {tradieIds, companyScope}
 * — from agencyPanels/{agencyId}, and resolve join codes via a callable so the
 * agencies collection never needs a client-side `where code==` query. */
function agencyPanelFromLinks(links) {
  const approved = links.filter((l) => l.status === 'approved');
  return {
    tradieIds: approved.filter((l) => l.kind === 'tradie').map((l) => l.memberId),
    companyScope: Object.fromEntries(
      approved.filter((l) => l.kind === 'company').map((l) => [l.memberId, l.scope ?? 'all']),
    ),
  };
}

exports.mirrorAgencyPanel = onDocumentWritten('agencyLinks/{id}', async (event) => {
  const link = event.data?.after?.data() ?? event.data?.before?.data();
  const agencyId = link?.agencyId;
  if (!agencyId) return;
  const db = admin.firestore();
  const links = await db.collection('agencyLinks').where('agencyId', '==', agencyId).get();
  await db.collection('agencyPanels').doc(agencyId).set({
    agencyId,
    ...agencyPanelFromLinks(links.docs.map((d) => d.data())),
    updatedAt: Date.now(),
  });
});

/** Resolve an agency join code → minimal public identity (id + name, never
 *  adminEmail). Replaces the client-side `agencies where code==` query. */
exports.findAgencyByCode = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const code = String(request.data?.code ?? '').trim().toUpperCase();
  if (!code) throw new HttpsError('invalid-argument', 'code required.');
  const snap = await admin.firestore().collection('agencies').where('code', '==', code).limit(1).get();
  if (snap.empty) return { found: false };
  return { found: true, id: snap.docs[0].id, name: snap.docs[0].data().name ?? '' };
});

/** One-shot backfill: build agencyPanels for every agency and stamp
 *  agencyBillingEmail onto managed properties. Platform admin only. */
exports.backfillAgencyData = onCall({ cors: true }, async (request) => {
  const email = request.auth?.token?.email;
  if (!email || !PLATFORM_ADMINS.includes(email)) throw new HttpsError('permission-denied', 'Platform admin only.');
  const db = admin.firestore();
  const agencies = await db.collection('agencies').get();
  let panels = 0;
  for (const a of agencies.docs) {
    const links = await db.collection('agencyLinks').where('agencyId', '==', a.id).get();
    await db.collection('agencyPanels').doc(a.id).set({
      agencyId: a.id, ...agencyPanelFromLinks(links.docs.map((d) => d.data())), updatedAt: Date.now(),
    });
    panels++;
  }
  const emailByAgency = Object.fromEntries(agencies.docs.map((a) => [a.id, a.data().adminEmail ?? null]));
  const props = await db.collection('properties').get();
  let stamped = 0, batch = db.batch(), n = 0;
  for (const p of props.docs) {
    const aid = p.data().agencyId;
    if (aid && emailByAgency[aid]) {
      batch.update(p.ref, { agencyBillingEmail: emailByAgency[aid] });
      stamped++;
      if (++n === 400) { await batch.commit(); batch = db.batch(); n = 0; }
    }
  }
  if (n > 0) await batch.commit();
  return { panels, stamped };
});

/* ---- Privileged job transitions (§ security) ----
 * Accepting and releasing a job set/clear the assignment + the financial rate
 * snapshot. Doing them server-side (Admin SDK) means a crafted client can never
 * forge who's assigned or at what rate — the `jobs` update rule forbids clients
 * from writing tradieId/rateSnapshot/sourcedVia/company stamps at all. */
exports.acceptJob = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const jobId = String(request.data?.jobId ?? '');
  if (!jobId) throw new HttpsError('invalid-argument', 'jobId required.');
  const db = admin.firestore();
  return db.runTransaction(async (tx) => {
    const jobRef = db.collection('jobs').doc(jobId);
    const jobSnap = await tx.get(jobRef);
    if (!jobSnap.exists) throw new HttpsError('not-found', 'Job no longer exists.');
    const job = jobSnap.data();
    if (job.status !== 'searching') throw new HttpsError('failed-precondition', 'Sorry, this job has already been taken.');
    // Scheduled jobs open for acceptance only at the booked time — you can't grab
    // a future job early (it would wrongly flip to active / "on a job" now).
    const schedStart = job.dispatch?.startedAt ?? 0;
    if (job.urgency === 'scheduled' && schedStart > Date.now() + 60_000) {
      throw new HttpsError('failed-precondition', 'This job is scheduled for later — it opens for acceptance at the booked time.');
    }
    // Eligibility: browse-and-choose → only the customer-selected tradie; auto →
    // any tradie still in the dispatch pool (legacy jobs have no pool).
    const eligible = job.assignmentMode === 'choose'
      ? job.selectedTradieId === uid
      : (!job.dispatch || (job.dispatch.candidateIds || []).includes(uid));
    if (!eligible) throw new HttpsError('failed-precondition', 'This job is no longer being offered to you.');
    const tradieRef = db.collection('users').doc(uid);
    const tradieSnap = await tx.get(tradieRef);
    if (!tradieSnap.exists) throw new HttpsError('not-found', 'Tradie not found.');
    const tradie = tradieSnap.data();
    if (tradie.paymentHold) throw new HttpsError('failed-precondition', 'Your account is paused. Clear your balance to accept jobs.');
    if (tradie.status === 'job_accepted' || tradie.status === 'on_site') {
      throw new HttpsError('failed-precondition', 'Finish your current job before taking another.');
    }
    // sourcedVia: contractors carry the company badge ONLY on company-panel work.
    const sourcedVia = job.agencyId
      ? ((job.dispatch?.ownPanelIds || []).includes(uid) ? 'own_panel' : 'company_panel')
      : 'open_market';
    let company;
    if (tradie.companyId) {
      const cs = await tx.get(db.collection('companies').doc(tradie.companyId));
      if (cs.exists) company = cs.data();
    }
    const useCompany = !!company && (tradie.engagement !== 'contractor' || sourcedVia === 'company_panel');
    const rateCard = useCompany ? (company.rateCard ?? tradie.rateCard) : tradie.rateCard;
    const now = Date.now();
    const stamp = { sourcedVia };
    if (useCompany && company) { stamp.companyId = tradie.companyId; stamp.companyName = company.name; }
    // Agency jobs: no rate snapshot — panel members bill on the agency's terms.
    if (rateCard && !job.agencyId) {
      stamp.rateSnapshot = {
        rateCard,
        source: useCompany && company?.rateCard ? 'company' : 'personal',
        ...(useCompany && company ? { companyName: company.name } : {}),
        capturedAt: now,
      };
    }
    tx.update(jobRef, {
      status: 'confirmed',
      tradieId: uid,
      tradieName: tradie.businessName,
      'timestamps.acceptedAt': now,
      'timestamps.confirmedAt': now,
      ...stamp,
    });
    tx.update(tradieRef, { status: 'job_accepted', jobsAccepted: admin.firestore.FieldValue.increment(1) });
    return { ok: true, jobId };
  });
});

exports.releaseJob = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const jobId = String(request.data?.jobId ?? '');
  if (!jobId) throw new HttpsError('invalid-argument', 'jobId required.');
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  return db.runTransaction(async (tx) => {
    const jobRef = db.collection('jobs').doc(jobId);
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Job no longer exists.');
    const job = snap.data();
    if (job.tradieId !== uid) throw new HttpsError('permission-denied', 'Not your job.');
    if (!['accepted', 'confirmed', 'travelling'].includes(job.status)) {
      throw new HttpsError('failed-precondition', "You're already on site — finish up or ask the customer to cancel.");
    }
    const now = Date.now();
    tx.update(jobRef, {
      status: 'searching',
      tradieId: FieldValue.delete(),
      tradieName: FieldValue.delete(),
      companyId: FieldValue.delete(),
      companyName: FieldValue.delete(),
      rateSnapshot: FieldValue.delete(),
      sourcedVia: FieldValue.delete(),
      tradieLocation: FieldValue.delete(),
      selectedTradieId: FieldValue.delete(),
      declinedBy: FieldValue.arrayUnion(uid),
      'timestamps.searchingAt': now,
      'dispatch.startedAt': now,
      'dispatch.notifiedIds': [],
    });
    tx.update(db.collection('users').doc(uid), { status: 'available' });
    return { ok: true, jobId };
  });
});

/**
 * Completion record (billing handshake). When a job completes:
 *  - generate the deterministic confirmation code (QF-XXXXXX) server-side so
 *    neither party can forge it (clients are rule-blocked from writing it),
 *  - email the customer their completion record at the invoicing address
 *    confirmed on-site (falls back to their account email).
 * The code is the invoice reference for the future Xero push.
 */
/**
 * Founder concierge rescue: when dispatch gives up on a job (no_tradie_found),
 * email the founder immediately with the details so a manual line-up can start.
 * The track screen promises the customer "our team has been alerted" — this is
 * that alert.
 */
exports.onJobRescueAlert = onDocumentUpdated(
  { document: 'jobs/{jobId}', secrets: [BREVO_API_KEY] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after || after.status !== 'no_tradie_found' || before?.status === 'no_tradie_found') return;

    const trade = String(after.trade || 'job').replace(/_/g, ' ');
    const rows = [
      ['Trade', trade],
      ['Mode', after.assignmentMode === 'choose' ? 'Browse & choose (expired)' : 'Auto-assign'],
      ['Emergency', after.isEmergency ? '🚨 YES' : 'No'],
      ['Customer', after.customerName || '—'],
      ['Address', after.location?.address || '—'],
      ['Issue', after.description || '—'],
      ['Scheduled for', after.scheduledFor ? whenNZ(after.scheduledFor) : '—'],
      ['Candidates in pool', String(after.dispatch?.candidateIds?.length ?? 0)],
      ['Job ID', event.params.jobId],
    ]
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 10px;color:#5A6478">${k}</td><td style="padding:6px 10px;font-weight:600">${String(v)}</td></tr>`,
      )
      .join('');
    await brevoSend({
      to: FOUNDER_EMAIL,
      toName: 'QuickieFix Ops',
      subject: `⚠️ Rescue needed — no tradie found (${trade}${after.isEmergency ? ', EMERGENCY' : ''})`,
      html: `
        <h2 style="margin:0 0 8px">No tradie found — concierge rescue</h2>
        <p style="color:#5A6478">Dispatch exhausted every option for this job. The customer has been
        told the team is on it — line someone up or contact them.</p>
        <table style="border-collapse:collapse;background:#F7F9FD;border-radius:8px">${rows}</table>`,
    }).catch((e) => console.error('rescue alert email failed', e));
  },
);

/**
 * Every complaint / support ticket emails the ops inbox immediately — the
 * platform is the only communication channel, so nothing may sit unseen in
 * the back office. Reply goes to the raiser's account email.
 */
exports.onSupportTicket = onDocumentCreated(
  { document: 'complaints/{id}', secrets: [BREVO_API_KEY] },
  async (event) => {
    const c = event.data?.data();
    if (!c) return;
    const isSupport = c.kind === 'support';
    const rows = [
      ['From', `${c.customerName || '—'}${c.raisedByRole ? ` (${c.raisedByRole})` : ''}`],
      ['Reply to', c.contactEmail || '—'],
      ...(c.jobId ? [['Job', `${String(c.trade || 'job').replace(/_/g, ' ')} · ${c.jobId}`]] : []),
      ...(c.tradieName ? [['Tradie', c.tradieName]] : []),
      ['Message', c.detail || '—'],
    ]
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 10px;color:#5A6478;vertical-align:top">${k}</td><td style="padding:6px 10px;font-weight:600">${String(v)}</td></tr>`,
      )
      .join('');
    await brevoSend({
      to: FOUNDER_EMAIL,
      toName: 'QuickieFix Ops',
      subject: `${isSupport ? '🛟 Support ticket' : '⚠️ Complaint'}: ${c.subject || '(no subject)'}`,
      html: `
        <h2 style="margin:0 0 8px">${isSupport ? 'New support ticket' : 'New complaint'}</h2>
        <p style="color:#5A6478">Raised in-app — it's also in the back office Complaints tab. Mark it
        resolved there once handled.</p>
        <table style="border-collapse:collapse;background:#F7F9FD;border-radius:8px">${rows}</table>`,
    }).catch((e) => console.error('support ticket email failed', e));
  },
);

/**
 * Property-agency invite: emails a tenant / tradie / trade company the app
 * download link + the agency code, with role-specific instructions. Caller
 * must be the agency admin.
 */
exports.sendAgencyInvite = onCall(
  { secrets: [BREVO_API_KEY], cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const email = String(request.data?.email || '').trim().toLowerCase();
    const kind = request.data?.kind === 'tenant' ? 'tenant' : 'tradie';
    if (!email || email.length > 320) throw new HttpsError('invalid-argument', 'A valid email is required.');
    const db = admin.firestore();
    const agencies = await db.collection('agencies').where('adminUserId', '==', uid).get();
    if (agencies.empty) throw new HttpsError('permission-denied', 'Only a property agency admin can send invites.');
    const agency = agencies.docs[0].data();
    const isTenant = kind === 'tenant';
    const propertyAddress = String(request.data?.propertyAddress || '').trim().slice(0, 200);
    const inviteeName = String(request.data?.name || '')
      .trim()
      .slice(0, 80)
      .replace(/[<>&"]/g, '');
    const steps = isTenant
      ? `<ol style="color:#5A6478;line-height:1.9">
           <li>Download the QuickieFix app below and create a <b>customer</b> account with this email.</li>
           <li>Open <b>Account → 🏢 Property manager</b> and enter the code.</li>
           <li>${agency.name} confirms you${propertyAddress ? ` and links you to <b>${propertyAddress}</b>` : ' and adds you to your property'} — repairs are then one tap away.</li>
         </ol>`
      : `<ol style="color:#5A6478;line-height:1.9">
           <li><b>Sole tradie?</b> Download the app, sign up as a tradie, then open <b>Profile → 🏢 Property agents</b> and enter the code.</li>
           <li><b>Trade company?</b> Sign in at <a href="https://portal.quickiefix.app">quickiefix-portal.web.app</a> and enter the code under <b>Settings → Property agents</b> — you choose whether it covers your whole team or employees only.</li>
           <li>${agency.name} approves you, and jobs at their managed properties dispatch to you.</li>
         </ol>`;
    await brevoSend({
      to: email,
      toName: inviteeName || email,
      subject: isTenant
        ? `${agency.name} invites you to QuickieFix`
        : `${agency.name} wants you on their approved tradie panel`,
      html: `
        <h2 style="margin:0 0 8px">${isTenant ? `${inviteeName ? `Hi ${inviteeName} — repairs` : 'Repairs'}, sorted — with ${agency.name}` : `Join ${agency.name}'s approved panel`}</h2>
        <p style="color:#5A6478">${
          isTenant
            ? `${agency.name} manages ${propertyAddress ? `your place at <b>${propertyAddress}</b>` : 'your property'} with QuickieFix: report an issue in the app and a verified, approved tradie is dispatched — no phone calls, no waiting.`
            : `${agency.name} uses QuickieFix to route work at their managed properties to their approved tradies. Join the panel to receive those jobs.`
        }</p>
        <div style="text-align:center;margin:18px 0">
          <div style="color:#5A6478;font-size:13px;margin-bottom:6px">Your ${agency.name} code</div>
          <div style="display:inline-block;background:#F1F4FA;border-radius:10px;padding:12px 26px;
                      font-family:monospace;font-size:22px;font-weight:800;letter-spacing:2px">${agency.code}</div>
        </div>
        ${steps}
        <div style="text-align:center;margin:24px 0 8px">
          <a href="https://quickiefix.app/download"
             style="display:inline-block;background:#FFB020;color:#0B1220;font-weight:800;
                    text-decoration:none;padding:15px 30px;border-radius:12px;font-size:15px">
            📲 Download the QuickieFix app
          </a>
        </div>`,
    });
    return { ok: true };
  },
);

/* ------------------------------------------------------- account deletion --- */
// Google Play requires in-app account deletion. Runs with the Admin SDK so it
// works without a recent re-login: removes the profile + sign-in immediately;
// completed-job billing records are kept but de-identified (names only — the
// uid link dies with the users doc).
exports.deleteMyAccount = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = admin.firestore();

  // Unlink from any properties where they're a tenant.
  const rented = await db.collection('properties').where('tenantIds', 'array-contains', uid).get();
  await Promise.all(
    rented.docs.map((d) =>
      d.ref.update({ tenantIds: admin.firestore.FieldValue.arrayRemove(uid) }),
    ),
  );
  // Delete properties they own (landlord) — tenants lose the link, job history
  // keeps its own stamped copies.
  const owned = await db.collection('properties').where('landlordId', '==', uid).get();
  await Promise.all(owned.docs.map((d) => d.ref.delete()));
  // Retire any active company seat.
  const tags = await db.collection('companyTags').where('claimedByUserId', '==', uid).get();
  await Promise.all(
    tags.docs
      .filter((d) => d.data().status !== 'removed')
      .map((d) => d.ref.update({ status: 'removed', removedAt: Date.now(), removedBy: 'account_deleted' })),
  );
  // Remove agency links they hold personally.
  const links = await db.collection('agencyLinks').where('memberId', '==', uid).get();
  await Promise.all(links.docs.map((d) => d.ref.update({ status: 'removed' })));
  // The profile itself, then the sign-in.
  await db.collection('users').doc(uid).delete();
  await admin.auth().deleteUser(uid).catch((e) => {
    // Auth user may already be gone — the data cleanup above still ran.
    if (e?.code !== 'auth/user-not-found') throw e;
  });
  return { ok: true };
});

/* ---------------------------------------------------- agency job dispatch --- */
// The property manager raises a job on a tenant's behalf ("the tenant called
// us with a fault"). Runs with the Admin SDK: verifies the caller manages the
// property, builds the panel-only candidate pool exactly like the app, and
// stamps the TENANT as the customer — so tracking appears in the tenant's app.

const havKm = (a, b) => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

exports.createAgencyJob = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = admin.firestore();
  const { propertyId, trade, description, tenantId, preferredTradieId, scheduledFor } = request.data ?? {};
  if (!propertyId || !trade || !String(description ?? '').trim()) {
    throw new HttpsError('invalid-argument', 'Property, trade and a description are required.');
  }
  const propSnap = await db.collection('properties').doc(String(propertyId)).get();
  if (!propSnap.exists) throw new HttpsError('not-found', 'Property not found.');
  const prop = propSnap.data();
  if (prop.landlordId !== uid) {
    throw new HttpsError('permission-denied', 'You do not manage this property.');
  }

  // Customer of record: the chosen (or only) linked tenant — falls back to
  // the manager themselves when the property has no tenant linked yet.
  let customerId = uid;
  let customerName = prop.landlordName;
  const chosenTenant =
    tenantId && (prop.tenantIds ?? []).includes(tenantId)
      ? tenantId
      : (prop.tenantIds ?? [])[0];
  if (chosenTenant) {
    const tSnap = await db.collection('users').doc(chosenTenant).get();
    if (tSnap.exists) {
      customerId = chosenTenant;
      customerName = `${tSnap.data().firstName} ${tSnap.data().lastName}`;
    }
  }

  // Approved panel for agency-managed properties (mirror of src/lib/panel.ts).
  let panel = null;
  if (prop.agencyId) {
    const linksSnap = await db
      .collection('agencyLinks')
      .where('agencyId', '==', prop.agencyId)
      .get();
    const approved = linksSnap.docs.map((d) => d.data()).filter((l) => l.status === 'approved');
    panel = {
      tradieIds: approved.filter((l) => l.kind === 'tradie').map((l) => l.memberId),
      companyScope: Object.fromEntries(
        approved.filter((l) => l.kind === 'company').map((l) => [l.memberId, l.scope ?? 'all']),
      ),
    };
  }
  const onPanel = (t) => {
    if (!panel) return true;
    if (panel.tradieIds.includes(t.id)) return true;
    if (t.companyId == null) return false;
    const scope = panel.companyScope[t.companyId];
    return !!scope && (scope === 'all' || t.engagement !== 'contractor');
  };

  // ---- Scheduled (pre-assigned) booking ----
  // A future `scheduledFor` books the job to ONE specific panel tradie now, with
  // reminders + a "Go now" reveal later, rather than dispatching to the pool at
  // the booked time. Pick the nearest approved panel tradie for the trade
  // (regardless of live availability — it's for later); the precise address is
  // held in jobPrivate until they tap "Go now".
  const scheduledTs = Number(scheduledFor) || 0;
  if (scheduledTs > Date.now()) {
    const here =
      prop.latitude != null && prop.longitude != null
        ? { latitude: prop.latitude, longitude: prop.longitude }
        : null;
    const pool = await db
      .collection('users')
      .where('role', '==', 'tradie')
      .where('approval', '==', 'approved')
      .get();
    const ranked = pool.docs
      .map((d) => d.data())
      .filter((u) => !u.paymentHold)
      .filter((u) => [u.primaryTrade, ...(u.secondaryTrades ?? [])].includes(trade))
      .filter(onPanel)
      .map((u) => ({ u, km: here && u.baseLocation ? havKm(u.baseLocation, here) : 0 }))
      .sort((a, b) => a.km - b.km || (b.u.ratingAvg ?? 0) - (a.u.ratingAvg ?? 0))
      .map((c) => c.u.id)
      .filter((id) => id !== customerId);
    let orderedIds = ranked;
    if (preferredTradieId && ranked.includes(preferredTradieId)) {
      orderedIds = [preferredTradieId, ...ranked.filter((id) => id !== preferredTradieId)];
    }
    if (!orderedIds.length) {
      throw new HttpsError(
        'failed-precondition',
        'No approved panel tradie for that trade yet — add one to your panel first.',
      );
    }
    const assignedId = orderedIds[0];
    const aSnap = await db.collection('users').doc(assignedId).get();
    const assignedName = aSnap.exists ? aSnap.data().businessName || 'Your tradie' : 'Your tradie';
    const nowTs = Date.now();
    const jobRef = db.collection('jobs').doc();
    await jobRef.set({
      id: jobRef.id,
      customerId,
      customerName,
      trade,
      description: String(description).trim().slice(0, 2000),
      photos: [],
      // AREA only until Go now — the exact address lives in jobPrivate.
      location: { address: streetNameArea(prop.address) },
      urgency: 'scheduled',
      scheduledFor: scheduledTs,
      isEmergency: false,
      assignmentMode: 'auto',
      status: 'booked',
      tradieId: assignedId,
      tradieName: assignedName,
      timestamps: { createdAt: nowTs, bookedAt: nowTs },
      booking: { confirmLeadMs: BOOKING.confirmLeadMs, reminderLeadMs: BOOKING.reminderLeadMs },
      declinedBy: [],
      propertyId: propSnap.id,
      landlordId: prop.landlordId,
      landlordName: prop.landlordName,
      ...(prop.agencyId
        ? {
            agencyId: prop.agencyId,
            agencyName: prop.agencyName,
            agencyBillingEmail: prop.agencyBillingEmail ?? request.auth.token?.email ?? null,
          }
        : {}),
      raisedVia: 'agency_portal',
    });
    // Precise address + ranked reassignment backups, held apart from the
    // readable job doc (the assigned tradie can't read this).
    await db
      .collection('jobPrivate')
      .doc(jobRef.id)
      .set({
        jobId: jobRef.id,
        address: prop.address,
        ...(here ? { latitude: here.latitude, longitude: here.longitude } : {}),
        bookingCandidates: orderedIds,
      });
    const tokens = await pushTokensFor([assignedId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: `🗓️ New booking — ${String(trade).replace(/_/g, ' ')}`,
        body: `${whenNZ(scheduledTs)} · ${areaOnly(prop.address)} — tap to confirm you'll attend.`,
        sound: 'default',
        channelId: 'offers',
        priority: 'high',
        data: { jobId: jobRef.id, role: 'tradie' },
      })),
    );
    await writeAudit({
      type: 'job.booked',
      jobId: jobRef.id,
      trade,
      customerId,
      tradieId: assignedId,
    });
    return {
      jobId: jobRef.id,
      assignedTradieId: assignedId,
      assignedTradieName: assignedName,
      scheduledFor: scheduledTs,
      booked: true,
    };
  }

  // Candidate pool: mirror the app's available-tradie filter + distance rank.
  const usersSnap = await db.collection('users').where('status', '==', 'available').get();
  const here =
    prop.latitude != null && prop.longitude != null
      ? { latitude: prop.latitude, longitude: prop.longitude }
      : null;
  const candidates = usersSnap.docs
    .map((d) => d.data())
    .filter((u) => u.role === 'tradie' && u.approval === 'approved' && !u.paymentHold)
    .filter((u) => [u.primaryTrade, ...(u.secondaryTrades ?? [])].includes(trade))
    .filter(onPanel)
    .map((u) => ({ u, km: here && u.baseLocation ? havKm(u.baseLocation, here) : 0 }))
    .sort((a, b) => a.km - b.km || (b.u.ratingAvg ?? 0) - (a.u.ratingAvg ?? 0));

  let candidateIds = candidates.map((c) => c.u.id).filter((id) => id !== customerId);
  if (preferredTradieId && candidateIds.includes(preferredTradieId)) {
    candidateIds = [preferredTradieId];
  }
  const ownPanelIds = panel
    ? candidates.map((c) => c.u.id).filter((id) => panel.tradieIds.includes(id))
    : undefined;

  const now = Date.now();
  const jobRef = db.collection('jobs').doc();
  await jobRef.set({
    id: jobRef.id,
    customerId,
    customerName,
    trade,
    description: String(description).trim().slice(0, 2000),
    photos: [],
    location: { address: prop.address, ...(here ?? {}) },
    urgency: 'now',
    isEmergency: false,
    assignmentMode: 'auto',
    status: 'searching',
    timestamps: { createdAt: now, searchingAt: now },
    dispatch: { candidateIds, startedAt: now, ...(ownPanelIds ? { ownPanelIds } : {}) },
    interestedTradies: [],
    declinedBy: [],
    propertyId: propSnap.id,
    landlordId: prop.landlordId,
    landlordName: prop.landlordName,
    ...(prop.agencyId
      ? {
          agencyId: prop.agencyId,
          agencyName: prop.agencyName,
          // Caller is the agency admin, so their email is the billing contact.
          agencyBillingEmail: prop.agencyBillingEmail ?? request.auth.token?.email ?? null,
        }
      : {}),
    raisedVia: 'agency_portal',
  });
  return { jobId: jobRef.id, candidateCount: candidateIds.length, customerName };
});

/* ------------------------------------------------- scheduled bookings --- */
// The pre-assigned tradie's three actions on a `booked` job. All server-side
// (Admin SDK) so the exact address stays out of the readable job doc until
// departure, and reassignment can't be forged.

/** Tradie taps "Confirm you'll attend" (booked job). Records intent only — it
 *  does NOT reveal the address or notify the customer. */
exports.confirmAttendance = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const jobId = String(request.data?.jobId ?? '');
  if (!jobId) throw new HttpsError('invalid-argument', 'jobId required.');
  const jobRef = admin.firestore().collection('jobs').doc(jobId);
  const snap = await jobRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Job no longer exists.');
  const job = snap.data();
  if (job.tradieId !== uid) throw new HttpsError('permission-denied', 'Not your booking.');
  if (job.status !== 'booked') throw new HttpsError('failed-precondition', 'This booking is no longer active.');
  await jobRef.update({ 'booking.attendanceConfirmedAt': Date.now() });
  return { ok: true, jobId };
});

/** Tradie taps "Go now": reveal the exact address, move booked → travelling
 *  (which fires the existing "on the way" push to the customer), and mark the
 *  tradie active so they leave the on-demand pool. */
exports.goNow = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const jobId = String(request.data?.jobId ?? '');
  if (!jobId) throw new HttpsError('invalid-argument', 'jobId required.');
  const db = admin.firestore();
  return db.runTransaction(async (tx) => {
    const jobRef = db.collection('jobs').doc(jobId);
    const privRef = db.collection('jobPrivate').doc(jobId);
    const jobSnap = await tx.get(jobRef);
    if (!jobSnap.exists) throw new HttpsError('not-found', 'Job no longer exists.');
    const job = jobSnap.data();
    if (job.tradieId !== uid) throw new HttpsError('permission-denied', 'Not your booking.');
    if (job.status !== 'booked') throw new HttpsError('failed-precondition', 'This booking is no longer active.');
    const privSnap = await tx.get(privRef);
    const priv = privSnap.exists ? privSnap.data() : {};
    const now = Date.now();
    const fullLocation = {
      address: priv.address || job.location?.address || '',
      ...(priv.latitude != null && priv.longitude != null
        ? { latitude: priv.latitude, longitude: priv.longitude }
        : {}),
    };
    tx.update(jobRef, {
      status: 'travelling',
      location: fullLocation,
      'timestamps.travellingAt': now,
      'booking.departedAt': now,
      ...(job.booking?.attendanceConfirmedAt ? {} : { 'booking.attendanceConfirmedAt': now }),
    });
    // Active on this job now → out of the on-demand pool (onJobReleased puts
    // them back to available when it completes/cancels).
    tx.update(db.collection('users').doc(uid), { status: 'job_accepted' });
    return { ok: true, jobId, address: fullLocation.address };
  });
});

/** Tradie hands a booking back ("can't make it"): reassign to the next nearest
 *  panel backup, or fall to no_tradie_found (founder concierge rescue) if the
 *  panel is exhausted. */
exports.declineBooking = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const jobId = String(request.data?.jobId ?? '');
  if (!jobId) throw new HttpsError('invalid-argument', 'jobId required.');
  const db = admin.firestore();
  const jobRef = db.collection('jobs').doc(jobId);
  const privRef = db.collection('jobPrivate').doc(jobId);
  const [jobSnap, privSnap] = await Promise.all([jobRef.get(), privRef.get()]);
  if (!jobSnap.exists) throw new HttpsError('not-found', 'Job no longer exists.');
  const job = jobSnap.data();
  if (job.tradieId !== uid) throw new HttpsError('permission-denied', 'Not your booking.');
  if (job.status !== 'booked') throw new HttpsError('failed-precondition', 'This booking can no longer be handed back.');
  const priv = privSnap.exists ? privSnap.data() : {};
  const declined = [...(job.declinedBy ?? []), uid];
  const backups = (priv.bookingCandidates ?? []).filter((id) => !declined.includes(id));
  const now = Date.now();
  if (backups.length) {
    const nextId = backups[0];
    const tSnap = await db.collection('users').doc(nextId).get();
    const nextName = tSnap.exists ? tSnap.data().businessName || 'Your tradie' : 'Your tradie';
    await jobRef.update({
      tradieId: nextId,
      tradieName: nextName,
      declinedBy: declined,
      // Fresh reminder cycle for the new tradie.
      booking: {
        confirmLeadMs: job.booking?.confirmLeadMs ?? BOOKING.confirmLeadMs,
        reminderLeadMs: job.booking?.reminderLeadMs ?? BOOKING.reminderLeadMs,
      },
    });
    const tokens = await pushTokensFor([nextId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: `🗓️ New booking — ${String(job.trade).replace(/_/g, ' ')}`,
        body: `${whenNZ(job.scheduledFor)} · ${areaOnly(job.location?.address)} — tap to confirm you'll attend.`,
        sound: 'default',
        channelId: 'offers',
        priority: 'high',
        data: { jobId, role: 'tradie' },
      })),
    );
    return { ok: true, reassigned: true };
  }
  await jobRef.update({
    status: 'no_tradie_found',
    declinedBy: declined,
    tradieId: admin.firestore.FieldValue.delete(),
    tradieName: admin.firestore.FieldValue.delete(),
    'timestamps.noTradieFoundAt': now,
  });
  return { ok: true, reassigned: false };
});

/**
 * Customer/tenant books a FUTURE job in-app ("Book a future job"). Unlike an
 * immediate request, this PRE-ASSIGNS the nearest matching tradie now and
 * creates a `booked` job — so it sits in Upcoming (both sides), the tradie stays
 * available, and it only goes active when they tap "Go now". Panel-filtered +
 * agency-billed at managed properties; open-market (with a rate snapshot)
 * otherwise. Mirrors the portal's createAgencyJob booking path.
 */
exports.createBooking = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = admin.firestore();
  const { trade, description, photos, location, propertyId, scheduledFor, payer } = request.data ?? {};
  if (!trade || !String(description ?? '').trim()) {
    throw new HttpsError('invalid-argument', 'Trade and a description are required.');
  }
  const schedTs = Number(scheduledFor) || 0;
  if (schedTs <= Date.now()) throw new HttpsError('invalid-argument', 'Pick a future date and time.');

  const meSnap = await db.collection('users').doc(uid).get();
  const me = meSnap.exists ? meSnap.data() : {};
  const myName = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || 'Customer';

  // Resolve where the job is + any property/agency context.
  let addr = '';
  let here = null;
  let prop = null;
  let propId = null;
  if (propertyId) {
    const propSnap = await db.collection('properties').doc(String(propertyId)).get();
    if (!propSnap.exists) throw new HttpsError('not-found', 'Property not found.');
    prop = propSnap.data();
    if (prop.landlordId !== uid && !(prop.tenantIds ?? []).includes(uid)) {
      throw new HttpsError('permission-denied', 'You are not linked to this property.');
    }
    propId = propSnap.id;
    addr = prop.address;
    here =
      prop.latitude != null && prop.longitude != null
        ? { latitude: prop.latitude, longitude: prop.longitude }
        : null;
  } else {
    addr = String(location?.address ?? '').trim();
    if (!addr) throw new HttpsError('invalid-argument', 'A job address is required.');
    here =
      location.latitude != null && location.longitude != null
        ? { latitude: location.latitude, longitude: location.longitude }
        : null;
  }

  // Agency pays (panel-only, rates hidden) only at a managed property when the
  // requester didn't choose to pay themselves.
  const agencyPays = !!(prop && prop.agencyId) && payer !== 'customer';

  let panel = null;
  if (agencyPays) {
    const linksSnap = await db.collection('agencyLinks').where('agencyId', '==', prop.agencyId).get();
    const approved = linksSnap.docs.map((d) => d.data()).filter((l) => l.status === 'approved');
    panel = {
      tradieIds: approved.filter((l) => l.kind === 'tradie').map((l) => l.memberId),
      companyScope: Object.fromEntries(
        approved.filter((l) => l.kind === 'company').map((l) => [l.memberId, l.scope ?? 'all']),
      ),
    };
  }
  const onPanel = (t) => {
    if (!panel) return true;
    if (panel.tradieIds.includes(t.id)) return true;
    if (t.companyId == null) return false;
    const scope = panel.companyScope[t.companyId];
    return !!scope && (scope === 'all' || t.engagement !== 'contractor');
  };

  // Nearest approved matching tradie (ignore live availability — it's for later).
  const pool = await db
    .collection('users')
    .where('role', '==', 'tradie')
    .where('approval', '==', 'approved')
    .get();
  const ranked = pool.docs
    .map((d) => d.data())
    .filter((u) => !u.paymentHold)
    .filter((u) => [u.primaryTrade, ...(u.secondaryTrades ?? [])].includes(trade))
    .filter(onPanel)
    .map((u) => ({ u, km: here && u.baseLocation ? havKm(u.baseLocation, here) : 0 }))
    .sort((a, b) => a.km - b.km || (b.u.ratingAvg ?? 0) - (a.u.ratingAvg ?? 0));
  const orderedIds = ranked.map((c) => c.u.id).filter((id) => id !== uid);
  if (!orderedIds.length) {
    throw new HttpsError(
      'failed-precondition',
      agencyPays
        ? 'No approved panel tradie for that trade yet.'
        : 'No tradie for that trade in your area yet — try an immediate request instead.',
    );
  }
  const assigned = ranked.find((c) => c.u.id === orderedIds[0]).u;
  const assignedName = assigned.businessName || 'Your tradie';

  // Open-market bookings capture the rate snapshot up front (agency jobs bill on
  // the agency's terms → no snapshot).
  const stamp = {};
  if (!agencyPays) {
    let company;
    if (assigned.companyId) {
      const cs = await db.collection('companies').doc(assigned.companyId).get();
      if (cs.exists) company = cs.data();
    }
    const useCompany = !!company && assigned.engagement !== 'contractor';
    if (useCompany && company) {
      stamp.companyId = assigned.companyId;
      stamp.companyName = company.name;
    }
    stamp.sourcedVia = 'open_market';
    const rateCard = useCompany ? company.rateCard ?? assigned.rateCard : assigned.rateCard;
    if (rateCard) {
      stamp.rateSnapshot = {
        rateCard,
        source: useCompany && company?.rateCard ? 'company' : 'personal',
        ...(useCompany && company ? { companyName: company.name } : {}),
        capturedAt: Date.now(),
      };
    }
  }

  const now = Date.now();
  const jobRef = db.collection('jobs').doc();
  await jobRef.set({
    id: jobRef.id,
    customerId: uid,
    customerName: myName,
    trade,
    description: String(description).trim().slice(0, 2000),
    photos: Array.isArray(photos) ? photos.slice(0, 6) : [],
    location: { address: streetNameArea(addr) },
    urgency: 'scheduled',
    scheduledFor: schedTs,
    isEmergency: false,
    assignmentMode: 'auto',
    status: 'booked',
    tradieId: orderedIds[0],
    tradieName: assignedName,
    timestamps: { createdAt: now, bookedAt: now },
    booking: { confirmLeadMs: BOOKING.confirmLeadMs, reminderLeadMs: BOOKING.reminderLeadMs },
    declinedBy: [],
    ...(prop ? { propertyId: propId, landlordId: prop.landlordId, landlordName: prop.landlordName } : {}),
    ...(agencyPays
      ? {
          agencyId: prop.agencyId,
          agencyName: prop.agencyName,
          agencyBillingEmail: prop.agencyBillingEmail ?? null,
          billTo: 'agency',
        }
      : {}),
    ...stamp,
  });
  await db
    .collection('jobPrivate')
    .doc(jobRef.id)
    .set({
      jobId: jobRef.id,
      address: addr,
      ...(here ? { latitude: here.latitude, longitude: here.longitude } : {}),
      bookingCandidates: orderedIds,
    });
  const tokens = await pushTokensFor([orderedIds[0]]);
  await expoPush(
    tokens.map((to) => ({
      to,
      title: `🗓️ New booking — ${String(trade).replace(/_/g, ' ')}`,
      body: `${whenNZ(schedTs)} · ${areaOnly(addr)} — tap to confirm you'll attend.`,
      sound: 'default',
      channelId: 'offers',
      priority: 'high',
      data: { jobId: jobRef.id, role: 'tradie' },
    })),
  );
  await writeAudit({ type: 'job.booked', jobId: jobRef.id, trade, customerId: uid, tradieId: orderedIds[0] });
  return { jobId: jobRef.id, assignedTradieName: assignedName, scheduledFor: schedTs, booked: true };
});

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
      ? `<tr><td style="padding:4px 0;color:#5A6478">Hourly rate (labour)</td><td align="right"><b>${money(rc.hourlyRateCents)}</b></td></tr>` +
        (rc.calloutFeeCents != null
          ? `<tr><td style="padding:4px 0;color:#5A6478">Call-out fee</td><td align="right"><b>${money(rc.calloutFeeCents)}</b></td></tr>`
          : '')
      : '';
    // Parts & materials recorded at completion — agreed on site, billed by
    // the tradie in addition to labour.
    const parts = Array.isArray(after.parts) ? after.parts : [];
    const partsTotal = parts.reduce((s, p) => s + (p.qty || 1) * (p.unitPriceCents || 0), 0);
    const partsRows = parts.length
      ? `<tr><td colspan="2" style="padding:10px 0 4px;color:#0B1220;font-weight:700">Parts &amp; materials (agreed on site)</td></tr>` +
        parts
          .map(
            (p) =>
              `<tr><td style="padding:3px 0;color:#5A6478">${String(p.description).slice(0, 120)}${(p.qty || 1) > 1 ? ` × ${p.qty}` : ''}</td><td align="right"><b>${money((p.qty || 1) * (p.unitPriceCents || 0))}</b></td></tr>`,
          )
          .join('') +
        `<tr><td style="padding:6px 0;color:#0B1220;font-weight:700;border-top:1px solid #E2E7F1">Parts total</td><td align="right" style="border-top:1px solid #E2E7F1"><b>${money(partsTotal)}</b></td></tr>`
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
          <table width="100%" style="font-size:14px">${rates}${partsRows}</table>
          <p style="color:#5A6478;font-size:13px">The tradie invoices you directly — labour at the
          rates agreed when you confirmed them${parts.length ? ', plus the parts listed above' : ''}.
          Quote the confirmation code on any invoice query — it's your shared record of this job.</p>
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

/** Trim long text for a notification body. */
const snip = (s, n = 90) => {
  const t = String(s || '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Suburb/city part of an address (street stripped) — offer pushes go to
 *  candidates who aren't assigned yet, so never leak the exact address. */
function areaOnly(address) {
  const parts = String(address || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(', ') : parts[0] || '';
}

/** Street name + suburb with the house/unit number stripped — what a pre-
 *  assigned tradie sees for a booking until they tap "Go now" (which reveals
 *  the exact number). Falls back to the suburb/city if the street can't be
 *  isolated. */
function streetNameArea(address) {
  const parts = String(address || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  parts[0] = parts[0].replace(/^\s*\d+[a-zA-Z]?\s*(?:\/\s*\d+[a-zA-Z]?)?\s+/, '').trim();
  if (!parts[0]) return areaOnly(address);
  return parts.join(', ');
}

/** NZ-local "Tomorrow 8:00 am" style label for scheduled jobs. */
function whenNZ(ms) {
  try {
    return new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

/** Job details line shown on offer pushes: what + roughly where + when. */
function jobPushBody(job) {
  const area = areaOnly(job.location?.address);
  return [
    snip(job.description),
    [area ? `📍 ${snip(area, 60)}` : null, job.scheduledFor ? `🗓️ ${whenNZ(job.scheduledFor)}` : null]
      .filter(Boolean)
      .join(' · '),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Send the offer push to `ids` that haven't been notified yet; record them. */
async function notifyOfferCandidates(jobRef, job, jobId, ids) {
  const notified = job.dispatch?.notifiedIds ?? [];
  const fresh = ids.filter((id) => !notified.includes(id));
  if (!fresh.length) return;
  const tokens = await pushTokensFor(fresh);
  const trade = String(job.trade || 'job').replace(/_/g, ' ');
  const tradeLabel = trade.charAt(0).toUpperCase() + trade.slice(1);
  await expoPush(
    tokens.map((to) => ({
      to,
      // The offer must be parseable at a glance: what + how urgent up top,
      // who/where/when in the body.
      title: job.isEmergency ? `🚨 EMERGENCY — ${tradeLabel} needed` : `⚡ New job: ${tradeLabel}`,
      body:
        [`${job.customerName || 'A customer'}`, jobPushBody(job)].filter(Boolean).join(' — ') ||
        `${job.customerName || 'A customer'} needs a ${trade}.`,
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
  // Scheduled jobs: dispatchSweep sends the first wave when the booked time
  // arrives — pinging tradies now for tomorrow's job would just be noise.
  if ((job.dispatch?.startedAt ?? 0) > Date.now()) return;
  const candidates = job.dispatch?.candidateIds ?? [];
  if (candidates.length) {
    await notifyOfferCandidates(
      event.data.ref,
      job,
      event.params.jobId,
      candidates.slice(0, PUSH_WAVE.first),
    );
  }
  // Agency-raised job: the tenant is the customer of record but didn't tap the
  // button — tell them their property manager has a tradie on the way.
  if (job.raisedVia === 'agency_portal' && job.customerId) {
    const tokens = await pushTokensFor([job.customerId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: `🏢 ${job.agencyName || 'Your property manager'} raised a repair for your place`,
        body: `${snip(job.description)} — track the tradie live in the app.`,
        sound: 'default',
        data: { jobId: event.params.jobId, role: 'customer' },
      })),
    );
  }
});

/** New message → push the party who DIDN'T send it. */
exports.onMessagePosted = onDocumentCreated('messages/{id}', async (event) => {
  const msg = event.data?.data();
  if (!msg?.jobId) return;
  const jobSnap = await admin.firestore().collection('jobs').doc(msg.jobId).get();
  if (!jobSnap.exists) return;
  const job = jobSnap.data();
  const recipient = msg.from === 'customer' ? job.tradieId : job.customerId;
  if (!recipient) return;
  const tokens = await pushTokensFor([recipient]);
  await expoPush(
    tokens.map((to) => ({
      to,
      title: `💬 ${msg.senderName || 'New message'}`,
      body: snip(msg.text, 120),
      sound: 'default',
      data: { jobId: msg.jobId, role: msg.from === 'customer' ? 'tradie' : 'customer' },
    })),
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

  // Browse-and-choose: a tradie raised their hand → nudge the customer to
  // look at their browse list.
  if (
    after.status === 'searching' &&
    (after.interestedTradies?.length ?? 0) > (before.interestedTradies?.length ?? 0) &&
    after.customerId
  ) {
    const newest = after.interestedTradies[after.interestedTradies.length - 1];
    const tokens = await pushTokensFor([after.customerId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: '👀 A tradie is keen on your job',
        body: `${newest?.businessName || 'A tradie'} put their hand up — compare rates and reviews, then choose your pro.`,
        sound: 'default',
        data: { jobId, role: 'customer' },
      })),
    );
  }

  // Browse-and-choose: the customer picked a tradie → prompt them to accept.
  if (after.selectedTradieId && after.selectedTradieId !== before.selectedTradieId) {
    const tokens = await pushTokensFor([after.selectedTradieId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: `⭐ ${after.customerName || 'A customer'} chose you — accept to lock it in`,
        body: jobPushBody(after) || 'Open the job to see the details.',
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
        body: `${after.tradieName || 'A tradie'} is locked in for your ${String(after.trade || 'job').replace(/_/g, ' ')} job and will head over shortly.`,
        sound: 'default',
        data: { jobId, role: 'customer' },
      })),
    );
    // …and close the loop for the interested tradies who WEREN'T picked, so
    // they aren't left watching a stale job.
    const losers = (after.interestedTradies ?? [])
      .map((t) => t.tradieId)
      .filter((id) => id && id !== after.tradieId);
    if (losers.length) {
      const loserTokens = await pushTokensFor(losers);
      await expoPush(
        loserTokens.map((to) => ({
          to,
          title: 'Job taken',
          body: `${after.customerName || 'The customer'} went with another tradie this time — more jobs are always coming.`,
          sound: 'default',
          data: { jobId, role: 'tradie' },
        })),
      );
    }
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

  // Tradie arrived on site → the customer should know the clock has started.
  if (after.status === 'on_site' && before.status !== 'on_site' && after.customerId) {
    const tokens = await pushTokensFor([after.customerId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: '🛠️ Your tradie has arrived',
        body: `${after.tradieName || 'Your tradie'} is on site and getting started.`,
        sound: 'default',
        data: { jobId, role: 'customer' },
      })),
    );
  }

  // Browse-and-choose: the customer's pick DECLINED → tell them to choose again.
  if (
    before.selectedTradieId &&
    !after.selectedTradieId &&
    after.status === 'searching' &&
    after.customerId
  ) {
    const tokens = await pushTokensFor([after.customerId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: '😕 Your pick had to pass',
        body: 'That tradie declined this time — your other options are still lined up. Tap to choose someone else.',
        sound: 'default',
        data: { jobId, role: 'customer' },
      })),
    );
  }

  // Cancelled → tell the OTHER party (a tradie may already be driving).
  if (after.status === 'cancelled' && before.status !== 'cancelled') {
    const trade = String(after.trade || 'job').replace(/_/g, ' ');
    if (after.cancelledBy === 'customer' && after.tradieId) {
      const tokens = await pushTokensFor([after.tradieId]);
      await expoPush(
        tokens.map((to) => ({
          to,
          title: '🚫 Job cancelled',
          body: `${after.customerName || 'The customer'} cancelled the ${trade} job — no need to head over.`,
          sound: 'default',
          channelId: 'offers',
          priority: 'high',
          data: { jobId, role: 'tradie' },
        })),
      );
    }
    if (after.cancelledBy === 'tradie' && after.customerId) {
      const tokens = await pushTokensFor([after.customerId]);
      await expoPush(
        tokens.map((to) => ({
          to,
          title: '🚫 Job cancelled',
          body: `${after.tradieName || 'The tradie'} cancelled your ${trade} job. Tap to request again.`,
          sound: 'default',
          data: { jobId, role: 'customer' },
        })),
      );
    }
  }

  // The assigned tradie RELEASED the job (couldn't make it) → back to searching.
  if (
    after.status === 'searching' &&
    ['accepted', 'confirmed', 'travelling'].includes(before.status) &&
    after.customerId
  ) {
    const tokens = await pushTokensFor([after.customerId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: '🔄 Finding you a new tradie',
        body: `${before.tradieName || 'Your tradie'} couldn't make it — we're alerting other pros now.`,
        sound: 'default',
        data: { jobId, role: 'customer' },
      })),
    );
  }

  // Search failed → the customer must know (they may have backgrounded the app).
  if (after.status === 'no_tradie_found' && before.status !== 'no_tradie_found' && after.customerId) {
    const tokens = await pushTokensFor([after.customerId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: '😔 No tradie found this time',
        body: "We couldn't reach an available pro for this one. Our team has been alerted — tap to try again.",
        sound: 'default',
        data: { jobId, role: 'customer' },
      })),
    );
  }

  // Completed → the record + rating live in-app; the email alone isn't enough.
  if (after.status === 'completed' && before.status !== 'completed' && after.customerId) {
    const tokens = await pushTokensFor([after.customerId]);
    await expoPush(
      tokens.map((to) => ({
        to,
        title: `✅ Job complete — rate ${after.tradieName || 'your tradie'}`,
        body: 'Your record + confirmation code are in the app. A quick rating helps everyone.',
        sound: 'default',
        data: { jobId, role: 'customer' },
      })),
    );
  }
});

/**
 * Stable app-download redirect. Served at quickiefix.app/download (Hosting
 * rewrite) — resolves the newest FINISHED internal Android build from EAS at
 * request time and 302-redirects to its APK. Emails/links never go stale: as
 * long as a recent build exists, this always points at the latest one.
 */

/**
 * Google Places proxy — address autocomplete for the app. The API key lives in
 * Secret Manager and never ships in the client. Session tokens are passed
 * through so a typing session + the final details lookup bill as ONE Places
 * session, not per keystroke. Sydney region for trans-Tasman latency.
 *
 *  POST { op: 'suggest', input, sessionToken }  → { suggestions: [{placeId, text}] }
 *  POST { op: 'details', placeId, sessionToken } → { address, latitude, longitude }
 */
exports.places = onRequest(
  { secrets: [PLACES_API_KEY], region: 'australia-southeast1', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }
    const key = PLACES_API_KEY.value().trim();
    const { op, input, placeId, sessionToken } = req.body || {};
    try {
      if (op === 'suggest') {
        if (!input || String(input).trim().length < 3) {
          res.json({ suggestions: [] });
          return;
        }
        const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key },
          body: JSON.stringify({
            input: String(input).slice(0, 120),
            ...(sessionToken ? { sessionToken: String(sessionToken).slice(0, 64) } : {}),
            includedRegionCodes: ['nz'],
          }),
        });
        const data = await r.json();
        if (!r.ok) {
          console.error('places autocomplete failed:', r.status, JSON.stringify(data));
          res.status(502).json({ error: 'lookup failed' });
          return;
        }
        res.json({
          suggestions: (data.suggestions || [])
            .map((s) => s.placePrediction)
            .filter(Boolean)
            .map((p) => ({ placeId: p.placeId, text: p.text?.text || '' })),
        });
      } else if (op === 'details' && placeId) {
        const qs = sessionToken
          ? `?sessionToken=${encodeURIComponent(String(sessionToken).slice(0, 64))}`
          : '';
        const r = await fetch(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(String(placeId))}${qs}`,
          { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'formattedAddress,location' } },
        );
        const data = await r.json();
        if (!r.ok) {
          console.error('places details failed:', r.status, JSON.stringify(data));
          res.status(502).json({ error: 'lookup failed' });
          return;
        }
        res.json({
          address: data.formattedAddress || '',
          latitude: data.location?.latitude ?? null,
          longitude: data.location?.longitude ?? null,
        });
      } else {
        res.status(400).json({ error: 'unknown op' });
      }
    } catch (e) {
      console.error('places proxy error:', e);
      res.status(500).json({ error: 'lookup failed' });
    }
  },
);

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
// Hosted PNG (SVG is blocked by most email clients). 360px source → 180px
// display = crisp on retina. Served from the landing site.
const EMAIL_LOGO_URL = 'https://quickiefix.app/email-logo.png';

async function brevoSend({ to, toName, subject, html }) {
  // Every email gets the branded header + a consistent footer, in one place.
  const branded = `
  <div style="background:#F4F6FB;padding:24px 12px">
    <div style="max-width:560px;margin:auto;background:#FFFFFF;border-radius:16px;padding:8px 24px 24px">
      <div style="text-align:center;padding:14px 0 2px">
        <img src="${EMAIL_LOGO_URL}" width="180" alt="QuickieFix" style="max-width:180px;height:auto" />
      </div>
      ${html}
    </div>
    <div style="max-width:560px;margin:auto;text-align:center;padding-top:14px;color:#8A93A6;font-family:Inter,Arial,sans-serif;font-size:12px">
      QuickieFix · On-demand, verified tradies · <a href="https://quickiefix.app" style="color:#8A93A6">quickiefix.app</a>
    </div>
  </div>`;

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
      htmlContent: branded,
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
    if (job.status === 'booked') {
      await emailLandlordRecord(job, {
        subject: `Booking scheduled at your property`,
        heading: 'A job has been booked at your property',
        intro: `A ${String(job.trade).replace(/_/g, ' ')} has been booked at ${job.location?.address || 'your property'} for ${whenNZ(job.scheduledFor)}${job.tradieName ? `, with ${job.tradieName}` : ''}. We'll remind them ahead of time and track it through to completion.`,
      });
      return;
    }
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
        You're receiving this because you signed up at quickiefix.app. No further action needed.
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
