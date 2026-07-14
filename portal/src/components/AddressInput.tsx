/**
 * Address input with Google Places suggestions (via our server proxy — the
 * same one the app uses, NZ-only, key stays server-side). Selecting a
 * suggestion also geocodes it, so agency properties get real coordinates for
 * distance ranking and ETAs.
 */
import { useEffect, useRef, useState } from 'react';
import { firebaseConfig } from '../firebase';
import '../sug.css';

// Environment-aware: the proxy lives in whichever project this build targets.
const PLACES_URL = `https://australia-southeast1-${firebaseConfig.projectId}.cloudfunctions.net/places`;

interface Suggestion {
  placeId: string;
  text: string;
}

export interface ResolvedAddress {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export function AddressInput({
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: ResolvedAddress) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const timer = useRef<number | null>(null);
  const session = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const suppress = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const handleChange = (text: string) => {
    onChange(text);
    if (suppress.current) {
      suppress.current = false;
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(PLACES_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'suggest', input: text, sessionToken: session.current }),
        });
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const pick = async (s: Suggestion) => {
    setSuggestions([]);
    suppress.current = true;
    try {
      const res = await fetch(PLACES_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'details', placeId: s.placeId, sessionToken: session.current }),
      });
      const data = await res.json();
      onSelect({
        address: data.address || s.text,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      });
    } catch {
      onSelect({ address: s.text, latitude: null, longitude: null });
    } finally {
      session.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="co-input"
        style={{ width: '100%' }}
        placeholder={placeholder ?? '12 Queen Street, Auckland'}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
      />
      {suggestions.length > 0 && (
        <div className="qf-sug">
          {suggestions.map((s) => (
            <div key={s.placeId} className="qf-sug-row" onClick={() => pick(s)}>
              📍 {s.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
