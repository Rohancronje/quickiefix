import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { computeStats, getTradie, getTradieJobs } from '../api';
import { IconArrowRight, IconCheck, IconClock, IconJobs, IconMetrics } from '../backoffice/icons';
import { formatDate, formatDuration, initials, stars } from '../lib';
import { Job, Tradie, TradieStats, tradeLabel } from '../types';

export function TradieDetail() {
  const { id } = useParams<{ id: string }>();
  const { company } = useAuth();
  const nav = useNavigate();
  const [tradie, setTradie] = useState<Tradie | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<TradieStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !company) return;
    (async () => {
      setLoading(true);
      const [t, j] = await Promise.all([getTradie(id), getTradieJobs(id, company.id)]);
      setTradie(t);
      setJobs(j);
      setStats(computeStats(j));
      setLoading(false);
    })();
  }, [id, company]);

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }
  if (!tradie || !stats) {
    return (
      <div className="co-card">
        <p style={{ marginBottom: 12 }}>Tradie not found.</p>
        <button className="co-btn co-btn-ghost co-btn-sm" onClick={() => nav('/team')}>
          Back
        </button>
      </div>
    );
  }

  const completed = jobs.filter((j) => j.status === 'completed');
  const reviews = completed.filter(
    (j) => j.customerRating?.review || (j.customerRating?.tags?.length ?? 0) > 0,
  );

  const kpis = [
    { label: 'Completed jobs', value: String(stats.completedJobs), Icon: IconCheck },
    {
      label: `${stats.ratingCount} reviews`,
      value: stats.ratingCount ? String(stats.ratingAvg) : '—',
      Icon: IconMetrics,
    },
    { label: 'Total time on site', value: formatDuration(stats.totalOnSiteMs), Icon: IconClock },
    { label: 'Total job time', value: formatDuration(stats.totalDurationMs), Icon: IconClock },
  ];

  return (
    <div className="co-stack">
      <button className="co-back" onClick={() => nav('/team')}>
        <IconArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back to tradies
      </button>

      {/* Header */}
      <div className="co-card">
        <div className="co-detail-head">
          <div className="co-avatar" style={{ width: 56, height: 56, fontSize: 20 }}>
            {initials(tradie.firstName, tradie.lastName)}
          </div>
          <div style={{ flex: 1 }}>
            <div className="co-detail-name">
              {tradie.firstName} {tradie.lastName}
            </div>
            <div className="co-detail-sub">
              {tradie.businessName} · {tradeLabel(tradie.primaryTrade)} · {tradie.yearsExperience} yrs
            </div>
          </div>
          {tradie.approval === 'approved' ? (
            <span className="co-chip co-chip-green">
              <IconCheck size={13} /> Approved
            </span>
          ) : (
            <span className="co-chip co-chip-amber">{tradie.approval}</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="co-kpi-grid">
        {kpis.map((k) => (
          <div className="co-kpi" key={k.label}>
            <span className="co-kpi-chip">
              <k.Icon size={16} />
            </span>
            <div className="co-kpi-label">{k.label}</div>
            <div className="co-kpi-value">
              {k.value}
              {k.label.endsWith('reviews') && stats.ratingCount ? (
                <span className="co-stars" style={{ fontSize: 18, marginLeft: 6 }}>
                  ★
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Job history (timesheet) */}
      <div className="co-card flush">
        <div className="co-card-head plain">
          <span className="co-card-title">Job history</span>
        </div>
        {completed.length === 0 ? (
          <div className="co-empty">
            <span className="co-empty-ico">
              <IconJobs size={28} />
            </span>
            <div className="co-empty-title">No completed jobs yet</div>
            <div className="co-empty-sub">
              Completed jobs and their timesheets will appear here.
            </div>
          </div>
        ) : (
          <table className="co-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Address</th>
                <th>Completed</th>
                <th>On site</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((j) => (
                <tr key={j.id}>
                  <td style={{ fontWeight: 600 }}>{j.customerName}</td>
                  <td className="co-sub">{j.location.address}</td>
                  <td className="co-num-cell">{formatDate(j.timestamps.completedAt)}</td>
                  <td className="co-num-cell">
                    {formatDuration(
                      j.timestamps.completedAt && j.timestamps.onSiteAt
                        ? j.timestamps.completedAt - j.timestamps.onSiteAt
                        : undefined,
                    )}
                  </td>
                  <td>
                    {j.customerRating ? (
                      <span className="co-stars">{stars(j.customerRating.stars)}</span>
                    ) : (
                      <span className="co-sub">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="co-card">
          <div className="co-sectionhead">Customer reviews</div>
          <div className="co-stack" style={{ gap: 14 }}>
            {reviews.map((j) => (
              <div key={j.id} className="co-review">
                <div className="co-between">
                  <span className="co-stars">{stars(j.customerRating!.stars)}</span>
                  <span className="co-sub" style={{ fontSize: 12 }}>
                    {j.customerName} · {formatDate(j.timestamps.completedAt)}
                  </span>
                </div>
                {j.customerRating!.review && (
                  <p className="co-review-body">“{j.customerRating!.review}”</p>
                )}
                <div className="co-flex" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {j.customerRating!.tags.map((t) => (
                    <span key={t} className="co-chip co-chip-grey">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
