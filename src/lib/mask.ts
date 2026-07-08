/**
 * Contact-detail masking for in-app messaging (Pilot Spec §7). We keep the
 * conversation on-platform by redacting attempts to share phone numbers, emails,
 * or messaging handles — the usual leakage/disintermediation vectors.
 *
 * This is deliberately conservative: it errs toward masking a borderline token
 * rather than letting a real number through. Applied when a message is sent, so
 * the raw contact detail is never stored.
 */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// 7+ digits possibly split by spaces / dashes / dots / brackets / a leading +.
const PHONE = /\+?\d[\d\s().-]{5,}\d/g;
// Common "reach me off-platform" handles.
const HANDLE = /\b(?:whatsapp|whats app|wechat|telegram|signal|insta(?:gram)?|snap(?:chat)?)\b\s*[:@]?\s*\S*/gi;

export function maskContactInfo(text: string): string {
  return text
    .replace(EMAIL, '[contact hidden]')
    .replace(PHONE, '[contact hidden]')
    .replace(HANDLE, '[contact hidden]')
    .trimEnd();
}

/** Did masking change anything? (used to warn the sender). */
export function containsContactInfo(text: string): boolean {
  return maskContactInfo(text) !== text.trimEnd();
}
