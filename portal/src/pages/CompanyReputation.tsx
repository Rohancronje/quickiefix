import { useMemo, useState } from 'react';
import { companyJobsQuery, companyTradiesQuery } from '../api';
import { useAuth } from '../auth';
import { useLive } from '../live';
import { formatDate, stars } from '../lib';
import { Job, Tradie, tradeLabel } from '../types';

/**
 * Reputation: every customer review across the team, in one place — with
 * copy-to-share so five-star reviews become marketing material in one click.
 */
export function CompanyReputation() {
  const { company } = useAuth();
  const cid = company?.id ?? '';
  const jobsLive = useLive<Job>(`companyJobs:${cid}`, () => companyJobsQuery(cid));
  const tradiesLive = useLive<Tradie>(`companyTradies:${cid}`, () => companyTradiesQuery(cid));
  const [copied, setCopied] = useState<string | null>(null);
  const loading = !jobsLive || !tradiesLive;

  const jobs = useMemo(
    () =>
      (jobsLive ?? [])
        .filter((x) => x.customerRating)
        .sort(
          (a, b) => (b.timestamps.completedAt ?? 0) - (a.timestamps.completedAt ?? 0),
        ),
    [jobsLive],
  );
  const tradies = tradiesLive ?? [];

  const byId = new Map(tradies.map((t) => [t.id, t]));
  const avg =
    jobs.length > 0
      ? Math.round((jobs.reduce((s, j) => s + (j.customerRating?.stars ?? 0), 0) / jobs.length) * 10) / 10
      : 0;
  const fiveStars = jobs.filter((j) => j.customerRating?.stars === 5).length;

  const share = async (j: Job) => {
    const r = j.customerRating!;
    const text = `⭐ ${'★'.repeat(r.stars)} — "${r.review || r.tags.join(', ')}" — ${j.customerName}, ${tradeLabel(j.trade)} job with ${company?.name} via QuickieFix`;
    await navigator.clipboard.writeText(text);
    setCopied(j.id);
    setTimeout(() => setCopied(null), 1600);
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <section className="co-band">
        <div className="co-kpi-grid">
          {[
            { label: 'Average rating', value: avg ? `${avg} ★` : '—' },
            { label: 'Total reviews', value: String(jobs.length) },
            { label: '5-star reviews', value: String(fiveStars) },
            {
              label: '5-star rate',
              value: jobs.length ? `${Math.round((fiveStars / jobs.length) * 100)}%` : '—',
            },
          ].map((k) => (
            <div className="co-kpi" key={k.label}>
              <div className="co-kpi-label">{k.label}</div>
              <div className="co-kpi-value">{k.value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="co-card">
        <div className="co-sectionhead">Customer reviews</div>
        {jobs.length === 0 ? (
          <p className="co-sub" style={{ fontSize: 13 }}>
            Reviews arrive as your team completes jobs — your best marketing, written by customers.
          </p>
        ) : (
          jobs.map((j) => {
            const r = j.customerRating!;
            const t = j.tradieId ? byId.get(j.tradieId) : undefined;
            return (
              <div key={j.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="co-stars" style={{ fontSize: 15 }}>{stars(r.stars)}</span>
                  <span style={{ fontWeight: 600 }}>{j.customerName}</span>
                  <span className="co-sub" style={{ fontSize: 12 }}>
                    {tradeLabel(j.trade)}
                    {t ? ` · ${t.firstName} ${t.lastName}` : ''} · {formatDate(r.at)}
                  </span>
                  <button
                    className="co-btn co-btn-ghost co-btn-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => share(j)}
                  >
                    {copied === j.id ? 'Copied ✓' : '📋 Copy to share'}
                  </button>
                </div>
                {r.review && <p style={{ fontSize: 14, margin: '6px 0 2px' }}>"{r.review}"</p>}
                {r.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {r.tags.map((tag) => (
                      <span key={tag} className="co-chip co-chip-grey">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
