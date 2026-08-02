import type { Config } from 'tailwindcss';
import wpisticPreset from '@wpistic/ui-design-system/tailwind-preset';

export default {
  presets: [wpisticPreset as Config],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
} satisfies Config;
