import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia; the theme hook (used by every page via
// AppShell) reads it, so stub a no-op MediaQueryList to keep it quiet.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
