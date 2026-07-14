import { useState } from 'react';
import { filePortalTicket } from '../api';

/** In-platform support: tickets land in the back office + email the ops inbox. */
export function SupportForm({
  from,
}: {
  from: { id: string; name: string; email: string; role: 'company' | 'agency' };
}) {
  const [subject, setSubject] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!subject.trim() || !detail.trim()) return;
    setBusy(true);
    try {
      await filePortalTicket(from, subject, detail);
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="co-card">
        <div className="co-empty">
          <div style={{ fontSize: 30 }}>🛟</div>
          <div className="co-empty-title">We're on it</div>
          <div className="co-empty-sub">
            Your message has reached the QuickieFix team — we'll come back to you by email.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="co-card" style={{ maxWidth: 620 }}>
      <div className="co-sectionhead">Contact QuickieFix</div>
      <p className="co-help">
        Questions, issues or feature requests — everything stays on the platform and reaches the
        team immediately.
      </p>
      <div className="co-field" style={{ marginBottom: 12 }}>
        <label>Subject</label>
        <input
          className="co-input"
          placeholder="What's it about?"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="co-field" style={{ marginBottom: 14 }}>
        <label>Message</label>
        <textarea
          className="co-input"
          style={{ minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }}
          placeholder="Tell us what's going on…"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </div>
      <button
        className="co-btn co-btn-primary"
        disabled={busy || !subject.trim() || !detail.trim()}
        title={
          !subject.trim() || !detail.trim() ? 'Add a subject and a message first' : undefined
        }
        onClick={send}
      >
        {busy ? 'Sending…' : 'Send to QuickieFix'}
      </button>
    </div>
  );
}
