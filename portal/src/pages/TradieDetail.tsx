import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { computeStats, getTradie, getTradieJobs } from '../api';
import { formatDate, formatDuration, initials, stars } from '../lib';
import { Job, Tradie, TradieStats, tradeLabel } from '../types';

export function TradieDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [tradie, setTradie] = useState<Tradie | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<TradieStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [t, j] = await Promise.all([getTradie(id), getTradieJobs(id)]);
      setTradie(t);
      setJobs(j);
      setStats(computeStats(j));
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }
  if (!tradie || !stats) {
    return (
      <div className="card">
        <p>Tradie not found.</p>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => nav('/team')}>
          ← Back
        </button>
      </div>
    );
  }

  const completed = jobs.filter((j) => j.status === 'completed');
  const reviews = completed.filter((j) => j.customerRating?.review || (j.customerRating?.tags?.length ?? 0) > 0);

  return (
    <div className="grid" style={{ gap: 24 }}>
      <a className="faint" style={{ cursor: 'pointer', fontWeight: 600 }} onClick={() => nav('/team')}>
        ← Back to tradies
      </a>

      {/* Header */}
      <div className="card">
        <div className="flex" style={{ gap: 16 }}>
          <div className="avatar" style={{ width: 60, height: 60, fontSize: 22 }}>
            {initials(tradie.firstName, tradie.lastName)}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800 }}>
              {tradie.firstName} {tradie.lastName}
            </h2>
            <p className="muted">
              {tradie.businessName} · {tradeLabel(tradie.primaryTrade)} · {tradie.yearsExperience} yrs
            </p>
          </div>
          {tradie.approval === 'approved' ? (
            <span className="badge badge-green">✓ Approved</span>
          ) : (
            <span className="badge badge-amber">{tradie.approval}</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid stat-grid">
        <div className="stat">
          <div className="v">{stats.completedJobs}</div>
          <div className="l">Completed jobs</div>
        </div>
        <div className="stat">
          <div className="v">
            {stats.ratingCount ? (
              <>
                {stats.ratingAvg} <span className="stars" style={{ fontSize: 20 }}>★</span>
              </>
            ) : (
              '—'
            )}
          </div>
          <div className="l">{stats.ratingCount} reviews</div>
        </div>
        <div className="stat">
          <div className="v">{formatDuration(stats.totalOnSiteMs)}</div>
          <div className="l">Total time on site</div>
        </div>
        <div className="stat">
          <div className="v">{formatDuration(stats.totalDurationMs)}</div>
          <div className="l">Total job time</div>
        </div>
      </div>

      {/* Job history (timesheet) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="section-title" style={{ padding: '18px 22px', margin: 0 }}>
          Job history
        </div>
        {completed.length === 0 ? (
          <div className="empty">
            <div className="e-ico">📋</div>
            <p>No completed jobs yet.</p>
          </div>
        ) : (
          <table>
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
                  <td className="faint">{j.location.address}</td>
                  <td>{formatDate(j.timestamps.completedAt)}</td>
                  <td>
                    {formatDuration(
                      j.timestamps.completedAt && j.timestamps.onSiteAt
                        ? j.timestamps.completedAt - j.timestamps.onSiteAt
                        : undefined,
                    )}
                  </td>
                  <td>
                    {j.customerRating ? (
                      <span className="stars">{stars(j.customerRating.stars)}</span>
                    ) : (
                      <span className="faint">—</span>
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
        <div className="card">
          <div className="section-title">Customer reviews</div>
          <div className="grid" style={{ gap: 12 }}>
            {reviews.map((j) => (
              <div
                key={j.id}
                style={{ borderLeft: '3px solid var(--amber)', paddingLeft: 14, paddingBlock: 4 }}
              >
                <div className="between">
                  <span className="stars">{stars(j.customerRating!.stars)}</span>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {j.customerName} · {formatDate(j.timestamps.completedAt)}
                  </span>
                </div>
                {j.customerRating!.review && (
                  <p style={{ margin: '6px 0', fontSize: 14 }}>“{j.customerRating!.review}”</p>
                )}
                <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {j.customerRating!.tags.map((t) => (
                    <span key={t} className="badge badge-gray">
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
