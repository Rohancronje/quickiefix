import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, Field, Txt } from '../../src/components/ui';
import { TRADES } from '../../src/constants';
import { useAuth } from '../../src/context/AuthContext';
import { useLandlordProperties, useTenantProperties } from '../../src/hooks/useData';
import { getCurrentLocation } from '../../src/lib/location';
import { backend } from '../../src/services';
import { colors, font, radius, spacing } from '../../src/theme';
import { AssignmentMode, Location, TradeCategory, UrgencyType } from '../../src/types';

const STEPS = ['Service', 'Details', 'Location', 'When'];

export default function NewJob() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ trade?: string }>();

  const preTrade = TRADES.find((t) => t.key === params.trade)?.key ?? null;
  const [step, setStep] = useState(preTrade ? 1 : 0);
  const [trade, setTrade] = useState<TradeCategory | null>(preTrade);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [urgency, setUrgency] = useState<UrgencyType>('now');
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('auto');
  const [isEmergency, setIsEmergency] = useState(false);
  // Emergencies can't wait to browse — force auto-assign.
  const effectiveMode: AssignmentMode = isEmergency ? 'auto' : assignmentMode;
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Properties the requester owns or rents — a job can be attached to one.
  const owned = useLandlordProperties(user?.id);
  const rented = useTenantProperties(user?.id);
  const properties = [...owned, ...rented].filter(
    (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
  );

  const jobLocation: Location = {
    address: address.trim(),
    latitude: coords?.latitude,
    longitude: coords?.longitude,
  };

  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return !!trade;
      case 1:
        return description.trim().length >= 5;
      case 2:
        return address.trim().length > 0;
      default:
        return true;
    }
  };

  const MAX_PHOTOS = 4;

  const pickPhotos = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: MAX_PHOTOS - photos.length,
      });
      if (!res.canceled) {
        setPhotos((p) => [...p, ...res.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!res.canceled && res.assets[0]) {
        setPhotos((p) => [...p, res.assets[0].uri].slice(0, MAX_PHOTOS));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removePhoto = (uri: string) => setPhotos((p) => p.filter((u) => u !== uri));

  const useMyLocation = async () => {
    setError(null);
    try {
      setLocating(true);
      const loc = await getCurrentLocation();
      setAddress(loc.address);
      setCoords({ latitude: loc.latitude, longitude: loc.longitude });
      setPropertyId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!user) return;
    try {
      setSubmitting(true);
      const job = await backend.createJob(
        { id: user.id, name: `${user.firstName} ${user.lastName}` },
        {
          trade: trade!,
          description: description.trim(),
          photos,
          location: jobLocation,
          urgency,
          isEmergency,
          assignmentMode: effectiveMode,
          propertyId: propertyId ?? undefined,
        },
      );
      router.replace({ pathname: '/track/[id]', params: { id: job.id } });
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  };

  // Warn before abandoning a partly-filled request. "Dirty" = the user has made
  // a real choice worth protecting (not just landed on the screen).
  const dirty =
    !!trade || description.trim().length > 0 || address.trim().length > 0 || photos.length > 0;
  const confirmLeave = () => {
    Alert.alert(
      'Discard this request?',
      "You haven't submitted this request yet — leaving now will discard what you've entered.",
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard request', style: 'destructive', onPress: () => router.back() },
      ],
    );
  };

  /** Shared back logic for the header chevron and the Android hardware button. */
  const goBack = (): boolean => {
    if (submitting) return true; // don't let them bail mid-submit
    if (step > 0) {
      setStep(step - 1);
      return true;
    }
    if (dirty) {
      confirmLeave();
      return true;
    }
    return false; // nothing entered → just leave
  };
  const back = () => {
    if (!goBack()) router.back();
  };

  // Intercept the Android hardware back button with the same guard.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, dirty, submitting]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header + progress */}
        <View style={styles.header}>
          <Pressable onPress={back} hitSlop={10}>
            <Txt style={styles.back}>‹</Txt>
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt variant="label">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </Txt>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <Step title="What kind of help do you need?">
              <View style={styles.chips}>
                {TRADES.map((t) => (
                  <Chip
                    key={t.key}
                    label={t.label}
                    emoji={t.emoji}
                    selected={trade === t.key}
                    onPress={() => setTrade(t.key)}
                  />
                ))}
              </View>
            </Step>
          )}

          {step === 1 && (
            <Step title="Describe the issue" subtitle="The more detail, the faster the right tradie can help.">
              <Field
                placeholder="e.g. My hot water cylinder is leaking in the garage."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={5}
                style={{ height: 130, textAlignVertical: 'top' }}
              />

              {/* Photos — a picture of the problem beats a paragraph. */}
              <View style={{ gap: spacing.sm }}>
                <Txt variant="caption" color={colors.textMuted}>
                  Add photos of the problem (optional, up to {MAX_PHOTOS})
                </Txt>
                {photos.length > 0 && (
                  <View style={styles.photoRow}>
                    {photos.map((uri) => (
                      <View key={uri} style={styles.photoWrap}>
                        <Image source={{ uri }} style={styles.photoThumb} />
                        <Pressable style={styles.photoRemove} onPress={() => removePhoto(uri)} hitSlop={8}>
                          <Txt style={{ color: colors.white, fontWeight: '800', fontSize: 12 }}>✕</Txt>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
                {photos.length < MAX_PHOTOS && (
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Button title="📷 Camera" kind="secondary" small onPress={takePhoto} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button title="🖼️ Gallery" kind="secondary" small onPress={pickPhotos} />
                    </View>
                  </View>
                )}
              </View>
            </Step>
          )}

          {step === 2 && (
            <Step title="Where's the job?">
              {properties.length > 0 && (
                <View style={{ gap: spacing.sm }}>
                  <Txt variant="caption" color={colors.textMuted}>
                    For one of your properties?
                  </Txt>
                  {properties.map((p) => (
                    <Pressable
                      key={p.id}
                      style={[styles.option, propertyId === p.id && styles.optionActive]}
                      onPress={() => {
                        setPropertyId(p.id);
                        setAddress(p.address);
                        setCoords(
                          p.latitude != null && p.longitude != null
                            ? { latitude: p.latitude, longitude: p.longitude }
                            : null,
                        );
                      }}
                    >
                      <Txt style={{ fontSize: 22 }}>🏠</Txt>
                      <View style={{ flex: 1 }}>
                        <Txt variant="label">{p.label || p.address}</Txt>
                        <Txt variant="caption" color={colors.textMuted}>
                          {p.landlordId === user?.id ? 'Your property' : `Managed by ${p.landlordName}`}
                        </Txt>
                      </View>
                    </Pressable>
                  ))}
                  <View style={styles.orRow}>
                    <View style={styles.orLine} />
                    <Txt variant="caption" color={colors.textFaint}>
                      or a different location
                    </Txt>
                    <View style={styles.orLine} />
                  </View>
                </View>
              )}
              <Button
                title={locating ? 'Locating…' : 'Use my current location'}
                icon="📍"
                kind="secondary"
                loading={locating}
                onPress={useMyLocation}
              />
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Txt variant="caption" color={colors.textFaint}>
                  or enter manually
                </Txt>
                <View style={styles.orLine} />
              </View>
              <Field
                label="Address"
                placeholder="12 Queen Street, Auckland"
                value={address}
                onChangeText={(t) => {
                  setAddress(t);
                  setCoords(null);
                  setPropertyId(null);
                }}
              />
              {coords && (
                <Txt variant="caption" color={colors.success}>
                  ✓ GPS location captured
                </Txt>
              )}
            </Step>
          )}

          {step === 3 && (
            <Step title="When do you need this done?">
              <Pressable
                style={[styles.option, urgency === 'now' && styles.optionActive]}
                onPress={() => setUrgency('now')}
              >
                <Txt style={{ fontSize: 26 }}>⚡</Txt>
                <View style={{ flex: 1 }}>
                  <Txt variant="label">Help now</Txt>
                  <Txt variant="caption" color={colors.textMuted}>
                    Dispatch the nearest available tradie immediately.
                  </Txt>
                </View>
              </Pressable>
              <Pressable
                style={[styles.option, urgency === 'scheduled' && styles.optionActive]}
                onPress={() => setUrgency('scheduled')}
              >
                <Txt style={{ fontSize: 26 }}>🗓️</Txt>
                <View style={{ flex: 1 }}>
                  <Txt variant="label">Schedule for later</Txt>
                  <Txt variant="caption" color={colors.textMuted}>
                    Line up a tradie for a time that suits you.
                  </Txt>
                </View>
              </Pressable>

              {/* How to match — auto-dispatch vs browse & choose. */}
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <Txt variant="label">How do you want to match?</Txt>
                <Pressable
                  style={[styles.option, effectiveMode === 'auto' && styles.optionActive]}
                  onPress={() => setAssignmentMode('auto')}
                >
                  <Txt style={{ fontSize: 26 }}>⚡</Txt>
                  <View style={{ flex: 1 }}>
                    <Txt variant="label">Auto-assign</Txt>
                    <Txt variant="caption" color={colors.textMuted}>
                      We alert nearby pros and the first to accept takes it. Fastest.
                    </Txt>
                  </View>
                </Pressable>
                <Pressable
                  style={[
                    styles.option,
                    effectiveMode === 'choose' && styles.optionActive,
                    isEmergency && { opacity: 0.5 },
                  ]}
                  disabled={isEmergency}
                  onPress={() => setAssignmentMode('choose')}
                >
                  <Txt style={{ fontSize: 26 }}>👀</Txt>
                  <View style={{ flex: 1 }}>
                    <Txt variant="label">Browse &amp; choose</Txt>
                    <Txt variant="caption" color={colors.textMuted}>
                      See available pros — compare rate, rating &amp; distance — and pick your own.
                    </Txt>
                  </View>
                </Pressable>
                {isEmergency && (
                  <Txt variant="caption" color={colors.textFaint}>
                    Emergencies are auto-assigned for speed.
                  </Txt>
                )}
              </View>

              {/* Emergency flag — auto-confirms fast and jumps the search queue. */}
              <Pressable
                style={[styles.emergency, isEmergency && styles.emergencyActive]}
                onPress={() => setIsEmergency((v) => !v)}
              >
                <Txt style={{ fontSize: 22 }}>{isEmergency ? '🚨' : '⚠️'}</Txt>
                <View style={{ flex: 1 }}>
                  <Txt variant="label" color={isEmergency ? colors.danger : colors.text}>
                    This is an emergency
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted}>
                    Gas leak, no power, flooding or a lockout. If anyone is in danger, call 111 first.
                  </Txt>
                </View>
                <View style={[styles.checkbox, isEmergency && styles.checkboxOn]}>
                  {isEmergency && <Txt style={{ color: colors.white, fontWeight: '800' }}>✓</Txt>}
                </View>
              </Pressable>

              {/* Danger-to-life safety screen: 111 first (Pilot Spec §7). */}
              {isEmergency && (
                <View style={styles.safety}>
                  <Txt variant="label" color={colors.white}>
                    ⚠️ Is anyone in danger?
                  </Txt>
                  <Txt variant="caption" color={colors.onNavyMuted}>
                    QuickieFix is not an emergency service. If there's a fire, gas leak with a smell
                    of gas, risk of electrocution, or any danger to life — call 111 first.
                  </Txt>
                  <Button
                    title="Call 111 now"
                    icon="📞"
                    kind="danger"
                    small
                    onPress={() => Linking.openURL('tel:111')}
                  />
                </View>
              )}
            </Step>
          )}

          {error && <Txt style={styles.error}>{error}</Txt>}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={
              step === STEPS.length - 1
                ? effectiveMode === 'choose'
                  ? 'Browse tradies'
                  : 'Find me a tradie'
                : 'Continue'
            }
            icon={step === STEPS.length - 1 ? (effectiveMode === 'choose' ? '👀' : '⚡') : undefined}
            disabled={!canNext()}
            loading={submitting}
            onPress={next}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Txt variant="title">{title}</Txt>
        {subtitle && (
          <Txt variant="body" color={colors.textMuted}>
            {subtitle}
          </Txt>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  back: { fontSize: 34, color: colors.text, lineHeight: 34 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.amber },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  orLine: { flex: 1, height: 1, backgroundColor: colors.line },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.line,
  },
  optionActive: { borderColor: colors.amber, backgroundColor: colors.warningSoft },
  emergency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.line,
    marginTop: spacing.sm,
  },
  emergencyActive: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  safety: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  error: { color: colors.danger, fontSize: font.size.sm, fontWeight: '600' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoWrap: { position: 'relative' },
  photoThumb: { width: 76, height: 76, borderRadius: radius.md },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
});
