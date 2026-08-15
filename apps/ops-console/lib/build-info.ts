import "server-only";
import { execSync } from "node:child_process";

// The commit this console is serving — footer proof against stale-build
// disputes. Vercel injects VERCEL_GIT_COMMIT_SHA; locally we ask git once.
let cached: string | null = null;
export function buildCommit(): string {
  if (cached) return cached;
  cached =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    (() => {
      try { return execSync("git rev-parse --short HEAD", { cwd: process.cwd() }).toString().trim(); }
      catch { return "unknown"; }
    })();
  return cached;
}
