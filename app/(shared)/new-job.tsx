import { appAlert } from '../../src/components/AppAlert';
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
import { AddressField } from '../../src/components/AddressField';
import { Button, Chip, Field, Txt } from '../../src/components/ui';
import { formatMoney, TRADES } from '../../src/constants';
import { useAuth } from '../../src/context/AuthContext';
import { useAgency, useAgencyPanel, useAvailableTradies, useLandlordProperties, useTenantProperties } from '../../src/hooks/useData';
import { isOnPanel } from '../../src/lib/panel';
import { getCurrentLocation } from '../../src/lib/location';
import { backend } from '../../src/services';
import { colors, font, radius, spacing } from '../../src/theme';
import { AssignmentMode, Location, TradeCategory } from '../../src/types';

const STEPS = ['Service', 'Details', 'Location', 'Review'];

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
  // Future bookings are off the menu — QuickieFix is about help NOW.
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

  // Agency-managed property: the requester chooses WHO PAYS. Agency pays
  // (default) → panel-only dispatch, rates hidden, agency billed. Customer
  // pays → normal open-market job with rates shown.
  const selectedProperty = properties.find((p) => p.id === propertyId);
  const isManagedProperty = selectedProperty?.agencyId != null;
  const [payer, setPayer] = useState<'agency' | 'customer'>('agency');
  const isAgencyJob = isManagedProperty && payer === 'agency';
  // Changing property resets the payer choice to the default (agency pays).
  useEffect(() => {
    setPayer('agency');
  }, [propertyId]);
  const panel = useAgencyPanel(isAgencyJob ? selectedProperty?.agencyId : undefined);
  // Billing contact for the read-only card when the agency pays.
  const billingAgency = useAgency(isAgencyJob ? selectedProperty?.agencyId : undefined);

  // Live match preview for the final step: who's actually available for this
  // trade near this address, right now. Panel-filtered for managed properties.
  const openPreview = useAvailableTradies(step === 3 ? trade ?? undefined : undefined, jobLocation);
  const preview = isAgencyJob
    ? panel
      ? openPreview.filter((c) => isOnPanel(c.tradie, panel))
      : []
    : openPreview;
  const nearestPro = preview[0];
  const nearestEta =
    nearestPro && coords ? nearestPro.etaMinutes : undefined; // ETA needs real coordinates
  const cheapestCallout = preview.reduce<number | null>(
    (min, c) =>
      c.tradie.rateCard?.calloutFeeCents != null && (min == null || c.tradie.rateCard.calloutFeeCents < min)
        ? c.tradie.rateCard.calloutFeeCents
        : min,
    null,
  );
  const cheapestHourly = preview.reduce<number | null>(
    (min, c) =>
      c.tradie.rateCard?.hourlyRateCents != null && (min == null || c.tradie.rateCard.hourlyRateCents < min)
        ? c.tradie.rateCard.hourlyRateCents
        : min,
    null,
  );
  const previewFromPrice =
    cheapestCallout != null
      ? { label: 'Call-out from', value: formatMoney(cheapestCallout) }
      : cheapestHourly != null
        ? { label: 'Hourly from', value: `${formatMoney(cheapestHourly)}/hr` }
        : null;

  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return !!trade;
      case 1:
        return description.trim().length >= 5;
      case 2:
        return address.trim().length > 0;
      case 3:
        return true;
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
          urgency: 'now',
          isEmergency,
          assignmentMode: effectiveMode,
          propertyId: propertyId ?? undefined,
          // Only meaningful at managed properties: who pays for the work.
          payer: isManagedProperty ? payer : undefined,
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
    appAlert(
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
                  {/* Managed properties first: repairs there are the agency's
                      responsibility — panel tradies, agency terms. */}
                  {properties.some((p) => p.agencyId) && (
                    <Txt variant="caption" color={colors.textMuted}>
                      🏢 Use my managed property
                    </Txt>
                  )}
                  {properties
                    .filter((p) => p.agencyId)
                    .map((p) => (
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
                        <Txt style={{ fontSize: 22 }}>🏢</Txt>
                        <View style={{ flex: 1 }}>
                          <Txt variant="label">{p.label || p.address}</Txt>
                          <Txt variant="caption" color={colors.textMuted}>
                            Managed by {p.agencyName ?? p.landlordName} · their approved tradies
                            handle it
                          </Txt>
                        </View>
                      </Pressable>
                    ))}
                  {properties.some((p) => !p.agencyId) && (
                    <Txt variant="caption" color={colors.textMuted}>
                      For one of your properties?
                    </Txt>
                  )}
                  {properties
                    .filter((p) => !p.agencyId)
                    .map((p) => (
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
              <AddressField
                label="Address"
                placeholder="12 Queen Street, Auckland"
                value={address}
                onChangeText={(t) => {
                  setAddress(t);
                  setCoords(null);
                  setPropertyId(null);
                }}
                onSelect={(r) => {
                  setAddress(r.address);
                  setCoords(
                    r.latitude != null && r.longitude != null
                      ? { latitude: r.latitude, longitude: r.longitude }
                      : null,
                  );
                  setPropertyId(null);
                }}
              />
              {coords && (
                <Txt variant="caption" color={colors.success}>
                  ✓ Location pinned — tradies see exact distance
                </Txt>
              )}
            </Step>
          )}

          {step === 3 && (
            <Step title="Ready to go — how do you want to match?">
              {/* Managed property: the requester decides who pays. Agency pays
                  → panel job on agency terms; customer pays → open market. */}
              {isManagedProperty && (
                <View style={{ gap: spacing.sm }}>
                  <Txt variant="label">Who's paying for this job?</Txt>
                  <Pressable
                    style={[styles.option, payer === 'agency' && styles.optionActive]}
                    onPress={() => setPayer('agency')}
                  >
                    <Txt style={{ fontSize: 24 }}>🏢</Txt>
                    <View style={{ flex: 1 }}>
                      <Txt variant="label">
                        {selectedProperty?.agencyName ?? 'My property manager'} pays
                      </Txt>
                      <Txt variant="caption" color={colors.textMuted}>
                        Goes to their approved tradies — costs covered by their agreement.
                      </Txt>
                    </View>
                  </Pressable>
                  <Pressable
                    style={[styles.option, payer === 'customer' && styles.optionActive]}
                    onPress={() => setPayer('customer')}
                  >
                    <Txt style={{ fontSize: 24 }}>👤</Txt>
                    <View style={{ flex: 1 }}>
                      <Txt variant="label">I'll pay myself</Txt>
                      <Txt variant="caption" color={colors.textMuted}>
                        Choose from all available tradies — rates shown upfront, you pay the
                        tradie directly.
                      </Txt>
                    </View>
                  </Pressable>
                </View>
              )}

              {/* Agency pays: panel-only preview, no rates, locked billing. */}
              {isAgencyJob && (
                <View style={[styles.previewCard, { backgroundColor: colors.infoSoft }]}>
                  <Txt variant="label" color={colors.blue}>
                    🏢 {selectedProperty?.label || selectedProperty?.address}
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted}>
                    Managed by {selectedProperty?.agencyName ?? 'your property agency'} — only
                    their approved tradies get this request. Rates are covered by the agency's
                    agreement.
                  </Txt>
                  {/* Billing contact is the agency — fixed, not editable. */}
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: colors.line,
                      paddingTop: spacing.sm,
                      gap: 2,
                    }}
                  >
                    <Txt variant="caption" color={colors.textMuted}>
                      Billing contact (set by the property manager)
                    </Txt>
                    <Txt variant="label">
                      {billingAgency?.name ?? selectedProperty?.agencyName ?? 'Property manager'}
                    </Txt>
                    {billingAgency?.adminEmail && (
                      <Txt variant="caption" color={colors.textMuted}>
                        {billingAgency.adminEmail} · 🔒 can't be changed
                      </Txt>
                    )}
                  </View>
                  {preview.length > 0 ? (
                    <Txt variant="caption" color={colors.success}>
                      ✅ {preview.length} approved {preview.length === 1 ? 'tradie' : 'tradies'}{' '}
                      available now
                      {nearestEta != null ? ` · nearest ~${nearestEta} min away` : ''}
                    </Txt>
                  ) : (
                    <Txt variant="caption" color={colors.textMuted}>
                      None of the approved tradies are online right now — your request still goes
                      out and they're notified the moment they're back.
                    </Txt>
                  )}
                </View>
              )}

              {/* Live proof before commit: ETA, from-price and the nearest
                  matched pro — no more blind "find me a tradie". */}
              {!isAgencyJob && preview.length > 0 && (
                <View style={styles.previewCard}>
                  <Txt variant="label" color={colors.success}>
                    ✅ {preview.length} verified {preview.length === 1 ? 'pro' : 'pros'} available now
                  </Txt>
                  <View style={styles.previewStats}>
                    {nearestEta != null && (
                      <View style={{ flex: 1 }}>
                        <Txt variant="caption" color={colors.textMuted}>
                          Nearest arrives in
                        </Txt>
                        <Txt variant="heading">~{nearestEta} min</Txt>
                      </View>
                    )}
                    {previewFromPrice && (
                      <View style={{ flex: 1 }}>
                        <Txt variant="caption" color={colors.textMuted}>
                          {previewFromPrice.label}
                        </Txt>
                        <Txt variant="heading">{previewFromPrice.value}</Txt>
                      </View>
                    )}
                  </View>
                  {nearestPro && (
                    <Txt variant="caption" color={colors.textMuted}>
                      {nearestPro.tradie.businessName}
                      {nearestPro.tradie.ratingCount > 0
                        ? ` · ⭐ ${nearestPro.tradie.ratingAvg.toFixed(1)} (${nearestPro.tradie.ratingCount})`
                        : ''}
                      {` · ${nearestPro.tradie.completedJobs} jobs`}
                      {nearestPro.tradie.qualifications.length > 0 ? ' · ✓ Licensed' : ''}
                    </Txt>
                  )}
                  <Txt variant="caption" color={colors.textFaint}>
                    Rates lock in upfront — no quotes, no surprises.
                  </Txt>
                </View>
              )}

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

              {/* Emergency flag — jumps the search queue (and can't be scheduled). */}
              <Pressable
                style={[styles.emergency, isEmergency && styles.emergencyActive]}
                onPress={() => setIsEmergency(!isEmergency)}
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
                  : nearestEta != null
                    ? `Find me a tradie · ~${nearestEta} min`
                    : 'Find me a tradie'
                : canNext()
                  ? 'Continue'
                  : ['Pick a trade to continue', 'Add a few details to continue', 'Enter the job address'][step]
            }
            icon={step === STEPS.length - 1 && canNext() ? (effectiveMode === 'choose' ? '👀' : '⚡') : undefined}
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  previewCard: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  previewStats: { flexDirection: 'row', gap: spacing.lg },
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
