import { WAVE } from '../src/constants';
import {
  hadNoCandidates,
  isSearchExhausted,
  rankCandidates,
  shouldAutoConfirm,
  waveEligible,
  waveSize,
} from '../src/lib/dispatch';
import { makeCandidate, makeJob } from './factories';

describe('rankCandidates', () => {
  it('orders by proximity first', () => {
    const ids = rankCandidates([
      makeCandidate({ id: 'far' }, 10),
      makeCandidate({ id: 'near' }, 1),
      makeCandidate({ id: 'mid' }, 5),
    ]);
    expect(ids).toEqual(['near', 'mid', 'far']);
  });

  it('breaks distance ties by rating', () => {
    const ids = rankCandidates([
      makeCandidate({ id: 'low', ratingAvg: 3.0 }, 2),
      makeCandidate({ id: 'high', ratingAvg: 4.9 }, 2),
    ]);
    expect(ids).toEqual(['high', 'low']);
  });
});

describe('waveSize', () => {
  it('widens over time', () => {
    expect(waveSize(0)).toBe(WAVE.firstCount);
    expect(waveSize(WAVE.widenAt1Ms)).toBe(WAVE.secondCount);
    expect(waveSize(WAVE.widenAt2Ms)).toBe(Infinity);
  });
});

describe('waveEligible', () => {
  const job = makeJob({ dispatch: { candidateIds: ['a', 'b', 'c', 'd', 'e'], startedAt: 0 } });

  it('includes only candidates within the current wave', () => {
    // At t=0 the wave is the first 3.
    expect(waveEligible(job, 'a', 0)).toBe(true);
    expect(waveEligible(job, 'd', 0)).toBe(false);
    // After the first widen, 'd' (index 3) is now in.
    expect(waveEligible(job, 'd', WAVE.widenAt1Ms)).toBe(true);
  });

  it('excludes tradies who declined', () => {
    const declined = makeJob({
      dispatch: { candidateIds: ['a'], startedAt: 0 },
      declinedBy: ['a'],
    });
    expect(waveEligible(declined, 'a', 0)).toBe(false);
  });

  it('is false for non-searching jobs', () => {
    expect(waveEligible(makeJob({ status: 'confirmed' }), 'a', 0)).toBe(false);
  });
});

describe('isSearchExhausted', () => {
  it('fails fast (30s) when the pool was empty', () => {
    const job = makeJob({ dispatch: { candidateIds: [], startedAt: 0 } });
    expect(isSearchExhausted(job, WAVE.noCandidatesTimeoutMs - 1)).toBe(false);
    expect(isSearchExhausted(job, WAVE.noCandidatesTimeoutMs)).toBe(true);
  });

  it('runs the full sequence (240s) when there were candidates', () => {
    const job = makeJob({ dispatch: { candidateIds: ['a'], startedAt: 0 } });
    expect(isSearchExhausted(job, WAVE.noCandidatesTimeoutMs)).toBe(false);
    expect(isSearchExhausted(job, WAVE.noTradieAfterMs)).toBe(true);
  });
});

describe('hadNoCandidates', () => {
  it('detects an empty candidate pool', () => {
    expect(hadNoCandidates(makeJob({ dispatch: { candidateIds: [], startedAt: 0 } }))).toBe(true);
    expect(hadNoCandidates(makeJob({ dispatch: { candidateIds: ['a'], startedAt: 0 } }))).toBe(false);
  });
});

describe('shouldAutoConfirm', () => {
  it('only auto-confirms emergencies past their window', () => {
    const base = { status: 'accepted' as const, timestamps: { createdAt: 0, acceptedAt: 0 } };
    expect(shouldAutoConfirm(makeJob({ ...base, isEmergency: false }), 1e9)).toBe(false);
    expect(shouldAutoConfirm(makeJob({ ...base, isEmergency: true }), 0)).toBe(false);
    expect(shouldAutoConfirm(makeJob({ ...base, isEmergency: true }), 1e9)).toBe(true);
  });
});
