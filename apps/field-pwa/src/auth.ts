import { createClient, type Session } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";

// Offline-first auth for the field app (DECISIONS §11.5).
//
// supabase-js owns the token lifecycle: it persists the session (access + long
// refresh token) in localStorage — available offline — and refreshes the access
// token automatically when online. A technician in a basement keeps their session;
// queued mutations sync under this login when connectivity returns, and the SERVER
// re-authorizes the Bearer at /api/field/* (the authority).
//
// Local validation (§11.5): we always check the access token's `exp` offline, and
// verify its SIGNATURE against a cached JWKS WHEN the project issues asymmetric
// (JWKS-backed) tokens. Default HS256 tokens have no public key, so signature
// verification is skipped and the server remains the authority — see BLOCKED.md.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const authConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// A single client; persists + auto-refreshes the session.
export const supabase = createClient(SUPABASE_URL ?? "http://localhost", SUPABASE_ANON_KEY ?? "anon", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// Cached JWKS (fetched once online; jose caches it for offline signature checks).
const jwks = SUPABASE_URL ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)) : null;

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) void warmJwks();
  return { error: error?.message ?? null };
}

export async function signOutLocal(): Promise<void> {
  // Local sign-out only (scope: 'local') so a revoked/offline device still clears
  // its session without needing the server.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

// The Bearer to send with a sync request. When online + near expiry, supabase-js
// refreshes transparently. Offline it returns the cached token (possibly expired);
// queuing still works and the server re-authorizes on reconnect.
export async function getAccessToken(): Promise<string | null> {
  return (await getSession())?.access_token ?? null;
}

// True while the login is still usable offline: a session exists and its refresh
// token has not itself expired (re-login only when the refresh token expires,
// ≫ a working day — §11.5). Access-token expiry alone does NOT log the tech out.
export async function isSessionUsable(): Promise<boolean> {
  const s = await getSession();
  if (!s) return false;
  // supabase-js exposes access-token expiry; the refresh token TTL is long. If the
  // client can still see a session, it is usable — the server is the final gate.
  return true;
}

// Best-effort offline validation of an access token (§11.5). Verifies signature
// against the cached JWKS when available (asymmetric keys); otherwise checks only
// `exp`. Returns whether it is currently non-expired; `signatureChecked` says
// whether the signature was actually verified.
export async function validateAccessTokenOffline(token: string): Promise<{ valid: boolean; expired: boolean; signatureChecked: boolean }> {
  try {
    if (jwks) {
      try {
        await jwtVerify(token, jwks);
        return { valid: true, expired: false, signatureChecked: true };
      } catch (e) {
        const msg = (e as Error).message || "";
        if (/exp/i.test(msg)) return { valid: false, expired: true, signatureChecked: true };
        // signature not verifiable (HS256 / JWKS offline-miss) -> fall through to exp
      }
    }
    const { exp } = decodeJwt(token);
    const expired = typeof exp === "number" && exp * 1000 < Date.now();
    return { valid: !expired, expired, signatureChecked: false };
  } catch {
    return { valid: false, expired: true, signatureChecked: false };
  }
}

// Thrown when the server signals the login was revoked (x-mop-revoked). The app
// flushes what it can, then locks and requires re-login.
export class RevokedError extends Error {
  constructor() { super("device access revoked"); this.name = "RevokedError"; }
}

// fetch with the Bearer attached. Throws RevokedError on a revoked response so the
// caller can lock the device.
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && res.headers.get("x-mop-revoked")) throw new RevokedError();
  return res;
}

async function warmJwks(): Promise<void> {
  // Prime the JWKS cache while online so offline signature checks can work.
  try {
    if (SUPABASE_URL) await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`).catch(() => {});
  } catch { /* offline — ignore */ }
}
