/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<{
  API_URL: string;
  DASHBOARD_URL: string;
  ADMIN_API_TOKEN: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
