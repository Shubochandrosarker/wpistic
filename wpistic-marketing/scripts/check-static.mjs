import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const out = join(process.cwd(), "out");
if (!existsSync(join(out, "index.html"))) {
  throw new Error("Static export is missing out/index.html");
}

const html = readFileSync(join(out, "index.html"), "utf8");
if (html.includes("next start") || html.includes("__NEXT_PRIVATE_PREBUNDLED_REACT")) {
  throw new Error("Static export contains a server runtime marker");
}

// ---------------------------------------------------------------------------
// Outbound auth links must point at routes that exist.
//
// This site links to two other properties, and neither is built here, so
// nothing else catches a link going stale. The specific failure this guards
// against already happened: every "Log in" and "Get started" button pointed at
// app.wpistic.com/login and /register, which the dashboard SPA does not route.
// Visitors got a blank page, and no build, lint, or type check noticed — the
// URLs were valid strings all the way down.
//
// Rules, and why each one:
//   app.wpistic.com/<path>  — the SPA routes only its own authenticated pages,
//                             so deep links from here are a liability. Link the
//                             app root and let its auth guard route the visitor.
//   account.wpistic.com/... — allowed only for paths the identity service
//                             actually serves (apps/account/src/index.ts).
// ---------------------------------------------------------------------------

const ACCOUNT_ROUTES = new Set(["/login", "/register", "/reset", "/authorize"]);
// Backslash terminates the path as well as quotes: these URLs also appear
// inside Next's JSON-encoded flight payloads, where the closing quote arrives
// as \" and would otherwise be captured as part of the path.
const LINK_PATTERN = /https?:\/\/(app|account)\.wpistic\.com([^"'\s<>)\\]*)/g;

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

const violations = [];
for (const file of htmlFiles(out)) {
  const contents = readFileSync(file, "utf8");
  for (const [url, host, rawPath] of contents.matchAll(LINK_PATTERN)) {
    // Strip trailing punctuation picked up from prose, and the trailing slash
    // Next appends under trailingSlash: true.
    const path = rawPath.replace(/[.,;:!?]+$/, "").replace(/\/$/, "");
    if (path === "") continue;

    if (host === "app") {
      violations.push(
        `${file}\n    ${url}\n    The dashboard SPA does not route "${path}". Link https://app.wpistic.com and let its auth guard route the visitor.`
      );
    } else if (!ACCOUNT_ROUTES.has(path)) {
      violations.push(
        `${file}\n    ${url}\n    The identity service does not serve "${path}". Known routes: ${[...ACCOUNT_ROUTES].join(", ")}.`
      );
    }
  }
}

if (violations.length > 0) {
  throw new Error(
    `Outbound auth links point at routes that do not exist:\n\n  ${violations.join("\n\n  ")}\n`
  );
}

console.log(`Static export verified: ${out}`);
console.log("Outbound auth links verified against app + account routes");
