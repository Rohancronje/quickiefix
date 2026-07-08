import { useState } from 'react';
import { setCompanyRateCard, updateCompanyName, updateCompanyProfile } from '../api';
import { useAuth } from '../auth';
import { centsToDollars, dollarsToCents } from '../lib';
import { RateCard } from '../types';

const centsToInput = (cents?: number) =>
  cents === undefined ? '' : (cents / 100).toFixed(2);

export function Settings() {
  const { company, logout } = useAuth();
  const [name, setName] = useState(company?.name ?? '');
  const [billingEmail, setBillingEmail] = useState(company?.billingEmail ?? '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Rate card editor (dollars in the UI, cents in Firestore).
  const [rateCard, setRateCard] = useState<RateCard | undefined>(company?.rateCard);
  const [hourly, setHourly] = useState(centsToInput(company?.rateCard?.hourlyRateCents));
  const [callout, setCallout] = useState(centsToInput(company?.rateCard?.calloutFeeCents));
  const [afterHours, setAfterHours] = useState(
    centsToInput(company?.rateCard?.afterHoursCalloutFeeCents),
  );
  const [savingRate, setSavingRate] = useState(false);

  const isLive = !!rateCard; // company goes 'active' once a rate card is set

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const saveProfile = async () => {
    if (!company || !name.trim()) return;
    setSaving(true);
    await updateCompanyName(company.id, name);
    await updateCompanyProfile(company.id, { billingEmail });
    setSaving(false);
    flash('Saved — refresh to see it everywhere');
  };

  const saveRateCard = async () => {
    if (!company) return;
    const hourlyRateCents = dollarsToCents(hourly);
    if (hourlyRateCents <= 0) {
      flash('Enter an hourly rate to go live');
      return;
    }
    const card: RateCard = { hourlyRateCents };
    if (callout.trim()) card.calloutFeeCents = dollarsToCents(callout);
    if (afterHours.trim()) card.afterHoursCalloutFeeCents = dollarsToCents(afterHours);
    setSavingRate(true);
    await setCompanyRateCard(company.id, card);
    setRateCard(card);
    setSavingRate(false);
    flash('Rate card saved — you are live');
  };

  return (
    <div className="grid" style={{ gap: 24, maxWidth: 620 }}>
      {/* Rate card */}
      <div className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <div className="section-title" style={{ margin: 0 }}>
            Rate card
          </div>
          <span className={`badge ${isLive ? 'badge-green' : 'badge-amber'}`}>
            {isLive ? 'Active' : 'Setup'}
          </span>
        </div>
        {!isLive && (
          <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>
            Set your rate card to go live. Your hourly rate is required; callout fees are optional.
          </p>
        )}
        <div className="field">
          <label>Hourly rate (NZD)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={hourly}
            onChange={(e) => setHourly(e.target.value)}
            placeholder="85.00"
          />
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Callout fee (optional)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={callout}
              onChange={(e) => setCallout(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="field">
            <label>After-hours callout (optional)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={afterHours}
              onChange={(e) => setAfterHours(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        {rateCard && (
          <p className="faint" style={{ fontSize: 13, marginBottom: 12 }}>
            Current: {centsToDollars(rateCard.hourlyRateCents)}/hr
            {rateCard.calloutFeeCents !== undefined
              ? ` · callout ${centsToDollars(rateCard.calloutFeeCents)}`
              : ''}
            {rateCard.afterHoursCalloutFeeCents !== undefined
              ? ` · after-hours ${centsToDollars(rateCard.afterHoursCalloutFeeCents)}`
              : ''}
          </p>
        )}
        <button
          className="btn btn-primary"
          disabled={savingRate || !hourly.trim()}
          onClick={saveRateCard}
        >
          {savingRate ? 'Saving…' : isLive ? 'Save rate card' : 'Save & go live'}
        </button>
      </div>

      {/* Company profile */}
      <div className="card">
        <div className="section-title">Company profile</div>
        <div className="field">
          <label>Company name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Billing email</label>
          <input
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            placeholder="accounts@yourcompany.co.nz"
          />
        </div>
        <button className="btn btn-primary" disabled={saving || !name.trim()} onClick={saveProfile}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="card">
        <div className="section-title">Account</div>
        <table>
          <tbody>
            <tr>
              <td className="faint">Admin email</td>
              <td style={{ fontWeight: 600 }}>{company?.adminEmail}</td>
            </tr>
            <tr>
              <td className="faint">Company ID</td>
              <td>
                <span className="pill-code">{company?.id}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="section-title">Session</div>
        <button className="btn btn-ghost" onClick={logout}>
          Log out
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
