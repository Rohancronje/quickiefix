import * as Location from 'expo-location';
import { GeoPoint, Location as LocationType } from '../types';

export interface CurrentLocation extends GeoPoint {
  address: string;
}

/** Request permission and resolve the device's current location + address. */
export async function getCurrentLocation(): Promise<CurrentLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission was denied.');
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const point: GeoPoint = {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  };
  const address = await reverseGeocode(point);
  return { ...point, address };
}

/** Best-effort reverse geocode to a human-readable address. */
export async function reverseGeocode(point: GeoPoint): Promise<string> {
  try {
    const [place] = await Location.reverseGeocodeAsync(point);
    if (!place) return coordsLabel(point);
    const parts = [
      [place.streetNumber, place.street].filter(Boolean).join(' '),
      place.city ?? place.subregion,
      place.region,
    ].filter(Boolean);
    return parts.join(', ') || coordsLabel(point);
  } catch {
    return coordsLabel(point);
  }
}

export function coordsLabel(point: GeoPoint): string {
  return `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
}

/**
 * Watch the device position and invoke `onUpdate` with each fix. Returns a
 * promise resolving to a stop function. Used for on-site arrival detection.
 */
export async function watchPosition(
  onUpdate: (point: GeoPoint) => void,
): Promise<() => void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission was denied.');

  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 4000 },
    (pos) => onUpdate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
  );
  return () => sub.remove();
}

export function hasCoords(loc: LocationType): loc is LocationType & GeoPoint {
  return loc.latitude != null && loc.longitude != null;
}
