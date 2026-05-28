// Reads the localized WPistic boot object injected by PHP (BootData.php).
// Falls back to safe defaults so the app can still render in dev / Storybook.

const fallback = {
  restUrl: '/wp-json/',
  restNamespaces: {
    wpistic: 'wpistic/v1',
    memberistic: 'memberistic/v1',
    licenseistic: 'licenseistic/v1',
    auth: 'wpistic-auth/v1',
  },
  nonce: '',
  logoutUrl: '/wp-login.php?action=logout',
  homeUrl: '/',
  basePath: '/dashboard',
  currentUser: {
    id: 0,
    name: 'Guest',
    email: '',
    avatar: '',
    initials: 'G',
    roles: [],
    caps: {},
  },
  workspace: null,
  plan: { slug: 'free', name: 'Free', status: 'active' },
  enabledModules: {},
  assets: {},
};

export const boot = typeof window !== 'undefined' && window.wpisticBoot
  ? { ...fallback, ...window.wpisticBoot }
  : fallback;

export const moduleEnabled = (slug) => Boolean(boot.enabledModules?.[slug]);
export const can = (cap) => Boolean(boot.currentUser?.caps?.[cap]);
