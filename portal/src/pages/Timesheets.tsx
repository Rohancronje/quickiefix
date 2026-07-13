import { useEffect, useState } from 'react';
import { listCompanyJobs, listCompanyTradies } from '../api';
import { useAuth } from '../auth';
import { formatDate, formatDuration } from '../lib';
import { Job, Tradie, tradeLabel } from '../types';

interface Row {
  tradie: Tradie;
  job: Job;
}

// Session cache — instant render on revisit, background refresh.
const sheetCache = new Map<string, Row[]>();

/** Company-wide timesheets: every completed job across the roster, exportable
 *  as CSV for payroll / invoicing runs. */
export function Timesheets() {
  const { company } = useAuth();
  const cached = company ? sheetCache.get(company.id) : undefined;
  const [rows, setRows] = useState<Row[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!company) return;
    (async () => {
      // Two parallel queries: the roster + every company job in one shot.
      const [tradies, jobs] = await Promise.all([
        listCompanyTradies(company.id),
        listCompanyJobs(company.id),
      ]);
      const byId = new Map(tradies.map((t) => [t.id, t]));
      const all: Row[] = [];
      for (const job of jobs) {
        if (job.status !== 'completed' || !job.tradieId) continue;
        const tradie = byId.get(job.tradieId);
        if (tradie) all.push({ tradie, job });
      }
      all.sort((a, b) => (b.job.timestamps.completedAt ?? 0) - (a.job.timestamps.completedAt ?? 0));
      sheetCache.set(company.id, all);
      setRows(all);
      setLoading(false);
    })();
  }, [company]);

  const minutes = (a?: number, b?: number) => (a && b ? Math.round((a - b) / 60000) : '');

  const exportCsv = () => {
    const header = [
      'Tradie',
      'Engagement',
      'Customer',
      'Address',
      'Trade',
      'Completed',
      'On site (min)',
      'Total (min)',
      'Rating',
    ];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [header.join(',')];
    for (const { tradie, job } of rows) {
      const t = job.timestamps;
      lines.push(
        [
          `${tradie.firstName} ${tradie.lastName}`,
          tradie.engagement ?? 'employee',
          job.customerName,
          job.location.address,
          tradeLabel(job.trade),
          t.completedAt ? formatDate(t.completedAt) : '',
          String(minutes(t.completedAt, t.onSiteAt)),
          String(minutes(t.completedAt, t.acceptedAt)),
          job.customerRating ? String(job.customerRating.stars) : '',
        ]
          .map((v) => esc(String(v)))
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `quickiefix-timesheets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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
            Completed jobs ({rows.length})
          </span>
          <button className="co-btn co-btn-primary co-btn-sm" disabled={rows.length === 0} onClick={exportCsv}>
            ⬇ Export as CSV
          </button>
        </div>
        {rows.length === 0 ? (
          <div className="co-empty">
            <div className="co-empty-title">No completed jobs yet</div>
            <div className="co-empty-sub">
              Every job your team completes lands here, ready to export for payroll and invoicing.
            </div>
          </div>
        ) : (
          <table className="co-table">
            <thead>
              <tr>
                <th>Tradie</th>
                <th>Customer</th>
                <th>Trade</th>
                <th>Address</th>
                <th>Completed</th>
                <th>On site</th>
                <th>Total</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tradie, job }) => {
                const t = job.timestamps;
                return (
                  <tr key={job.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {tradie.firstName} {tradie.lastName}
                      </div>
                      {tradie.engagement === 'contractor' && (
                        <span className="co-chip co-chip-blue">contractor</span>
                      )}
                    </td>
                    <td>{job.customerName}</td>
                    <td>{tradeLabel(job.trade)}</td>
                    <td className="co-sub">{job.location.address}</td>
                    <td>{t.completedAt ? formatDate(t.completedAt) : '—'}</td>
                    <td className="co-num-cell">
                      {t.completedAt && t.onSiteAt ? formatDuration(t.completedAt - t.onSiteAt) : '—'}
                    </td>
                    <td className="co-num-cell">
                      {t.completedAt && t.acceptedAt ? formatDuration(t.completedAt - t.acceptedAt) : '—'}
                    </td>
                    <td>{job.customerRating ? `${job.customerRating.stars}★` : '—'}</td>
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
