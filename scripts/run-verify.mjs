/**
 * Bundles scripts/verify.tsx with esbuild (inlining the Vite env vars the app
 * reads) and runs it on Node. `npm run verify`.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.dirname(fileURLToPath(import.meta.url));
const outfile = path.join(root, "..", ".tmp", "verify.mjs");
mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, "verify.tsx")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  jsx: "automatic",
  logLevel: "warning",
  // Keep node_modules external: react-dom/server ships CJS, and letting Node
  // resolve it avoids esbuild's unsupported "dynamic require" shim.
  packages: "external",
  define: {
    "import.meta.env": JSON.stringify({
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
      VITE_PADDLE_CLIENT_TOKEN: "test_token",
      VITE_PADDLE_ENV: "sandbox",
      VITE_PADDLE_PRICE_ID: "pri_test_123",
      VITE_ADMIN_EMAILS: "admin@example.com, second@example.com",
    }),
  },
});

const result = spawnSync(process.execPath, [outfile], { stdio: "inherit" });
process.exit(result.status ?? 1);
