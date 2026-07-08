import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
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
import { Location, TradeCategory, UrgencyType } from '../../src/types';

// Photo attachments are a planned future release (needs Firebase Storage).
// Wave dispatch means the customer no longer picks a tradie — we auto-alert the
// nearest available pros and the first to accept wins.
const STEPS = ['Service', 'Details', 'Location', 'When'];

export default function NewJob() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ trade?: string }>();

  const preTrade = TRADES.find((t) => t.key === params.trade)?.key ?? null;
  const [step, setStep] = useState(preTrade ? 1 : 0);
  const [trade, setTrade] = useState<TradeCategory | null>(preTrade);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [urgency, setUrgency] = useState<UrgencyType>('now');
  const [isEmergency, setIsEmergency] = useState(false);
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
          photos: [],
          location: jobLocation,
          urgency,
          isEmergency,
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
            title={step === STEPS.length - 1 ? 'Find me a tradie' : 'Continue'}
            icon={step === STEPS.length - 1 ? '⚡' : undefined}
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
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
});
