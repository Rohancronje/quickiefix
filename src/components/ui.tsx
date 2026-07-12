import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewProps,
} from 'react-native';
import { colors, font, radius, shadow, spacing } from '../theme';

/* ----------------------------------------------------------------- Text --- */

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

const textStyles: Record<Variant, object> = {
  display: { fontSize: font.size.display, fontWeight: font.weight.heavy, color: colors.text },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: colors.text },
  heading: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  body: { fontSize: font.size.md, fontWeight: font.weight.regular, color: colors.text },
  label: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.text },
  caption: { fontSize: font.size.xs, fontWeight: font.weight.medium, color: colors.textMuted },
};

export function Txt({
  variant = 'body',
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  return (
    <Text
      // Respect the user's system font size, but cap the multiplier so large
      // accessibility fonts scale gracefully instead of exploding fixed layouts.
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[textStyles[variant], color ? { color } : null, style]}
    />
  );
}

/* ---------------------------------------------------------------- Button --- */

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

interface ButtonProps extends PressableProps {
  title: string;
  kind?: BtnKind;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: string;
  small?: boolean;
  /** Override the button's text/spinner colour (e.g. ghost buttons on dark). */
  textColor?: string;
}

export function Button({
  title,
  kind = 'primary',
  loading,
  fullWidth = true,
  icon,
  small,
  textColor,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const palette: Record<BtnKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.amber, fg: colors.navy },
    secondary: { bg: colors.blue, fg: colors.white },
    success: { bg: colors.success, fg: colors.white },
    danger: { bg: colors.danger, fg: colors.white },
    ghost: { bg: 'transparent', fg: colors.text, border: colors.line },
  };
  const p = palette[kind];
  const fg = textColor ?? p.fg;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={(state) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: p.bg },
        p.border ? { borderWidth: 1.5, borderColor: p.border } : null,
        fullWidth && { alignSelf: 'stretch' },
        (state as { pressed: boolean }).pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
        isDisabled && { opacity: 0.5 },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.btnText, small && { fontSize: font.size.sm }, { color: fg }]}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ Card --- */

export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.card, style]} />;
}

/* ----------------------------------------------------------------- Badge --- */

export function Badge({
  label,
  color = colors.textMuted,
  soft = colors.surfaceAlt,
  dot,
}: {
  label: string;
  color?: string;
  soft?: string;
  dot?: boolean;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: soft }]}>
      {dot && <View style={[styles.badgeDot, { backgroundColor: color }]} />}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- Avatar --- */

export function Avatar({
  label,
  size = 44,
  color = colors.blue,
}: {
  label: string;
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Text style={{ color: colors.white, fontWeight: font.weight.bold, fontSize: size * 0.38 }}>
        {label}
      </Text>
    </View>
  );
}

/* ----------------------------------------------------------------- Input --- */

interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, style, ...rest }: FieldProps) {
  return (
    <View style={{ gap: spacing.xs }}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...rest}
        style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
      />
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ Chip --- */

export function Chip({
  label,
  selected,
  onPress,
  emoji,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  emoji?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text
        style={[styles.chipText, selected && { color: colors.navy, fontWeight: font.weight.bold }]}
      >
        {emoji ? `${emoji}  ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

/* ---------------------------------------------------------------- Divider --- */

export function Divider({ spacingV = spacing.md }: { spacingV?: number }) {
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacingV }} />;
}

/* ------------------------------------------------------------ Empty state --- */

export function EmptyState({
  emoji,
  title,
  subtitle,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 48 }}>{emoji}</Text>
      <Txt variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {subtitle && (
        <Txt variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
          {subtitle}
        </Txt>
      )}
    </View>
  );
}

/* ----------------------------------------------------------------- Styles --- */

const styles = StyleSheet.create({
  btn: {
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  btnSmall: { height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.sm },
  btnText: { fontSize: font.size.md, fontWeight: font.weight.bold },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    gap: spacing.xs,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: font.size.xs, fontWeight: font.weight.bold },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  fieldLabel: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.text,
    marginLeft: 2,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: font.size.md,
    color: colors.text,
  },
  fieldHint: { fontSize: font.size.xs, color: colors.textFaint, marginLeft: 2 },
  fieldError: { fontSize: font.size.xs, color: colors.danger, marginLeft: 2 },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipSelected: { backgroundColor: colors.amber, borderColor: colors.amberDark },
  chipText: { fontSize: font.size.sm, fontWeight: font.weight.medium, color: colors.textMuted },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
});
