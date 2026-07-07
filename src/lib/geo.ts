import { GeoPoint } from '../types';

const R = 6371; // Earth radius (km)

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points in kilometres (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Rough drive-time estimate at ~35 km/h urban average. */
export function estimateEtaMinutes(km: number): number {
  return Math.max(2, Math.round((km / 35) * 60));
}
