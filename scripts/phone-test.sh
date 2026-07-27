#!/usr/bin/env bash
# phone-test.sh — put the FIELD PWA on a phone-testable HTTPS URL.
#
# What it does, and why it's safe:
#   • Serves the field app on localhost:3200 and opens ONE Cloudflare tunnel to it.
#   • The admin/API server (ops-console) runs on localhost:3100 and is NEVER tunnelled.
#     The field app reaches the API through a same-origin /api proxy that forwards to
#     localhost:3100 — so the admin console (which has no login yet, DEBT.md D6) stays
#     on your Mac only.
#
# Usage:   ./scripts/phone-test.sh
#   Watch for the  https://something.trycloudflare.com  line — that is your phone URL.
#   Press Ctrl-C in this window when you're done; everything shuts down and the URL dies.

set -euo pipefail
cd "$(dirname "$0")/.."
PNPM="pnpm --config.verify-deps-before-run=false"

pids=()
cleanup() {
  echo
  echo "Shutting down (tunnel URL is now dead, admin server stopped)…"
  for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait_for() { # wait_for <url> <label>
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null "$1" && return 0
    sleep 1
  done
  echo "!! $2 did not come up — check the log above."; return 1
}

echo "1/4  Building the field app…"
$PNPM --filter @mop/field-pwa build >/tmp/mop-phone-build.log 2>&1 \
  || { echo "Build failed — see /tmp/mop-phone-build.log"; exit 1; }

echo "2/4  Starting the admin/API server on localhost:3100 (stays on your Mac only)…"
$PNPM --filter @mop/ops-console dev >/tmp/mop-phone-ops.log 2>&1 &
pids+=($!)

echo "3/4  Starting the field app on localhost:3200…"
$PNPM --filter @mop/field-pwa preview >/tmp/mop-phone-field.log 2>&1 &
pids+=($!)
wait_for http://localhost:3200/ "field app"

echo "4/4  Opening the HTTPS tunnel to the field app only…"
echo
echo "   ┌───────────────────────────────────────────────────────────────┐"
echo "   │  Look below for a line like:                                   │"
echo "   │     https://<random-words>.trycloudflare.com                   │"
echo "   │  Open THAT on your phone. Keep this window open while testing. │"
echo "   │  Press Ctrl-C here to stop and kill the URL.                   │"
echo "   └───────────────────────────────────────────────────────────────┘"
echo
cloudflared tunnel --url http://localhost:3200
