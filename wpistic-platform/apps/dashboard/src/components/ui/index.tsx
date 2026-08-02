/**
 * Core UI primitives — dark premium visual language. State changes are the
 * only motion; no decorative flourish.
 */
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { X } from 'lucide-react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ---- Button ---------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-background hover:bg-accent-hover font-semibold',
  secondary: 'bg-surface border border-border text-white hover:bg-surface-hover',
  ghost: 'text-[#A1A1A1] hover:text-white hover:bg-surface',
  danger: 'bg-danger/10 border border-danger/40 text-red-300 hover:bg-danger/20',
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-[13px] rounded-md gap-1.5',
  md: 'px-3.5 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-[15px] rounded-lg gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center transition-colors disabled:opacity-50 disabled:pointer-events-none',
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    />
  );
}

// ---- Inputs ---------------------------------------------------------------

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white',
        'placeholder:text-muted focus:outline-none focus:border-accent transition-colors',
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white',
        'focus:outline-none focus:border-accent transition-colors',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-[13px] text-[#A1A1A1] mb-1.5">{children}</label>;
}

// ---- Card -----------------------------------------------------------------

export function Card({
  className,
  children,
  hover = false,
}: {
  className?: string;
  children: ReactNode;
  hover?: boolean;
}) {
  return (
    <div
      className={cx(
        'bg-surface border border-border rounded-card shadow-card',
        hover && 'transition-colors hover:bg-surface-hover',
        className
      )}
    >
      {children}
    </div>
  );
}

// ---- Badge ----------------------------------------------------------------

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-surface-hover text-[#A1A1A1] border-border',
  success: 'bg-success/10 text-green-300 border-success/30',
  warning: 'bg-warning/10 text-amber-300 border-warning/30',
  danger: 'bg-danger/10 text-red-300 border-danger/30',
  info: 'bg-info/10 text-blue-300 border-info/30',
  accent: 'bg-accent/10 text-accent border-accent/30',
};

export function Badge({ variant = 'default', children }: { variant?: BadgeVariant; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center px-2 py-0.5 rounded-full border text-[12px] font-medium whitespace-nowrap',
        badgeVariants[variant]
      )}
    >
      {children}
    </span>
  );
}

export function statusBadgeVariant(status: string): BadgeVariant {
  if (['active', 'healthy', 'paid', 'completed', 'lifetime', 'connected'].includes(status)) return 'success';
  if (['trialing', 'grace_period', 'pending', 'warning', 'open', 'past_due'].includes(status)) return 'warning';
  if (['suspended', 'expired', 'revoked', 'cancelled', 'failed', 'critical'].includes(status)) return 'danger';
  return 'default';
}

// ---- Table ----------------------------------------------------------------

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th key={h} className="text-left font-medium text-[13px] text-muted px-4 py-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cx('px-4 py-3 align-middle', className)}>{children}</td>;
}

// ---- Modal ----------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <Card className="relative w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border flex justify-end gap-2">{footer}</div>}
      </Card>
    </div>
  );
}

// ---- Skeleton / EmptyState / StatCard -------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx('rounded-md bg-[linear-gradient(90deg,#1A1A1C_25%,#252528_50%,#1A1A1C_75%)] bg-[length:800px_100%] animate-shimmer', className)}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="text-muted mb-4">{icon}</div>}
      <h3 className="font-semibold text-white">{title}</h3>
      {description && <p className="text-sm text-muted mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] text-muted">{label}</p>
          <p className="text-2xl font-semibold mt-1 tracking-tight">{value}</p>
          {hint && <p className="text-[12px] text-muted mt-1">{hint}</p>}
        </div>
        {icon && <div className="text-accent/80">{icon}</div>}
      </div>
    </Card>
  );
}

// ---- Page scaffolding ------------------------------------------------------

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}
