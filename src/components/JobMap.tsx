/**
 * Small embedded map showing the job location. react-native-maps is a NATIVE
 * library: on binaries built without it (or without coordinates) this renders
 * nothing, so it's OTA-safe everywhere. Tapping the map hands off to the
 * phone's real maps app for navigation.
 */
import Constants from 'expo-constants';
import React from 'react';
import { Platform, Pressable, StyleSheet, TurboModuleRegistry, View } from 'react-native';
import { openInMaps } from '../lib/maps';
import { colors, radius, spacing } from '../theme';
import { GeoPoint, Location } from '../types';
import { Txt } from './ui';

type RNMaps = typeof import('react-native-maps');

function maps(): RNMaps | null {
  try {
    // Android HARD-CRASHES a Google MapView when the API key is missing from
    // the manifest (an invalid key merely renders blank). Only render once a
    // key is actually configured in the build.
    if (Platform.OS === 'android') {
      const key = Constants.expoConfig?.android?.config?.googleMaps?.apiKey;
      if (!key) return null;
    }
    // The native TurboModule is only present in binaries built with the lib.
    if (!TurboModuleRegistry?.get?.('RNMapsAirModule')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-maps') as RNMaps;
  } catch {
    return null;
  }
}

export function JobMap({
  location,
  tradie,
}: {
  location: Location;
  /** Live tradie position (en route) — shown as a second marker, with the map
   *  framed to keep both the job and the moving dot in view (Uber-style). */
  tradie?: GeoPoint | null;
}) {
  const rnMaps = maps();
  if (!rnMaps || location.latitude == null || location.longitude == null) return null;

  const MapView = rnMaps.default;
  const { Marker } = rnMaps;
  const jobPoint = { latitude: location.latitude, longitude: location.longitude };
  // Frame the region: just the job pin, or both pins with padding when live.
  const region = tradie
    ? {
        latitude: (jobPoint.latitude + tradie.latitude) / 2,
        longitude: (jobPoint.longitude + tradie.longitude) / 2,
        latitudeDelta: Math.max(Math.abs(jobPoint.latitude - tradie.latitude) * 1.8, 0.01),
        longitudeDelta: Math.max(Math.abs(jobPoint.longitude - tradie.longitude) * 1.8, 0.01),
      }
    : { ...jobPoint, latitudeDelta: 0.01, longitudeDelta: 0.01 };

  return (
    <Pressable onPress={() => openInMaps(location)} accessibilityLabel="Open job location in maps">
      <View style={styles.wrap} pointerEvents="box-only">
        <MapView
          style={styles.map}
          // key remount when the live dot moves — region is initial-only.
          key={tradie ? `${tradie.latitude.toFixed(4)},${tradie.longitude.toFixed(4)}` : 'static'}
          initialRegion={region}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
        >
          <Marker coordinate={jobPoint} />
          {tradie && (
            <Marker
              coordinate={{ latitude: tradie.latitude, longitude: tradie.longitude }}
              pinColor="#FFB020"
              title="Your tradie"
            />
          )}
        </MapView>
        <View style={styles.hint}>
          <Txt variant="caption" color={colors.white} style={{ fontWeight: '700' }}>
            Tap to navigate ↗
          </Txt>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', height: 160 },
  map: StyleSheet.absoluteFill,
  hint: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(11,18,32,0.75)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
});
