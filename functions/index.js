/**
 * QuickieFix Cloud Functions.
 *
 * sendWelcomeEmail — sends a branded welcome email (with a temporary password)
 * to a newly-imported tradie via Brevo. The Brevo API key lives ONLY here, as a
 * Secret Manager secret — never in the client app.
 *
 * Set the secret before deploying:
 *   firebase functions:secrets:set BREVO_API_KEY
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const BREVO_API_KEY = defineSecret('BREVO_API_KEY');

// Must be a VERIFIED sender in your Brevo account (single sender or a verified
// domain). Change this to your verified address.
const SENDER = { email: 'noreply@quickiefix.store', name: 'QuickieFix' };

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
        Download the QuickieFix app, sign in with the details above, and change your
        password from your profile. Welcome aboard! ⚡
      </p>
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
    const { email, firstName, companyName, tempPassword } = request.data || {};
    if (!email || !tempPassword || !companyName) {
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
        to: [{ email, name: firstName || email }],
        subject: `You've been added to ${companyName} on QuickieFix`,
        htmlContent: welcomeHtml({ firstName, companyName, email, tempPassword }),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new HttpsError('internal', `Email provider error: ${text.slice(0, 200)}`);
    }
    return { ok: true };
  },
);
