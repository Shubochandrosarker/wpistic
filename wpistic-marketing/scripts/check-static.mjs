import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const out = join(process.cwd(), "out");
if (!existsSync(join(out, "index.html"))) {
  throw new Error("Static export is missing out/index.html");
}

const html = readFileSync(join(out, "index.html"), "utf8");
if (html.includes("next start") || html.includes("__NEXT_PRIVATE_PREBUNDLED_REACT")) {
  throw new Error("Static export contains a server runtime marker");
}

console.log(`Static export verified: ${out}`);
