// Platform (back-office) admin emails. MUST match the isPlatformAdmin() list
// in firestore.rules. Add your own email here (and to the rules) to get access.
export const PLATFORM_ADMINS = ['admin@quickiefix.store'];

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  return !!email && PLATFORM_ADMINS.includes(email.toLowerCase());
}
