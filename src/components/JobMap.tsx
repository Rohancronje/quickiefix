/**
 * Small embedded map showing the job location. react-native-maps is a NATIVE
 * library: on binaries built without it (or without coordinates) this renders
 * nothing, so it's OTA-safe everywhere. Tapping the map hands off to the
 * phone's real maps app for navigation.
 */
import React from 'react';
import { Pressable, StyleSheet, TurboModuleRegistry, View } from 'react-native';
import { openInMaps } from '../lib/maps';
import { colors, radius, spacing } from '../theme';
import { Location } from '../types';
import { Txt } from './ui';

type RNMaps = typeof import('react-native-maps');

function maps(): RNMaps | null {
  try {
    // The native TurboModule is only present in binaries built with the lib.
    if (!TurboModuleRegistry?.get?.('RNMapsAirModule')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-maps') as RNMaps;
  } catch {
    return null;
  }
}

export function JobMap({ location }: { location: Location }) {
  const rnMaps = maps();
  if (!rnMaps || location.latitude == null || location.longitude == null) return null;

  const MapView = rnMaps.default;
  const { Marker } = rnMaps;
  const region = {
    latitude: location.latitude,
    longitude: location.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  return (
    <Pressable onPress={() => openInMaps(location)} accessibilityLabel="Open job location in maps">
      <View style={styles.wrap} pointerEvents="box-only">
        <MapView
          style={styles.map}
          initialRegion={region}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
        >
          <Marker coordinate={{ latitude: location.latitude, longitude: location.longitude }} />
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
