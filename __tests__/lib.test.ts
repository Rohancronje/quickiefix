import { formatMoney, gstOf } from '../src/constants';
import { distanceKm, estimateEtaMinutes, formatDistance } from '../src/lib/geo';
import { containsContactInfo, maskContactInfo } from '../src/lib/mask';

describe('geo', () => {
  it('distance between identical points is 0', () => {
    const p = { latitude: -36.79, longitude: 174.76 };
    expect(distanceKm(p, p)).toBe(0);
  });

  it('computes a plausible great-circle distance', () => {
    // Auckland CBD -> Takapuna is roughly 6-8 km.
    const km = distanceKm(
      { latitude: -36.8485, longitude: 174.7633 },
      { latitude: -36.7876, longitude: 174.7743 },
    );
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(9);
  });

  it('estimateEtaMinutes has a 2-minute floor and scales with distance', () => {
    expect(estimateEtaMinutes(0)).toBe(2);
    expect(estimateEtaMinutes(35)).toBe(60);
  });

  it('formatDistance switches units sensibly', () => {
    expect(formatDistance(0.5)).toBe('500 m');
    expect(formatDistance(5)).toBe('5.0 km');
    expect(formatDistance(15)).toBe('15 km');
  });
});

describe('contact masking', () => {
  it('redacts emails', () => {
    expect(maskContactInfo('email me at bob@example.com please')).not.toContain('bob@example.com');
  });

  it('redacts phone numbers', () => {
    const masked = maskContactInfo('call 021 555 1234');
    expect(masked).not.toContain('555');
    expect(masked).toContain('[contact hidden]');
  });

  it('redacts off-platform handles', () => {
    expect(maskContactInfo('add me on whatsapp @bob')).not.toContain('@bob');
  });

  it('leaves clean text untouched', () => {
    const clean = 'Please arrive before noon, the gate code is at the door.';
    expect(maskContactInfo(clean)).toBe(clean);
    expect(containsContactInfo(clean)).toBe(false);
  });

  it('flags text that contains contact info', () => {
    expect(containsContactInfo('ring me on 0215551234')).toBe(true);
  });
});

describe('money', () => {
  it('formats cents as dollars', () => {
    expect(formatMoney(1500)).toBe('$15.00');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('gstOf returns 0 while GST is disabled', () => {
    expect(gstOf(1500)).toBe(0);
  });
});
