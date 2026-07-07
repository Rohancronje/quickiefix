import { JobStatus, TradeCategory, TradieStatus } from './types';
import { colors } from './theme';

export interface TradeMeta {
  key: TradeCategory;
  label: string;
  emoji: string;
  /** Regulated trades require licence/qualification verification. */
  regulated: boolean;
}

export const TRADES: TradeMeta[] = [
  { key: 'electrician', label: 'Electrician', emoji: '⚡', regulated: true },
  { key: 'plumber', label: 'Plumber', emoji: '🔧', regulated: true },
  { key: 'gasfitter', label: 'Gasfitter', emoji: '🔥', regulated: true },
  { key: 'builder', label: 'Builder', emoji: '🏗️', regulated: true },
  { key: 'roofer', label: 'Roofer', emoji: '🏠', regulated: false },
  { key: 'painter', label: 'Painter', emoji: '🎨', regulated: false },
  { key: 'locksmith', label: 'Locksmith', emoji: '🔑', regulated: false },
  { key: 'handyman', label: 'Handyman', emoji: '🛠️', regulated: false },
  { key: 'appliance_repair', label: 'Appliance Repair', emoji: '🔌', regulated: false },
  { key: 'landscaper', label: 'Landscaper', emoji: '🌿', regulated: false },
  { key: 'cleaner', label: 'Cleaner', emoji: '🧽', regulated: false },
  { key: 'pest_control', label: 'Pest Control', emoji: '🐜', regulated: false },
];

export const tradeMeta = (key: TradeCategory): TradeMeta =>
  TRADES.find((t) => t.key === key) ?? {
    key,
    label: key,
    emoji: '🧰',
    regulated: false,
  };

export const CUSTOMER_RATING_TAGS = [
  'Professional',
  'Friendly',
  'On time',
  'Excellent workmanship',
  'Would recommend',
];

export const TRADIE_RATING_TAGS = [
  'Good communication',
  'Easy access',
  'Respectful',
  'Clear brief',
  'Would work with again',
];

interface StatusMeta {
  label: string;
  color: string;
  soft: string;
}

export const jobStatusMeta: Record<JobStatus, StatusMeta> = {
  draft: { label: 'Draft', color: colors.textMuted, soft: colors.surfaceAlt },
  searching: { label: 'Finding a tradie', color: colors.amberDark, soft: colors.warningSoft },
  accepted: { label: 'Accepted', color: colors.blue, soft: colors.infoSoft },
  travelling: { label: 'On the way', color: colors.blue, soft: colors.infoSoft },
  on_site: { label: 'On site', color: colors.success, soft: colors.successSoft },
  completed: { label: 'Completed', color: colors.success, soft: colors.successSoft },
  cancelled: { label: 'Cancelled', color: colors.danger, soft: colors.dangerSoft },
  disputed: { label: 'Disputed', color: colors.danger, soft: colors.dangerSoft },
};

export const tradieStatusMeta: Record<TradieStatus, StatusMeta> = {
  available: { label: 'Available', color: colors.success, soft: colors.successSoft },
  unavailable: { label: 'Unavailable', color: colors.textMuted, soft: colors.surfaceAlt },
  job_accepted: { label: 'Job accepted', color: colors.blue, soft: colors.infoSoft },
  on_site: { label: 'On site', color: colors.amberDark, soft: colors.warningSoft },
  offline: { label: 'Offline', color: colors.textFaint, soft: colors.surfaceAlt },
};

/** Radius (km) within which a tradie is auto-flipped to "on site". */
export const ON_SITE_RADIUS_KM = 0.15;
