import wpisticPreset from '@wpistic/ui-design-system/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [wpisticPreset],
  content: ['./src/**/*.{astro,ts,tsx}'],
};
