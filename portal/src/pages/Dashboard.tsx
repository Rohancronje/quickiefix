import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeStats, getTradieJobs, listCompanyTradies } from '../api';
import { useAuth } from '../auth';
import {
  IconArrowRight,
  IconCheck,
  IconClock,
  IconMetrics,
  IconTradies,
} from '../backoffice/icons';
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

  const kpis = [
    { label: 'Tradies', value: String(rows.length), Icon: IconTradies },
    { label: 'Completed jobs', value: String(totalJobs), Icon: IconCheck },
    { label: 'Avg rating', value: avgRating ? String(avgRating) : '—', Icon: IconMetrics },
    { label: 'Time on site', value: formatDuration(totalOnSite), Icon: IconClock },
  ];

  return (
    <>
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
