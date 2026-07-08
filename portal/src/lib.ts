export function initials(first: string, last: string): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

export function formatDuration(ms?: number): string {
  if (!ms) return '0m';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

export function stars(n: number): string {
  const full = Math.round(n);
  return '★★★★★☆☆☆☆☆'.slice(5 - full, 10 - full);
}
