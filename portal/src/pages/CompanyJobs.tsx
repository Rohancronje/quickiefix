import { useMemo, useState } from 'react';
import { companyJobsQuery, companyTradiesQuery } from '../api';
import { useAuth } from '../auth';
import { useLive } from '../live';
import { formatDate } from '../lib';
import { Job, Tradie, tradeLabel } from '../types';

const FILTERS = ['All', 'Live', 'Completed', 'Cancelled'] as const;
type Filter = (typeof FILTERS)[number];
const LIVE = ['searching', 'confirmed', 'travelling', 'on_site'];

const STATUS_CHIP: Record<string, string> = {
  searching: 'co-chip-amber',
  confirmed: 'co-chip-blue',
  travelling: 'co-chip-blue',
  on_site: 'co-chip-blue',
  completed: 'co-chip-green',
  cancelled: 'co-chip-grey',
  no_tradie_found: 'co-chip-amber',
};

/** The company's live job board — who's on what, right now. Genuinely live:
 *  status changes stream in as tradies accept, travel, arrive and complete. */
export function CompanyJobs() {
  const { company } = useAuth();
  const cid = company?.id ?? '';
  const jobsLive = useLive<Job>(`companyJobs:${cid}`, () => companyJobsQuery(cid));
  const tradiesLive = useLive<Tradie>(`companyTradies:${cid}`, () => companyTradiesQuery(cid));
  const [filter, setFilter] = useState<Filter>('All');
  const loading = !jobsLive || !tradiesLive;

  const jobs = useMemo(
    () =>
      [...(jobsLive ?? [])].sort(
        (a, b) => b.timestamps.createdAt - a.timestamps.createdAt,
      ),
    [jobsLive],
  );
  const tradies = tradiesLive ?? [];

  const byId = new Map(tradies.map((t) => [t.id, t]));
  const filtered = jobs.filter((j) =>
    filter === 'All'
      ? true
      : filter === 'Live'
        ? LIVE.includes(j.status)
        : filter === 'Completed'
          ? j.status === 'completed'
          : j.status === 'cancelled',
  );
  const liveCount = jobs.filter((j) => LIVE.includes(j.status)).length;

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <section className="co-band">
      <div className="co-card flush">
        <div className="co-card-head">
          <span className="co-card-title">
            Job board {liveCount > 0 ? `· ${liveCount} live now` : ''}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`co-btn co-btn-sm ${filter === f ? 'co-btn-primary' : 'co-btn-ghost'}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="co-empty">
            <div className="co-empty-title">Nothing here</div>
            <div className="co-empty-sub">
              Jobs your tradies take appear the moment they accept.
            </div>
          </div>
        ) : (
          <table className="co-table">
            <thead>
              <tr>
                <th>Tradie</th>
                <th>Trade</th>
                <th>Customer</th>
                <th>Where</th>
                <th>Raised</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const t = j.tradieId ? byId.get(j.tradieId) : undefined;
                return (
                  <tr key={j.id}>
                    <td style={{ fontWeight: 600 }}>
                      {t ? `${t.firstName} ${t.lastName}` : (j.tradieName ?? '—')}
                    </td>
                    <td>{tradeLabel(j.trade)}</td>
                    <td>{j.customerName}</td>
                    <td className="co-sub">{j.location.address}</td>
                    <td>{formatDate(j.timestamps.createdAt)}</td>
                    <td>
                      <span className={`co-chip ${STATUS_CHIP[j.status] ?? 'co-chip-grey'}`}>
                        {j.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
