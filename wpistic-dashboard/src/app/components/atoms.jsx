// Shared atoms ported from the approved UI design (atoms.jsx), refactored
// into reusable ES module components.

import { useState } from 'react';
import { Icon } from './Icon.jsx';
import { boot } from '../lib/boot.js';

export { Icon };

export const Btn = ({
  children, variant = 'primary', size = 'md', onClick, style = {},
  type = 'button', leftIcon, rightIcon, disabled = false,
}) => {
  const [hov, setHov] = useState(false);
  const sizes = {
    xs: { padding: '6px 12px', fontSize: 12 },
    sm: { padding: '8px 16px', fontSize: 13 },
    md: { padding: '10px 20px', fontSize: 14 },
    lg: { padding: '13px 28px', fontSize: 15 },
    xl: { padding: '16px 36px', fontSize: 16, fontWeight: 700 },
  };
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    fontFamily: 'inherit', fontWeight: 600, border: 'none',
    borderRadius: 9999, cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.18s ease', whiteSpace: 'nowrap',
    letterSpacing: '-0.01em', lineHeight: 1, opacity: disabled ? 0.55 : 1,
    ...sizes[size],
  };
  const variants = {
    primary: { background: hov ? '#0A1A2E' : '#122843', color: '#fff', boxShadow: hov ? '0 6px 24px rgba(18,40,67,0.45)' : '0 2px 10px rgba(18,40,67,0.30)' },
    secondary: { background: hov ? '#1A1E2E' : '#0D0F1A', color: '#fff' },
    outline: { background: hov ? '#F3F1FE' : 'transparent', color: '#6C5CE7', border: '1.5px solid #6C5CE7' },
    ghost: { background: hov ? '#F3F1FE' : 'transparent', color: '#6C5CE7' },
    'ghost-gray': { background: hov ? '#F0F2FF' : 'transparent', color: '#4B5263' },
    soft: { background: hov ? '#E9E6FD' : '#F3F1FE', color: '#5649CC' },
    white: { background: '#fff', color: '#6C5CE7', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' },
    green: { background: hov ? '#009E3D' : '#00C04B', color: '#fff', boxShadow: hov ? '0 6px 24px rgba(0,192,75,0.40)' : '0 2px 10px rgba(0,192,75,0.25)' },
    'dark-outline': { background: hov ? 'rgba(255,255,255,0.05)' : 'transparent', color: 'rgba(255,255,255,0.92)', border: '1.5px solid rgba(255,255,255,0.22)' },
    'border-card': { background: hov ? '#F8F9FF' : '#fff', color: '#0D0F1A', border: '1px solid #E8EAFF' },
    danger: { background: hov ? '#DC2626' : '#EF4444', color: '#fff' },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={disabled ? undefined : onClick}
    >
      {leftIcon && <Icon name={leftIcon} size={size === 'xl' ? 18 : 15} />}
      {children}
      {rightIcon && <Icon name={rightIcon} size={size === 'xl' ? 18 : 15} />}
    </button>
  );
};

const BADGE_THEMES = {
  purple: { bg: '#E9E6FD', fg: '#5649CC', dot: '#6C5CE7' },
  green: { bg: '#E8FAF0', fg: '#007C2F', dot: '#00C04B' },
  amber: { bg: '#FEF3C7', fg: '#92400E', dot: '#F59E0B' },
  red: { bg: '#FEE2E2', fg: '#991B1B', dot: '#EF4444' },
  gray: { bg: '#F0F2FF', fg: '#4B5263', dot: '#9499BA' },
  blue: { bg: '#DBEAFE', fg: '#1E40AF', dot: '#3B82F6' },
  dark: { bg: '#0D0F1A', fg: '#fff', dot: '#fff' },
};

export const Badge = ({ children, tone = 'purple', dot = false, style = {} }) => {
  const t = BADGE_THEMES[tone] || BADGE_THEMES.purple;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: dot ? 6 : 0,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: t.fg, background: t.bg,
      borderRadius: 9999, padding: '4px 10px', whiteSpace: 'nowrap', ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, background: t.dot, borderRadius: 9999 }} />}
      {children}
    </span>
  );
};

export const Card = ({ children, style = {}, padding = 24, dark = false, hoverable = false }) => {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => hoverable && setHov(true)}
      onMouseLeave={() => hoverable && setHov(false)}
      style={{
        background: dark ? '#13161F' : '#fff',
        borderRadius: 20,
        border: dark ? '1px solid #1E2130' : '1px solid #EDEFF8',
        boxShadow: hoverable && hov ? '0 16px 44px rgba(108,92,231,0.16)' : '0 2px 12px rgba(108,92,231,0.05)',
        transition: 'all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: hoverable && hov ? 'translateY(-3px)' : 'translateY(0)',
        padding, ...style,
      }}
    >
      {children}
    </div>
  );
};

export const SectionLabel = ({ children, light, color, style = {} }) => (
  <div style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: color || (light ? '#9499BA' : '#6C5CE7'),
    marginBottom: 14, ...style,
  }}>{children}</div>
);

export const Logo = ({ variant = 'purple', size = 28, showText = true, dark = false }) => {
  const src = boot.assets?.[`logo${variant.charAt(0).toUpperCase()}${variant.slice(1)}`]
    || boot.assets?.logoPurple || '';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      {src
        ? <img src={src} alt="WPistic" style={{ width: size, height: size, objectFit: 'contain' }} />
        : <span style={{ width: size, height: size, borderRadius: 8, background: '#6C5CE7', display: 'inline-block' }} />}
      {showText && (
        <span style={{ fontSize: size * 0.6 + 1, fontWeight: 800, color: dark ? '#fff' : '#0D0F1A', letterSpacing: '-0.03em' }}>
          WPistic
        </span>
      )}
    </div>
  );
};

export const TextInput = ({ value, onChange, placeholder, icon, style = {}, size = 'md', type = 'text' }) => {
  const [focused, setFocused] = useState(false);
  const h = size === 'sm' ? 34 : 40;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, height: h, padding: '0 14px',
      borderRadius: 9999, background: '#fff',
      border: focused ? '1.5px solid #6C5CE7' : '1.5px solid #E8EAFF',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      boxShadow: focused ? '0 0 0 4px rgba(108,92,231,0.10)' : 'none', ...style,
    }}>
      {icon && <Icon name={icon} size={15} color="#9499BA" />}
      <input
        value={value || ''}
        type={type}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: '#0D0F1A', fontFamily: 'inherit' }}
      />
    </div>
  );
};

export const fmt = (n) => (n ?? 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const STATUS_TONE = {
  Live: 'green', Beta: 'purple', 'Coming Soon': 'gray', Active: 'green',
  active: 'green', Trial: 'amber', trial: 'amber', Free: 'gray',
  'Expiring Soon': 'amber', expiring: 'amber', Expired: 'red', expired: 'red',
  Suspended: 'red', suspended: 'red', Notify: 'gray', cancelled: 'gray',
  past_due: 'red', pending: 'amber',
};
