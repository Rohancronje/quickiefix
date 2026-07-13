/**
 * Address input with Google Places autocomplete (via our server proxy — see
 * src/lib/places.ts). Falls back gracefully to a plain text field if the
 * lookup is unavailable: suggestions simply don't appear.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  AddressSuggestion,
  newSessionToken,
  resolveAddress,
  ResolvedAddress,
  suggestAddresses,
} from '../lib/places';
import { colors, radius, spacing } from '../theme';
import { Field, Txt } from './ui';

interface Props {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  /** A suggestion was picked and geocoded — address + coordinates. */
  onSelect: (resolved: ResolvedAddress) => void;
}

const DEBOUNCE_MS = 300;

export function AddressField({ label = 'Address', placeholder, value, onChangeText, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);
  const sessionRef = useRef(newSessionToken());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressRef = useRef(false); // don't re-query for the text we just picked

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleChange = (text: string) => {
    onChangeText(text);
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        setSuggestions(await suggestAddresses(text, sessionRef.current));
      } catch {
        setSuggestions([]); // lookup down — manual entry still works
      }
    }, DEBOUNCE_MS);
  };

  const pick = async (s: AddressSuggestion) => {
    if (resolving) return;
    setResolving(s.placeId);
    try {
      const resolved = await resolveAddress(s.placeId, sessionRef.current);
      suppressRef.current = true;
      setSuggestions([]);
      onSelect(resolved.address ? resolved : { ...resolved, address: s.text });
    } catch {
      // Details lookup failed — keep the picked text at least.
      suppressRef.current = true;
      setSuggestions([]);
      onSelect({ address: s.text, latitude: null, longitude: null });
    } finally {
      // One session per pick: token is spent once details are fetched.
      sessionRef.current = newSessionToken();
      setResolving(null);
    }
  };

  return (
    <View>
      <Field
        label={label}
        placeholder={placeholder}
        value={value}
        onChangeText={handleChange}
        autoCapitalize="words"
      />
      {suggestions.length > 0 && (
        <View style={styles.list}>
          {suggestions.map((s, i) => (
            <Pressable
              key={s.placeId}
              style={({ pressed }) => [
                styles.row,
                i < suggestions.length - 1 && styles.rowDivider,
                pressed && { backgroundColor: colors.infoSoft },
              ]}
              onPress={() => pick(s)}
            >
              <Txt style={{ fontSize: 15 }}>📍</Txt>
              <Txt variant="body" style={{ flex: 1 }} numberOfLines={2}>
                {resolving === s.placeId ? 'Locating…' : s.text}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
