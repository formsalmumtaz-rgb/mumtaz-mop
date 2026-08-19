#!/usr/bin/env bash
# pilot.sh — put BOTH apps on phone-testable HTTPS URLs for a real pilot day.
#
# Difference from phone-test.sh, and why it matters:
#   phone-test.sh tunnels ONLY the field app and keeps the admin console on
#   localhost, because the console had no login (DEBT D6). This script tunnels
#   both — so it FORCES AUTHENTICATION ON first. An admin console on a public URL
#   without a login would expose every customer record, TRN and contact you own.
#   That is why AUTH_REQUIRED is overridden here and not left to .env.local.
set -euo pipefail
cd "$(dirname "$0")/.."
PNPM="pnpm --config.verify-deps-before-run=false"
COMMIT=$(git rev-parse --short HEAD)

command -v cloudflared >/dev/null 2>&1 || {
  echo "cloudflared is not installed. Run this once, then re-run this script:"
  echo "    brew install cloudflared"
  exit 1
}

pids=()
cleanup() {
  echo; echo "Shutting down — both tunnel URLs are now dead."
  for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait_for() { for _ in $(seq 1 60); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done
  echo "!! $2 did not come up — see the log."; return 1; }

echo "Pilot build: $COMMIT"
echo
echo "1/5  Building both apps (production, not dev)…"
$PNPM --filter @mop/ops-console build >/tmp/mop-pilot-ops-build.log 2>&1 \
  || { echo "Console build failed — /tmp/mop-pilot-ops-build.log"; exit 1; }
$PNPM --filter @mop/field-pwa build  >/tmp/mop-pilot-field-build.log 2>&1 \
  || { echo "Field build failed — /tmp/mop-pilot-field-build.log"; exit 1; }

echo "2/5  Starting the console on :3100 WITH LOGIN ENFORCED…"
# AUTH_REQUIRED must not be "false" — authEnforced() only disables on an explicit
# dev opt-out, so anything else (or unset) means a login is required.
( cd apps/ops-console && AUTH_REQUIRED=true npm run start ) >/tmp/mop-pilot-ops.log 2>&1 &
pids+=($!)
wait_for http://localhost:3100/login "console"

echo "3/5  Starting the field app on :3200…"
$PNPM --filter @mop/field-pwa preview >/tmp/mop-pilot-field.log 2>&1 &
pids+=($!)
wait_for http://localhost:3200/ "field app"

echo "4/5  Tunnelling the field app…"
cloudflared tunnel --url http://localhost:3200 >/tmp/mop-tunnel-field.log 2>&1 &
pids+=($!)
echo "5/5  Tunnelling the console…"
cloudflared tunnel --url http://localhost:3100 >/tmp/mop-tunnel-ops.log 2>&1 &
pids+=($!)

sleep 12
FIELD=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/mop-tunnel-field.log | head -1)
OPS=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/mop-tunnel-ops.log | head -1)

cat <<EOF

  ┌──────────────────────────────────────────────────────────────────┐
  │  BUILD $COMMIT — check this hash in both footers before judging   │
  ├──────────────────────────────────────────────────────────────────┤
  │  TECHNICIANS (field app)                                          │
  │    ${FIELD:-<still starting — check /tmp/mop-tunnel-field.log>}
  │                                                                   │
  │  OFFICE (console — needs a login)                                 │
  │    ${OPS:-<still starting — check /tmp/mop-tunnel-ops.log>}
  └──────────────────────────────────────────────────────────────────┘

  Both URLs die when you press Ctrl-C here. Keep this window open all day.
EOF
wait
