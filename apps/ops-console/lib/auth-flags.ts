// Fail-closed auth enforcement (DEBT D6).
//
// The console holds every customer record, TRN and contact the business owns.
// Authentication is therefore ON unless something explicitly, narrowly and
// loudly turns it off — and the opt-out exists in exactly one place: a local
// development machine.
//
// The previous shape failed open by default in more places than anyone tracked:
// AUTH_REQUIRED=false sat in .env.local as the standing value, and the opt-out
// was honoured for MOP_ENV of development, dev, staging OR test. Any process
// that inherited that file — a `next start`, a script, a tunnel someone forgot
// was running — served the console with no login and said nothing. That is how
// it actually happened.
//
// Now:
//   · unset, empty, misspelled, "0", "no"  -> ENFORCED
//   · AUTH_REQUIRED=false in development    -> disabled (the one opt-out)
//   · AUTH_REQUIRED=false anywhere else     -> THROWS. Not "quietly enforced":
//     a machine configured to run without a login must stop, because the person
//     who set it believes auth is off and needs to find out that it is not.
//
// Edge-safe: reads env only, no imports (middleware runs on the edge runtime).

export class AuthMisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthMisconfiguredError";
  }
}

// The single environment in which the console may run without a login.
const DEV_ONLY = "development";

export function authEnforced(): boolean {
  const env = (process.env.MOP_ENV || "").toLowerCase().trim();
  const optOut = (process.env.AUTH_REQUIRED || "").toLowerCase().trim() === "false";
  if (!optOut) return true;                 // the default, everywhere
  if (env === DEV_ONLY) return false;       // the one sanctioned opt-out
  throw new AuthMisconfiguredError(
    `AUTH_REQUIRED=false is only permitted when MOP_ENV=${DEV_ONLY}; MOP_ENV is ` +
    `"${process.env.MOP_ENV ?? "(unset)"}". Refusing to serve. Remove AUTH_REQUIRED ` +
    `from this environment, or set MOP_ENV=${DEV_ONLY} if this really is a local ` +
    `development machine. The console must never be reachable without a login.`,
  );
}

// Same question, without the throw — for a startup gate that wants to report the
// misconfiguration itself rather than fail on the first request that asks.
export function authConfigProblem(): string | null {
  try { authEnforced(); return null; }
  catch (e) { return (e as Error).message; }
}
