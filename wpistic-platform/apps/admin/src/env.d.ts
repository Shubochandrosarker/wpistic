/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<{
    API_URL: string;
    DASHBOARD_URL: string;
    ACCOUNT_URL: string;
    PUBLIC_ACCOUNT_URL: string;
  ADMIN_CLIENT_ID: string;
  ADMIN_REDIRECT_URI: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
  interface Locals {
    admin?: { accessToken: string; email?: string };
  }
}
