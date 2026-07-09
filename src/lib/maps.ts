/**
 * Open a job location in the device's native maps app.
 * Android `geo:` shows the app chooser (Google Maps / Waze / etc.); iOS opens
 * Apple Maps (users who prefer Google Maps/Waze get it via the web fallback if
 * the scheme fails). Web falls back to Google Maps in a new tab.
 */
import { Linking, Platform } from 'react-native';
import { Location } from '../types';

export function openInMaps(loc: Location): void {
  const q = encodeURIComponent(loc.address);
  const ll = loc.latitude != null && loc.longitude != null ? `${loc.latitude},${loc.longitude}` : null;
  const web = `https://www.google.com/maps/search/?api=1&query=${ll ?? q}`;
  const url =
    Platform.OS === 'ios'
      ? `maps:0,0?q=${q}${ll ? `&ll=${ll}` : ''}`
      : Platform.OS === 'android'
        ? `geo:0,0?q=${ll ? `${ll}(${q})` : q}`
        : web;
  Linking.openURL(url).catch(() => {
    Linking.openURL(web).catch(() => {
      /* nothing else we can do */
    });
  });
}
