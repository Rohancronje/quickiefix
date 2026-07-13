/**
 * Branded confirm dialog replacing window.confirm — promise-based, so call
 * sites read exactly like the native API: `if (!(await confirmDialog(...)))`.
 */
import { useEffect, useState } from 'react';

interface Pending {
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let push: ((p: Pending) => void) | null = null;

export function confirmDialog(
  title: string,
  opts: { message?: string; confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) {
      resolve(window.confirm(`${title}${opts.message ? `\n\n${opts.message}` : ''}`));
      return;
    }
    push({
      title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      danger: opts.danger,
      resolve,
    });
  });
}

/** Mount once at the app root. */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    push = setPending;
    return () => {
      push = null;
    };
  }, []);

  if (!pending) return null;

  const done = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };

  return (
    <div className="qf-modal-backdrop" onClick={() => done(false)}>
      <div className="qf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qf-modal-title">{pending.title}</div>
        {pending.message && <div className="qf-modal-msg">{pending.message}</div>}
        <div className="qf-modal-actions">
          <button className="co-btn co-btn-ghost" onClick={() => done(false)}>
            Cancel
          </button>
          <button
            className={`co-btn ${pending.danger ? 'co-btn-danger' : 'co-btn-primary'}`}
            onClick={() => done(true)}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
