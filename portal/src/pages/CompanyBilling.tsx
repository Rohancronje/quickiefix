import { useMemo } from 'react';
import { companyFeesQuery, companyJobsQuery } from '../api';
import { useAuth } from '../auth';
import { useLive } from '../live';
import { centsToDollars } from '../lib';
import { FeeLineItem, Job } from '../types';

/**
 * Money page — deliberately framed as ROI, not cost: what QuickieFix-sourced
 * work is WORTH to the company (est. labour value from on-site hours × their
 * rate card) against the flat platform fees.
 */
export function CompanyBilling() {
  const { company } = useAuth();
  const cid = company?.id ?? '';
  const feesLive = useLive<FeeLineItem>(`companyFees:${cid}`, () => companyFeesQuery(cid));
  const jobsLive = useLive<Job>(`companyJobs:${cid}`, () => companyJobsQuery(cid));
  const loading = !feesLive || !jobsLive;

  const fees = useMemo(
    () => [...(feesLive ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [feesLive],
  );
  const jobs = useMemo(
    () => (jobsLive ?? []).filter((x) => x.status === 'completed'),
    [jobsLive],
  );

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  // Estimated labour value: on-site time × the company hourly rate (+ callout
  // per job) — an honest proxy for what the sourced work is worth.
  const hourly = company?.rateCard?.hourlyRateCents ?? 0;
  const callout = company?.rateCard?.calloutFeeCents ?? 0;
  const labourCents = jobs.reduce((sum, j) => {
    const t = j.timestamps;
    const hrs = t.completedAt && t.onSiteAt ? (t.completedAt - t.onSiteAt) / 3_600_000 : 0;
    return sum + Math.round(hrs * hourly) + callout;
  }, 0);
  const feeCents = fees
    .filter((f) => f.status !== 'waived_credit')
    .reduce((s, f) => s + f.amountCents + f.gstCents, 0);
  const waived = fees.filter((f) => f.status === 'waived_credit').length;

  // Group fees by month for the run-sheet table.
  const months = [...new Set(fees.map((f) => f.monthKey))].sort().reverse();

  return (
    <>
      <section className="co-band">
        <div className="co-kpi-grid">
          {[
            { label: 'Est. labour value generated', value: labourCents ? centsToDollars(labourCents) : '—' },
            { label: 'Platform fees (all time)', value: centsToDollars(feeCents) },
            { label: 'Fee-free jobs (credits)', value: String(waived) },
            { label: 'Shared credits left', value: String(company?.sharedCredits ?? 0) },
          ].map((k) => (
            <div className="co-kpi" key={k.label}>
              <div className="co-kpi-label">{k.label}</div>
              <div className="co-kpi-value">{k.value}</div>
            </div>
          ))}
        </div>
      </section>

      {labourCents > 0 && feeCents > 0 && (
        <div className="co-card" style={{ marginBottom: 16, background: '#F0FBF5', borderColor: '#bfe8d2' }}>
          <div style={{ fontWeight: 700 }}>
            💡 QuickieFix work has been worth roughly {centsToDollars(labourCents)} in billable labour
            to {company?.name} — for {centsToDollars(feeCents)} in platform fees.
          </div>
          <p className="co-sub" style={{ fontSize: 13, marginTop: 4 }}>
            Estimated from on-site hours × your rate card. Fees are flat per completed job, invoiced
            monthly — never a percentage of your work.
          </p>
        </div>
      )}

      <div className="co-card flush">
        <div className="co-card-head">
          <span className="co-card-title">Fee ledger</span>
        </div>
        {fees.length === 0 ? (
          <div className="co-empty">
            <div className="co-empty-title">No fees yet</div>
            <div className="co-empty-sub">
              A flat fee per completed job lands here — free credits burn first.
            </div>
          </div>
        ) : (
          <table className="co-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Tradie</th>
                <th>Trade</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {months.flatMap((m) =>
                fees
                  .filter((f) => f.monthKey === m)
                  .map((f) => (
                    <tr key={f.id}>
                      <td className="co-num">{f.monthKey}</td>
                      <td>{f.tradieName}</td>
                      <td className="co-sub">{f.trade.replace(/_/g, ' ')}</td>
                      <td className="co-num-cell">
                        {f.status === 'waived_credit' ? '—' : centsToDollars(f.amountCents + f.gstCents)}
                      </td>
                      <td>
                        <span
                          className={`co-chip ${
                            f.status === 'paid'
                              ? 'co-chip-green'
                              : f.status === 'waived_credit'
                                ? 'co-chip-grey'
                                : 'co-chip-amber'
                          }`}
                        >
                          {f.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
