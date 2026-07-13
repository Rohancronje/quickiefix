import { useEffect, useState } from 'react';
import { listCompanyAgencyLinks, requestCompanyAgencyLink } from '../agencyApi';
import { setCompanyRateCard, updateCompanyName, updateCompanyProfile } from '../api';
import { useAuth } from '../auth';
import { centsToDollars, dollarsToCents } from '../lib';
import { AgencyLink, RateCard } from '../types';

const centsToInput = (cents?: number) =>
  cents === undefined ? '' : (cents / 100).toFixed(2);

export function Settings() {
  const { company, logout, refreshCompany } = useAuth();
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

  // Property-agency panels this company belongs to (or has requested).
  const [agencyLinks, setAgencyLinks] = useState<AgencyLink[]>([]);
  const [agencyCode, setAgencyCode] = useState('');
  const [joiningAgency, setJoiningAgency] = useState(false);
  useEffect(() => {
    if (company) void listCompanyAgencyLinks(company.id).then(setAgencyLinks);
  }, [company]);

  const joinAgency = async () => {
    if (!company || !agencyCode.trim()) return;
    try {
      setJoiningAgency(true);
      const name = await requestCompanyAgencyLink(company, agencyCode);
      setAgencyCode('');
      setAgencyLinks(await listCompanyAgencyLinks(company.id));
      flash(`Request sent to ${name} — pending their approval`);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setJoiningAgency(false);
    }
  };

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
    await refreshCompany();
    setSaving(false);
    flash('Saved ✓');
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
    await refreshCompany();
    setRateCard(card);
    setSavingRate(false);
    flash('Rate card saved — you are live 🎉');
  };

  return (
    <div className="co-stack" style={{ maxWidth: 620 }}>
      {/* Rate card */}
      <div className="co-card">
        <div className="co-between" style={{ marginBottom: 8 }}>
          <div className="co-sectionhead" style={{ marginBottom: 0 }}>
            Rate card
          </div>
          <span className={`co-chip ${isLive ? 'co-chip-green' : 'co-chip-amber'}`}>
            {isLive ? 'Active' : 'Setup'}
          </span>
        </div>
        {!isLive && (
          <p className="co-help">
            Set your rate card to go live. Your hourly rate is required; callout fees are optional.
          </p>
        )}
        <div className="co-field" style={{ marginBottom: 12 }}>
          <label>Hourly rate (NZD)</label>
          <input
            className="co-input"
            type="number"
            min={0}
            step="0.01"
            value={hourly}
            onChange={(e) => setHourly(e.target.value)}
            placeholder="85.00"
          />
        </div>
        <div className="co-formrow cols-2" style={{ marginBottom: 12 }}>
          <div className="co-field">
            <label>Callout fee (optional)</label>
            <input
              className="co-input"
              type="number"
              min={0}
              step="0.01"
              value={callout}
              onChange={(e) => setCallout(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="co-field">
            <label>After-hours callout (optional)</label>
            <input
              className="co-input"
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
          <p className="co-sub co-num" style={{ fontSize: 13, marginBottom: 12 }}>
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
          className="co-btn co-btn-primary"
          disabled={savingRate || !hourly.trim()}
          onClick={saveRateCard}
        >
          {savingRate ? 'Saving…' : isLive ? 'Save rate card' : 'Save & go live'}
        </button>
      </div>

      {/* Company profile */}
      <div className="co-card">
        <div className="co-sectionhead">Company profile</div>
        <div className="co-field" style={{ marginBottom: 12 }}>
          <label>Company name</label>
          <input className="co-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="co-field" style={{ marginBottom: 16 }}>
          <label>Billing email</label>
          <input
            className="co-input"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            placeholder="accounts@yourcompany.co.nz"
          />
        </div>
        <button
          className="co-btn co-btn-primary"
          disabled={saving || !name.trim()}
          onClick={saveProfile}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {/* Property agents — approved-panel memberships (whole roster) */}
      <div className="co-card">
        <div className="co-sectionhead">Property agents</div>
        <p className="co-help">
          Work with a property manager? Enter their agent code — once they approve, jobs at their
          managed properties dispatch to your whole team (on the agency's own commercial terms).
        </p>
        {agencyLinks.map((l) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{l.agencyName}</span>
            <span className={`co-chip ${l.status === 'approved' ? 'co-chip-green' : 'co-chip-amber'}`}>
              {l.status}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            className="co-input"
            style={{ flex: 1 }}
            placeholder="Agent code (e.g. QF-AG-7K2P)"
            value={agencyCode}
            onChange={(e) => setAgencyCode(e.target.value.toUpperCase())}
          />
          <button
            className="co-btn co-btn-primary co-btn-sm"
            disabled={joiningAgency || !agencyCode.trim()}
            onClick={joinAgency}
          >
            {joiningAgency ? 'Sending…' : 'Join panel'}
          </button>
        </div>
      </div>

      <div className="co-card">
        <div className="co-sectionhead">Account</div>
        <table className="co-table">
          <tbody>
            <tr>
              <td className="co-sub">Admin email</td>
              <td style={{ fontWeight: 600 }}>{company?.adminEmail}</td>
            </tr>
            <tr>
              <td className="co-sub">Company ID</td>
              <td>
                <span className="co-code">{company?.id}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="co-card">
        <div className="co-sectionhead">Session</div>
        <button className="co-btn co-btn-ghost" onClick={logout}>
          Log out
        </button>
      </div>

      {toast && <div className="co-toast">{toast}</div>}
    </div>
  );
}
