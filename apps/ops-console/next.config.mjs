import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The machine's secrets live in the REPO-ROOT .env.local (one file, shared by
// the worker, the scripts and both apps — "nothing gets re-entered"). Next only
// reads env files from this package directory, so load the root file here
// first; anything already set (the shell, Vercel, or this package's own
// .env.local) wins, so hosted deployments are unaffected.
const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = join(here, "..", "..", ".env.local");
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mop/domain", "@mop/worker", "@mop/documents"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
