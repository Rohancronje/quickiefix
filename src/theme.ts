/**
 * QuickieFix design system.
 * A single source of truth for colours, spacing, radii and typography so the
 * whole app feels cohesive. Palette: deep navy (trust) + energetic amber
 * (speed / urgency) + supporting semantic colours.
 */

export const colors = {
  // Brand
  navy: '#0B1220',
  navySoft: '#131C2E',
  navyCard: '#1B2740',
  navyLine: '#2A3654',

  amber: '#FFB020',
  amberDark: '#E8990B',
  blue: '#3D7BFF',
  blueSoft: '#1E2D52',

  // Surfaces (light screens)
  bg: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F8',
  line: '#E2E7F1',

  // Text
  text: '#0B1220',
  textMuted: '#5A6478',
  textFaint: '#8A93A6',
  onNavy: '#F4F6FB',
  onNavyMuted: '#9AA5BD',

  // Semantic
  success: '#1FB471',
  successSoft: '#E3F7EE',
  warning: '#F5A623',
  warningSoft: '#FDF1DC',
  danger: '#EF4B5C',
  dangerSoft: '#FCE4E7',
  info: '#3D7BFF',
  infoSoft: '#E6EEFF',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const font = {
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 34,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
  },
} as const;

export const shadow = {
  card: {
    shadowColor: '#0B1220',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  floating: {
    shadowColor: '#0B1220',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;
