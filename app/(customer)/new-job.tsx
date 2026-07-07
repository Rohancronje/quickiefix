import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, Field, Txt } from '../../src/components/ui';
import { TRADES } from '../../src/constants';
import { useCustomer } from '../../src/context/AuthContext';
import { getCurrentLocation } from '../../src/lib/location';
import { backend } from '../../src/services';
import { colors, font, radius, spacing } from '../../src/theme';
import { Location, TradeCategory, UrgencyType } from '../../src/types';

const STEPS = ['Service', 'Details', 'Photos', 'Location', 'When', 'Review'];

export default function NewJob() {
  const router = useRouter();
  const customer = useCustomer();
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return !!trade;
      case 1:
        return description.trim().length >= 5;
      case 3:
        return address.trim().length > 0;
      default:
        return true;
    }
  };

  const addPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo library permission was denied.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (!result.canceled) {
      setPhotos((cur) => [...cur, ...result.assets.map((a) => a.uri)].slice(0, 4));
    }
  };

  const useMyLocation = async () => {
    setError(null);
    try {
      setLocating(true);
      const loc = await getCurrentLocation();
      setAddress(loc.address);
      setCoords({ latitude: loc.latitude, longitude: loc.longitude });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    setError(null);
    const location: Location = {
      address: address.trim(),
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    };
    try {
      setSubmitting(true);
      const job = await backend.createJob(customer, {
        trade: trade!,
        description: description.trim(),
        photos,
        location,
        urgency,
      });
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
  const back = () => (step === 0 ? router.back() : setStep(step - 1));

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
            </Step>
          )}

          {step === 2 && (
            <Step title="Add photos" subtitle="Optional — but they really help.">
              <View style={styles.photoGrid}>
                {photos.map((uri) => (
                  <View key={uri} style={styles.photoWrap}>
                    <Image source={{ uri }} style={styles.photo} />
                    <Pressable
                      style={styles.photoRemove}
                      onPress={() => setPhotos((cur) => cur.filter((p) => p !== uri))}
                    >
                      <Txt style={{ color: colors.white, fontWeight: '700' }}>×</Txt>
                    </Pressable>
                  </View>
                ))}
                {photos.length < 4 && (
                  <Pressable style={styles.photoAdd} onPress={addPhoto}>
                    <Txt style={{ fontSize: 28 }}>＋</Txt>
                    <Txt variant="caption" color={colors.textMuted}>
                      Add
                    </Txt>
                  </Pressable>
                )}
              </View>
            </Step>
          )}

          {step === 3 && (
            <Step title="Where's the job?">
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
                }}
              />
              {coords && (
                <Txt variant="caption" color={colors.success}>
                  ✓ GPS location captured
                </Txt>
              )}
            </Step>
          )}

          {step === 4 && (
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
            </Step>
          )}

          {step === 5 && (
            <Step title="Review your request">
              <ReviewRow label="Service" value={TRADES.find((t) => t.key === trade)?.label ?? '—'} />
              <ReviewRow label="Description" value={description} />
              <ReviewRow label="Photos" value={photos.length ? `${photos.length} attached` : 'None'} />
              <ReviewRow label="Location" value={address || '—'} />
              <ReviewRow label="When" value={urgency === 'now' ? 'Help now' : 'Scheduled'} />
            </Step>
          )}

          {error && <Txt style={styles.error}>{error}</Txt>}
        </ScrollView>

        <View style={styles.footer}>
          {step === 2 && photos.length === 0 && (
            <Button title="Skip" kind="ghost" onPress={next} />
          )}
          <Button
            title={step === STEPS.length - 1 ? 'Submit request' : 'Continue'}
            icon={step === STEPS.length - 1 ? '🚀' : undefined}
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

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt variant="body" style={{ flex: 1, textAlign: 'right' }} numberOfLines={3}>
        {value}
      </Txt>
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
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photoWrap: { width: 96, height: 96 },
  photo: { width: 96, height: 96, borderRadius: radius.md },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  error: { color: colors.danger, fontSize: font.size.sm, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
});
