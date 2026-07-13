import { tradeMeta } from '../constants';
import { Job, TimesheetRow } from '../types';
import { formatDateTime } from './format';

/** Derive a timesheet row from a completed (or in-progress) job. */
export function toTimesheetRow(job: Job): TimesheetRow {
  const { acceptedAt, onSiteAt, completedAt } = job.timestamps;
  return {
    jobId: job.id,
    customerName: job.customerName,
    address: job.location.address,
    trade: job.trade,
    companyName: job.companyName, // "contracted to" — who the tradie bills
    status: job.status,
    acceptedAt,
    startedAt: onSiteAt,
    completedAt,
    totalDurationMs: acceptedAt && completedAt ? completedAt - acceptedAt : undefined,
    workingDurationMs: onSiteAt && completedAt ? completedAt - onSiteAt : undefined,
    stars: job.customerRating?.stars,
  };
}

const CSV_HEADERS = [
  'Job ID',
  'Customer',
  'Address',
  'Trade',
  'Contracted to',
  'Status',
  'Accepted',
  'Started',
  'Completed',
  'Total (min)',
  'Working (min)',
  'Rating',
];

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Build a CSV timesheet export from a set of jobs. */
export function jobsToCsv(jobs: Job[]): string {
  const rows = jobs.map(toTimesheetRow);
  const lines = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.jobId,
        r.customerName,
        r.address,
        tradeMeta(r.trade).label,
        r.companyName ?? '',
        r.status,
        formatDateTime(r.acceptedAt),
        formatDateTime(r.startedAt),
        formatDateTime(r.completedAt),
        r.totalDurationMs != null ? Math.round(r.totalDurationMs / 60000).toString() : '',
        r.workingDurationMs != null ? Math.round(r.workingDurationMs / 60000).toString() : '',
        r.stars != null ? r.stars.toString() : '',
      ]
        .map((v) => csvEscape(String(v)))
        .join(','),
    );
  }
  return lines.join('\n');
}
