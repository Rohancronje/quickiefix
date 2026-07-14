import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { companyJobsQuery, companyTagsQuery, companyTradiesQuery, computeStats } from '../api';
import { useAuth } from '../auth';
import {
  IconArrowRight,
  IconCheck,
  IconClock,
  IconMetrics,
  IconTradies,
} from '../backoffice/icons';
import { useLive } from '../live';
import { formatDuration, initials, stars } from '../lib';
import { CompanyTag, Job, Tradie, TradieStats, tradeLabel } from '../types';

interface Row {
  tradie: Tradie;
  stats: TradieStats;
}

export function Dashboard() {
  const { company } = useAuth();
  const nav = useNavigate();
  const cid = company?.id ?? '';

  // Live listeners: instant paint from the local cache, and every change
  // (job completed, seat removed, tradie confirmed) streams in by itself.
  const users = useLive<Tradie>(`companyTradies:${cid}`, () => companyTradiesQuery(cid));
  const tags = useLive<CompanyTag>(`companyTags:${cid}`, () => companyTagsQuery(cid));
  const jobs = useLive<Job>(`companyJobs:${cid}`, () => companyJobsQuery(cid));
  const loading = !users || !tags || !jobs;

  const rows = useMemo<Row[]>(() => {
    if (!users || !jobs) return [];
    const byTradie = new Map<string, Job[]>();
    for (const j of jobs) {
      if (!j.tradieId) continue;
      byTradie.set(j.tradieId, [...(byTradie.get(j.tradieId) ?? []), j]);
    }
    const next = users
      .filter((t) => t.role === 'tradie')
      .map((tradie) => ({ tradie, stats: computeStats(byTradie.get(tradie.id) ?? []) }));
    next.sort((a, b) => b.stats.completedJobs - a.stats.completedJobs);
    return next;
  }, [users, jobs]);

  // A seat you've issued counts as "tradie added" — validation is
  // QuickieFix's job, and the checklist shouldn't stall on our queue.
  const seatsIssued = useMemo(
    () => (tags ?? []).filter((t) => t.status !== 'removed').length,
    [tags],
  );

  const totalJobs = rows.reduce((s, r) => s + r.stats.completedJobs, 0);
  const totalOnSite = rows.reduce((s, r) => s + r.stats.totalOnSiteMs, 0);
  const rated = rows.filter((r) => r.stats.ratingCount > 0);
  const avgRating = rated.length
    ? Math.round((rated.reduce((s, r) => s + r.stats.ratingAvg, 0) / rated.length) * 10) / 10
    : 0;

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  const kpis = [
    { label: 'Tradies', value: String(rows.length), Icon: IconTradies },
    { label: 'Completed jobs', value: String(totalJobs), Icon: IconCheck },
    { label: 'Avg rating', value: avgRating ? String(avgRating) : '—', Icon: IconMetrics },
    { label: 'Time on site', value: formatDuration(totalOnSite), Icon: IconClock },
  ];

  // Activation checklist: a brand-new company sees a path to first value, not
  // four dead zeros. The metrics dashboard unlocks on the first completed job.
  const hasRateCard = company?.rateCard?.hourlyRateCents != null;
  const steps = [
    { label: 'Create company account', done: true },
    {
      label: 'Add your first tradie',
      sub: 'Invite pros so jobs can be routed to your team',
      done: rows.length > 0 || seatsIssued > 0,
      action: { label: 'Add tradie', to: '/team' },
    },
    {
      label: 'Set your rate card',
      sub: 'Required to go live — customers see these rates',
      done: hasRateCard,
      action: { label: 'Set rates', to: '/settings' },
    },
    {
      label: 'Land your first job',
      sub: 'Your tradies just go Available in the app — dispatch does the rest',
      done: totalJobs > 0,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const currentIdx = steps.findIndex((s) => !s.done);
  const activated = totalJobs > 0;

  return (
    <>
      {activated ? (
        <section className="co-band">
          <div className="co-kpi-grid">
            {kpis.map((k) => (
              <div className="co-kpi" key={k.label}>
                <span className="co-kpi-chip">
                  <k.Icon size={16} />
                </span>
                <div className="co-kpi-label">{k.label}</div>
                <div className="co-kpi-value">{k.value}</div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="co-band">
          <div className="co-card">
            <div className="co-setup-head">
              <span className="co-card-title">Get your team live</span>
              <span className="co-setup-count">{doneCount} of 4 done</span>
            </div>
            <div className="co-setup-bar">
              <div className="co-setup-bar-fill" style={{ width: `${(doneCount / 4) * 100}%` }} />
            </div>
            <div className="co-setup-steps">
              {steps.map((s, i) => (
                <div
                  key={s.label}
                  className={`co-setup-step ${s.done ? 'done' : ''} ${i === currentIdx ? 'current' : ''}`}
                >
                  <span className={`co-setup-num ${s.done ? 'done' : ''} ${i === currentIdx ? 'current' : ''}`}>
                    {s.done ? <IconCheck size={13} /> : i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className={`co-setup-label ${s.done ? 'done' : ''}`}>{s.label}</div>
                    {i === currentIdx && s.sub && <div className="co-setup-sub">{s.sub}</div>}
                  </div>
                  {i === currentIdx && s.action && (
                    <button className="co-btn co-btn-dark co-btn-sm" onClick={() => nav(s.action.to)}>
                      {s.action.label} <IconArrowRight size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="co-setup-foot">
              {seatsIssued > 0 && rows.length === 0
                ? 'Seat issued — once your tradie claims the code and QuickieFix validates it, they join your roster automatically. '
                : ''}
              Your performance dashboard unlocks the moment your first job completes.
            </div>
          </div>
        </section>
      )}

      <section className="co-band">
        <div className="co-card flush">
          <div className="co-card-head">
            <span className="co-card-title">Team performance</span>
            <button className="co-btn co-btn-primary co-btn-sm" onClick={() => nav('/team')}>
              Add tradies
            </button>
          </div>
          {rows.length === 0 ? (
            <div className="co-empty">
              <span className="co-empty-ico">
                <IconTradies size={28} />
              </span>
              <div className="co-empty-title">No tradies yet</div>
              <div className="co-empty-sub">
                Invite your tradies from the My Tradies page to see their performance here.
              </div>
              <button className="co-empty-action" onClick={() => nav('/team')}>
                Add tradies <IconArrowRight size={14} />
              </button>
            </div>
          ) : (
            <table className="co-table">
              <thead>
                <tr>
                  <th>Tradie</th>
                  <th>Trade</th>
                  <th>Jobs</th>
                  <th>Rating</th>
                  <th>Time on site</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ tradie, stats }) => (
                  <tr
                    key={tradie.id}
                    className="co-rowlink"
                    onClick={() => nav(`/tradie/${tradie.id}`)}
                  >
                    <td>
                      <div className="co-idcell">
                        <div className="co-avatar">{initials(tradie.firstName, tradie.lastName)}</div>
                        <div>
                          <div className="co-idcell-name">
                            {tradie.firstName} {tradie.lastName}
                          </div>
                          <div className="co-idcell-sub">{tradie.businessName}</div>
                        </div>
                      </div>
                    </td>
                    <td>{tradeLabel(tradie.primaryTrade)}</td>
                    <td className="co-num-cell" style={{ fontWeight: 600 }}>
                      {stats.completedJobs}
                    </td>
                    <td>
                      {stats.ratingCount ? (
                        <span>
                          <span className="co-stars">{stars(stats.ratingAvg)}</span>{' '}
                          <span className="co-sub co-num">{stats.ratingAvg}</span>
                        </span>
                      ) : (
                        <span className="co-sub">—</span>
                      )}
                    </td>
                    <td className="co-num-cell">{formatDuration(stats.totalOnSiteMs)}</td>
                    <td>
                      {tradie.approval === 'approved' ? (
                        <span className="co-chip co-chip-green">Approved</span>
                      ) : (
                        <span className="co-chip co-chip-amber">{tradie.approval}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
