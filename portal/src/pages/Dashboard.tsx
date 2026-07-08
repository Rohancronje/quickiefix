import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeStats, getTradieJobs, listCompanyTradies } from '../api';
import { useAuth } from '../auth';
import { formatDuration, initials, stars } from '../lib';
import { Tradie, TradieStats, tradeLabel } from '../types';

interface Row {
  tradie: Tradie;
  stats: TradieStats;
}

export function Dashboard() {
  const { company } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const tradies = await listCompanyTradies(company.id);
      const rows = await Promise.all(
        tradies.map(async (tradie) => ({
          tradie,
          stats: computeStats(await getTradieJobs(tradie.id)),
        })),
      );
      rows.sort((a, b) => b.stats.completedJobs - a.stats.completedJobs);
      setRows(rows);
      setLoading(false);
    })();
  }, [company]);

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

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div className="grid stat-grid">
        <div className="stat">
          <div className="v">{rows.length}</div>
          <div className="l">Tradies</div>
        </div>
        <div className="stat">
          <div className="v">{totalJobs}</div>
          <div className="l">Completed jobs</div>
        </div>
        <div className="stat">
          <div className="v">{avgRating || '—'}</div>
          <div className="l">Avg rating</div>
        </div>
        <div className="stat">
          <div className="v">{formatDuration(totalOnSite)}</div>
          <div className="l">Time on site</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="between" style={{ padding: '18px 22px' }}>
          <div className="section-title" style={{ margin: 0 }}>
            Team performance
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => nav('/team')}>
            + Add tradies
          </button>
        </div>
        {rows.length === 0 ? (
          <div className="empty">
            <div className="e-ico">🧰</div>
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>No tradies yet</p>
            <p>Invite your tradies from the “My Tradies” page to see their performance here.</p>
          </div>
        ) : (
          <table>
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
                <tr key={tradie.id} className="row-link" onClick={() => nav(`/tradie/${tradie.id}`)}>
                  <td>
                    <div className="flex">
                      <div className="avatar">{initials(tradie.firstName, tradie.lastName)}</div>
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {tradie.firstName} {tradie.lastName}
                        </div>
                        <div className="faint" style={{ fontSize: 12 }}>
                          {tradie.businessName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{tradeLabel(tradie.primaryTrade)}</td>
                  <td style={{ fontWeight: 700 }}>{stats.completedJobs}</td>
                  <td>
                    {stats.ratingCount ? (
                      <span>
                        <span className="stars">{stars(stats.ratingAvg)}</span>{' '}
                        <span className="faint">{stats.ratingAvg}</span>
                      </span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>{formatDuration(stats.totalOnSiteMs)}</td>
                  <td>
                    {tradie.approval === 'approved' ? (
                      <span className="badge badge-green">Approved</span>
                    ) : (
                      <span className="badge badge-amber">{tradie.approval}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
