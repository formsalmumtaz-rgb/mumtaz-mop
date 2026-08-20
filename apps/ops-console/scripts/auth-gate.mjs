#!/usr/bin/env node
// Auth gate for DEBT D6 — refuses to BUILD or START a console that would serve
// without a login anywhere but a local development machine.
//
// It runs in `prebuild` as well as `predev` because the throw inside
// authEnforced() otherwise surfaces during static prerendering, as
// `Error occurred prerendering page "/settings"` — a message that names a page
// instead of the environment variable that is actually wrong. Deploy logs are
// read in a hurry; the first line should say what to change.
//
// authEnforced() already fails closed and throws on the illegal combination.
// This runs that SAME function — imported, not restated — before the server
// binds a port, so a misconfigured machine stops with a readable sentence
// instead of 500-ing on whichever request happens to ask first, and so nobody
// discovers it from a tunnel. One rule, one place; a gate that reimplemented it
// would be a second rule waiting to drift.
import "./load-env.mjs";   // .env.local when present; the platform's env otherwise
import { authEnforced } from "../lib/auth-flags.ts";

try {
  if (authEnforced()) process.exit(0);     // enforced — the default, everywhere
} catch (e) {
  console.error(`
  REFUSING TO START — the console would run without a login.

  ${e.message}
`);
  process.exit(1);
}

// Development, opt-out taken. Legitimate — and loud, because a window left open
// with this banner in it is a window nobody should tunnel.
console.error(`
  ⚠  AUTH IS OFF — no login, every record readable by anyone who reaches this port.
     Permitted only because MOP_ENV=development. Localhost only.
     NEVER tunnel or port-forward this process. Use scripts/pilot.sh for that.
`);
