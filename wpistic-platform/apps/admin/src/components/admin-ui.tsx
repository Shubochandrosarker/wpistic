/**
 * Shared island primitives. Deliberately small and unstyled-by-convention —
 * the admin portal's whole visual language is three surface colors and an
 * accent, so a handful of wrappers is enough to keep every management screen
 * consistent without a component library.
 */
import { useEffect, useState, type ReactNode } from 'react';

export const INPUT =
  'w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50';

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const styles = {
    default: 'border border-border text-[#A1A1A1] hover:text-white hover:bg-surface-hover',
    primary: 'bg-accent text-background font-medium hover:opacity-90',
    danger: 'border border-red-500/40 text-red-300 hover:bg-red-500/10',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`text-[13px] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-[#A1A1A1] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

export function Panel({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="bg-surface border border-border rounded-xl shadow-card mb-6">
      <header className="px-4 py-3 border-b border-border flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-[12px] text-muted mt-0.5">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Inline status line: errors in red, confirmations in the accent color. */
export function Status({ error, message }: { error?: string | null; message?: string | null }) {
  if (!error && !message) return null;
  return (
    <p className={`text-[12px] mt-3 ${error ? 'text-red-300' : 'text-accent'}`}>{error ?? message}</p>
  );
}

/**
 * One-shot secret display. License keys are returned exactly once by the API,
 * so this refuses to disappear on its own — the operator dismisses it after
 * copying, and the copy button is the only affordance that matters.
 */
export function SecretReveal({ label, value, onDismiss }: { label: string; value: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border border-accent/40 bg-accent/5 rounded-xl p-4 mb-4">
      <p className="text-[12px] font-semibold text-accent mb-1">{label}</p>
      <p className="text-[12px] text-muted mb-3">
        This is shown once and cannot be retrieved again — only its hash is stored. Copy it now.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-[12px] bg-background border border-border rounded-lg px-3 py-2 break-all">
          {value}
        </code>
        <Button
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button onClick={onDismiss} disabled={!copied}>
          Done
        </Button>
      </div>
      {!copied && <p className="text-[11px] text-muted mt-2">Copy the key to enable “Done”.</p>}
    </div>
  );
}

/** Reload after a successful mutation — server-rendered pages hold the truth. */
export function useReloadAfter(message: string | null, delayMs = 700): void {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => window.location.reload(), delayMs);
    return () => clearTimeout(timer);
  }, [message, delayMs]);
}
