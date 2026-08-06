export const site = {
  name: "WPistic",
  domain: "www.wpistic.com",
  url: "https://www.wpistic.com",
  tagline: "The WordPress SaaS ecosystem",
  description:
    "WPistic is a suite of WordPress-native products — AI chat, CRM, bookings, memberships, analytics, and licensing — that share one dashboard, one billing account, and one login.",
  supportEmail: "support@wpistic.com",
  salesEmail: "sales@wpistic.com",
  securityEmail: "security@wpistic.com",
  social: {
    twitter: "https://twitter.com/wpistic",
    linkedin: "https://www.linkedin.com/company/wpistic",
    github: "https://github.com/wpistic",
  },
  // These have to match routes that actually exist, which is less obvious than
  // it looks: sign-in and sign-up are served by the identity service on
  // account.wpistic.com, while the dashboard SPA on app.wpistic.com owns only
  // its own authenticated routes.
  //
  // `dashboardUrl` and `loginUrl` are deliberately the same. The app root is
  // the correct entry point for both: a visitor with a live session lands
  // straight in their dashboard without seeing a login form, and one without
  // is bounced into the branded OAuth login by the SPA's own guard. Linking
  // "Log in" at the identity service instead would show a returning customer a
  // login form they do not need.
  //
  // Registration has no equivalent — the SPA cannot create an account, so it
  // points at the identity service directly. After signing up, that service
  // redirects to DEFAULT_REDIRECT (the app root) and the new session completes
  // the OAuth exchange automatically.
  dashboardUrl: "https://app.wpistic.com",
  loginUrl: "https://app.wpistic.com",
  registerUrl: "https://account.wpistic.com/register",
};
