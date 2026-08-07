// Fail-closed auth enforcement flag — same principle as the costing gate.
// Auth is ENFORCED by default. It can be turned off ONLY by an explicit
// development/staging opt-out; unset, misspelled, or production ⇒ enforced.
// A deployment that forgets the flag refuses access rather than granting it.
// Edge-safe: reads env only, no imports (middleware runs on the edge runtime).
export function authEnforced(): boolean {
  const env = (process.env.MOP_ENV || "").toLowerCase().trim();
  const devEnv = ["development", "dev", "staging", "test"].includes(env);
  const optOut = (process.env.AUTH_REQUIRED || "").toLowerCase().trim() === "false";
  return !(devEnv && optOut);
}
