/** Company-tag helpers (Pilot Spec §6.2). */

/** Unclaimed tag codes expire 14 days after issue. */
export const TAG_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** A short, human-friendly single-use tag code, e.g. "QF-7K2P9M". */
export function genTagCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `QF-${s}`;
}
