/**
 * Address autocomplete via our Cloud Function proxy (functions/index.js →
 * exports.places). The Google Places key stays server-side; the client only
 * ever talks to our endpoint. A session token groups one typing session plus
 * its final details lookup into a single billed Places session.
 */

const PLACES_URL = 'https://australia-southeast1-quickiefix-2ea2a.cloudfunctions.net/places';

export interface AddressSuggestion {
  placeId: string;
  text: string;
}

export interface ResolvedAddress {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

/** Cheap unique-enough token; Google only needs it to be consistent per session. */
export function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function call<T>(body: object): Promise<T> {
  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Address lookup failed.');
  return (await res.json()) as T;
}

export async function suggestAddresses(
  input: string,
  sessionToken: string,
): Promise<AddressSuggestion[]> {
  if (input.trim().length < 3) return [];
  const data = await call<{ suggestions: AddressSuggestion[] }>({
    op: 'suggest',
    input,
    sessionToken,
  });
  return data.suggestions ?? [];
}

export async function resolveAddress(
  placeId: string,
  sessionToken: string,
): Promise<ResolvedAddress> {
  return call<ResolvedAddress>({ op: 'details', placeId, sessionToken });
}
