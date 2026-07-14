import { AgencyLink, Engagement } from '../types';

/**
 * An agency's approved tradie panel, distilled from its agencyLinks:
 * directly-linked tradies plus linked companies (with the company's scope
 * choice — 'employees' excludes contractors). Used by dispatch AND by the
 * request-flow preview, so both always agree on who is on the panel.
 */
export interface AgencyPanel {
  /** Tradies holding their OWN membership (decides sourcedVia at accept). */
  tradieIds: string[];
  /** companyId → scope for company-held memberships. */
  companyScope: Record<string, 'all' | 'employees'>;
}

export function panelFromLinks(links: AgencyLink[]): AgencyPanel {
  const approved = links.filter((l) => l.status === 'approved');
  return {
    tradieIds: approved.filter((l) => l.kind === 'tradie').map((l) => l.memberId),
    companyScope: Object.fromEntries(
      approved.filter((l) => l.kind === 'company').map((l) => [l.memberId, l.scope ?? 'all']),
    ),
  };
}

export function isOnPanel(
  t: { id: string; companyId?: string; engagement?: Engagement },
  panel: AgencyPanel,
): boolean {
  if (panel.tradieIds.includes(t.id)) return true;
  if (t.companyId == null) return false;
  const scope = panel.companyScope[t.companyId];
  if (!scope) return false;
  return scope === 'all' || t.engagement !== 'contractor';
}
