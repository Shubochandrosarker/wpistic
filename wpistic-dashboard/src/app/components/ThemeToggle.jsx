// Light/dark toggle button for the topbar. Shows a sun in dark mode (tap to go
// light) and a moon in light mode (tap to go dark). Fully keyboard accessible.

import { Icon } from './Icon.jsx';
import { useTheme } from '../lib/theme.js';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="wpistic-icon-btn"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={17} />
    </button>
  );
}
