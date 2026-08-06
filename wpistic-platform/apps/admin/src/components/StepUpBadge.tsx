/**
 * Header control showing whether admin changes are currently unlocked, with a
 * live countdown. Editing screens elsewhere do not gate themselves on this —
 * they attempt the mutation and let `adminCall` handle the step-up transparently
 * — so this exists to make the window's state legible, not to enforce it.
 */
import { useEffect, useState } from 'react';
import { describeError, lock, unlock } from '../lib/client';

function remaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function StepUpBadge({ initialExpiresAt }: { initialExpiresAt: string | null }) {
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt);
  const [, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-render once a second so the countdown moves, and drop the badge to
  // "locked" the moment it reaches zero rather than waiting for a failed call.
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      setExpiresAt((current) => (current && new Date(current).getTime() <= Date.now() ? null : current));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // `adminCall` opens the window on demand from anywhere in the page; listen so
  // the badge reflects that without a reload.
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ expires_at: string } | null>).detail;
      setExpiresAt(detail?.expires_at ?? null);
    };
    window.addEventListener('wpistic:step-up', onChange);
    return () => window.removeEventListener('wpistic:step-up', onChange);
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!expiresAt) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-[11px] text-red-300">{error}</span>}
        <button
          onClick={() => void act(unlock)}
          disabled={busy}
          className="text-[12px] px-2.5 py-1 rounded-lg border border-border text-[#A1A1A1] hover:text-white hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          🔒 Changes locked — unlock
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] px-2.5 py-1 rounded-lg border border-accent/40 bg-accent/10 text-accent">
        🔓 Unlocked {remaining(expiresAt)}
      </span>
      <button
        onClick={() => void act(lock)}
        disabled={busy}
        className="text-[11px] text-muted hover:text-white transition-colors disabled:opacity-50"
      >
        Lock now
      </button>
    </div>
  );
}
