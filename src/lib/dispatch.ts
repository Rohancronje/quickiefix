/**
 * Wave-dispatch logic (Pilot Spec §4).
 *
 * The tricky part of wave dispatch is that "am I in the first 3 / first 8 /
 * all?" needs a *global* ranking, which a single tradie's device can't compute
 * alone. So the ranked candidate pool is snapshotted into the job at creation
 * (`job.dispatch.candidateIds`). Wave membership then becomes a pure function of
 * a tradie's index in that list and the elapsed time — evaluated identically on
 * every device, no server timer required to widen the search.
 */
import { WAVE } from '../constants';
import { Job, Tradie } from '../types';
import { TradieCandidate } from '../services/backend';

/** Response rate = jobs accepted / jobs offered (0 when never offered). */
function responseRate(t: Tradie): number {
  return t.jobsOffered > 0 ? t.jobsAccepted / t.jobsOffered : 0;
}

/**
 * Rank eligible candidates into dispatch order: proximity, then rating, then
 * response rate. Never price (Pilot Spec §4). Returns tradie ids in order.
 */
export function rankCandidates(candidates: TradieCandidate[]): string[] {
  return [...candidates]
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm ||
        b.tradie.ratingAvg - a.tradie.ratingAvg ||
        responseRate(b.tradie) - responseRate(a.tradie),
    )
    .map((c) => c.tradie.id);
}

/** How many candidates are being pinged right now, given elapsed time. */
export function waveSize(elapsedMs: number): number {
  if (elapsedMs >= WAVE.widenAt2Ms) return Infinity;
  if (elapsedMs >= WAVE.widenAt1Ms) return WAVE.secondCount;
  return WAVE.firstCount;
}

/**
 * Is this tradie currently in the active wave for this searching job?
 * Defensive against legacy jobs created before wave dispatch (no dispatch
 * snapshot) — those simply match no one through this path.
 */
export function waveEligible(job: Job, tradieId: string, now: number): boolean {
  if (job.status !== 'searching') return false;
  const candidateIds = job.dispatch?.candidateIds ?? [];
  const idx = candidateIds.indexOf(tradieId);
  if (idx < 0) return false;
  if (job.declinedBy.includes(tradieId)) return false;
  const startedAt = job.dispatch?.startedAt ?? job.timestamps.searchingAt ?? job.timestamps.createdAt;
  return idx < waveSize(now - startedAt);
}

/** Has a searching job timed out? Empty pool fails fast (30s); otherwise it
 *  runs the full wave sequence before giving up. */
export function isSearchExhausted(job: Job, now: number): boolean {
  if (job.status !== 'searching') return false;
  const startedAt = job.dispatch?.startedAt ?? job.timestamps.searchingAt ?? job.timestamps.createdAt;
  const noCandidates = (job.dispatch?.candidateIds?.length ?? 0) === 0;
  const threshold = noCandidates ? WAVE.noCandidatesTimeoutMs : WAVE.noTradieAfterMs;
  return now - startedAt >= threshold;
}

/** True when the job never had any matching tradie in its area. */
export function hadNoCandidates(job: Job): boolean {
  return (job.dispatch?.candidateIds?.length ?? 0) === 0;
}

/** Should an accepted job auto-advance to confirmed (emergency window passed)? */
export function shouldAutoConfirm(job: Job, now: number): boolean {
  if (job.status !== 'accepted' || !job.isEmergency) return false;
  const acceptedAt = job.timestamps.acceptedAt;
  return acceptedAt != null && now - acceptedAt >= WAVE.emergencyAutoConfirmMs;
}

/** A friendly line describing the current search stage, for the customer. */
export function searchStageLabel(job: Job, now: number): string {
  const startedAt = job.dispatch?.startedAt ?? job.timestamps.searchingAt ?? job.timestamps.createdAt;
  const elapsed = now - startedAt;
  if (elapsed >= WAVE.widenAt2Ms) return 'Reaching every nearby pro…';
  if (elapsed >= WAVE.widenAt1Ms) return 'Widening the search…';
  return 'Alerting the closest pros…';
}
