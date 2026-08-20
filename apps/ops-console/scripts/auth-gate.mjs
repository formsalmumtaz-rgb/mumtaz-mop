#!/usr/bin/env node
// Startup gate for DEBT D6 — refuses to start a console that would serve
// without a login anywhere but a local development machine.
//
// authEnforced() already fails closed and throws on the illegal combination.
// This runs that SAME function — imported, not restated — before the server
// binds a port, so a misconfigured machine stops with a readable sentence
// instead of 500-ing on whichever request happens to ask first, and so nobody
// discovers it from a tunnel. One rule, one place; a gate that reimplemented it
// would be a second rule waiting to drift.
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
