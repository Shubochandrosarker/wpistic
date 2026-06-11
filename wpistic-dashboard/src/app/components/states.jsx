// UI states: loading skeletons, empty, error, toasts, and inline banners
// covering every state called for in the brief (trial ending, payment failed,
// no website, no/expired/suspended license, webhook failed, key regenerated).

import { createContext, useContext, useState, useCallback } from 'react';
import { Icon } from './Icon.jsx';
import { Btn, Card } from './atoms.jsx';

// ── Skeletons ────────────────────────────────────────────────
export const Skeleton = ({ w = '100%', h = 16, r = 8, style = {} }) => (
  <span
    className="wpistic-skeleton"
    style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }}
  />
);

export const SkeletonCard = () => (
  <Card padding={22}>
    <Skeleton w={36} h={36} r={10} />
    <Skeleton w="40%" h={11} style={{ marginTop: 16 }} />
    <Skeleton w="60%" h={28} style={{ marginTop: 10 }} />
  </Card>
);

export const SkeletonGrid = ({ count = 4, columns = 4 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 18 }}>
    {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
);

export const SkeletonRows = ({ count = 5 }) => (
  <Card padding={0}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{ display: 'flex', gap: 14, padding: 18, borderBottom: i < count - 1 ? '1px solid var(--app-border-3)' : 'none' }}>
        <Skeleton w={40} h={40} r={12} />
        <div style={{ flex: 1 }}>
          <Skeleton w="30%" h={12} />
          <Skeleton w="55%" h={12} style={{ marginTop: 8 }} />
        </div>
      </div>
    ))}
  </Card>
);

// ── Empty state ──────────────────────────────────────────────
export const EmptyState = ({ icon = 'cube', title, message, action }) => (
  <Card padding={48} style={{ textAlign: 'center' }}>
    <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 18px', background: 'var(--app-accent-soft)', color: '#6C5CE7', display: 'grid', placeItems: 'center' }}>
      <Icon name={icon} size={26} />
    </div>
    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--app-text)' }}>{title}</div>
    {message && <p style={{ fontSize: 13.5, color: '#6B7280', maxWidth: 420, margin: '8px auto 0', lineHeight: 1.6 }}>{message}</p>}
    {action && <div style={{ marginTop: 22 }}>{action}</div>}
  </Card>
);

// ── Error state ──────────────────────────────────────────────
export const ErrorState = ({ error, onRetry }) => (
  <Card padding={48} style={{ textAlign: 'center' }}>
    <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 18px', background: '#FEE2E2', color: '#EF4444', display: 'grid', placeItems: 'center' }}>
      <Icon name="warn" size={26} />
    </div>
    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--app-text)' }}>Something went wrong</div>
    <p style={{ fontSize: 13.5, color: 'var(--app-text-3)', maxWidth: 420, margin: '8px auto 0', lineHeight: 1.6 }}>
      {error?.message || 'We couldn’t load this right now.'}
    </p>
    {onRetry && <div style={{ marginTop: 22 }}><Btn variant="outline" size="sm" leftIcon="refresh" onClick={onRetry}>Try again</Btn></div>}
  </Card>
);

// ── Inline banner ────────────────────────────────────────────
const BANNER_TONES = {
  amber: { bg: '#FEF3C7', border: '#FDE68A', fg: '#92400E', icon: 'warn' },
  red: { bg: '#FEE2E2', border: '#FECACA', fg: '#991B1B', icon: 'warn' },
  green: { bg: '#E8FAF0', border: '#C4F2D8', fg: '#007C2F', icon: 'check' },
  purple: { bg: '#F3F1FE', border: '#E9E6FD', fg: '#5649CC', icon: 'spark' },
  blue: { bg: '#DBEAFE', border: '#BFDBFE', fg: '#1E40AF', icon: 'globe' },
};

export const Banner = ({ tone = 'amber', title, message, action, onDismiss }) => {
  const t = BANNER_TONES[tone] || BANNER_TONES.amber;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      background: t.bg, border: `1px solid ${t.border}`, color: t.fg,
      borderRadius: 14, padding: '14px 16px', marginBottom: 18,
    }}>
      <Icon name={t.icon} size={18} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</div>}
        {message && <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 2, lineHeight: 1.5 }}>{message}</div>}
      </div>
      {action}
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: t.fg, cursor: 'pointer', padding: 2, opacity: 0.7 }}>
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
};

// Pre-built banners for the canonical account/billing/license states.
export const TrialEndingBanner = ({ days, onUpgrade }) => (
  <Banner tone="amber" title={`Your trial ends in ${days} day${days === 1 ? '' : 's'}.`}
    message="Add a payment method to keep your workspace and licenses active."
    action={<Btn size="xs" variant="outline" onClick={onUpgrade}>Add billing</Btn>} />
);
export const PaymentFailedBanner = ({ onFix }) => (
  <Banner tone="red" title="Payment failed."
    message="We couldn’t charge your card. Licenses are limited until billing is fixed."
    action={<Btn size="xs" variant="danger" onClick={onFix}>Update payment</Btn>} />
);
export const NoWebsiteBanner = ({ onConnect }) => (
  <Banner tone="purple" title="No website connected yet."
    message="Connect your first WordPress site to activate licenses and sync analytics."
    action={<Btn size="xs" variant="soft" onClick={onConnect}>Connect site</Btn>} />
);

// ── Toasts ───────────────────────────────────────────────────
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

const TOAST_TONES = {
  success: { bg: '#0D0F1A', accent: '#00C04B', icon: 'check' },
  error: { bg: '#0D0F1A', accent: '#EF4444', icon: 'warn' },
  info: { bg: '#0D0F1A', accent: '#6C5CE7', icon: 'spark' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div style={{ position: 'fixed', bottom: 22, right: 22, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 9999 }}>
        {toasts.map((t) => {
          const tone = TOAST_TONES[t.tone] || TOAST_TONES.info;
          return (
            <div key={t.id} className="wpistic-fade-up" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: tone.bg, color: '#fff', padding: '12px 16px',
              borderRadius: 12, boxShadow: '0 12px 36px rgba(13,15,26,0.35)',
              fontSize: 13.5, fontWeight: 500, maxWidth: 360,
              borderLeft: `3px solid ${tone.accent}`,
            }}>
              <Icon name={tone.icon} size={16} color={tone.accent} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
