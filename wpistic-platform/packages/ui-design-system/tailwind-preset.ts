/**
 * WPistic shared Tailwind preset — the premium dark SaaS visual language.
 *
 * #0A0A0A background, #C9A961 accent, #1A1A1C card surfaces.
 * No decorative gradients, no hype. Motion is state, not flourish.
 *
 * Consumed by apps/dashboard and apps/admin via `presets: [wpisticPreset]`.
 */
import type { Config } from 'tailwindcss';

export const colors = {
  background: '#0A0A0A',
  surface: '#1A1A1C',
  'surface-hover': '#252528',
  border: '#2A2A2D',
  accent: '#C9A961',
  'accent-hover': '#D4B76A',
  muted: '#6B6B6B',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  info: '#3B82F6',
} as const;

const wpisticPreset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        card: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
};

export default wpisticPreset;
