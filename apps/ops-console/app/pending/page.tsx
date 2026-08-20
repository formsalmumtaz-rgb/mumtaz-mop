import { getPendingIdentity } from "@/lib/auth";

// Where a self-registered sign-in lands (mig 137).
//
// The person authenticated with Google successfully — Supabase has a session —
// but getSession() returns null because no human has approved them, so every
// guarded page bounces them to /login, which bounces them back here in a loop
// that reads as "the app is broken". They get a sentence instead.
//
// Deliberately: no data, no nav, no partial app. Their own name and address,
// which they just typed into Google themselves, and nothing else. This page
// reads auth directly rather than through getSession() precisely because
// getSession() is what refuses them.
export const dynamic = "force-dynamic";

export default async function PendingPage() {
  // The identity read lives in lib/auth.ts, with the rest of the bootstrap —
  // pages do not touch the pool directly (the RLS gate enforces that, and it
  // caught this page when it did).
  const who = await getPendingIdentity();
  const email = who?.email ?? null;
  const name = who?.fullName ?? null;
  const status = who?.status ?? null;

  const deactivated = status === "deactivated";

  return (
    <div className="mx-auto mt-24 max-w-md px-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
          {deactivated ? "🔒" : "⏳"}
        </div>
        <h1 className="text-xl font-semibold">
          {deactivated ? "Your access has ended" : "Your account is awaiting approval"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          {deactivated
            ? "This account has been deactivated. If you think that is a mistake, speak to your supervisor or the office."
            : "You have signed in successfully. Someone at the office needs to confirm who you are and what you do before your account is switched on. You do not need to do anything else — try again once they tell you it is ready."}
        </p>
        {(name || email) && (
          <div className="mt-5 rounded-md bg-neutral-50 px-4 py-3 text-left text-sm">
            {name && <div className="font-medium text-neutral-800">{name}</div>}
            {email && <div className="text-neutral-500">{email}</div>}
          </div>
        )}
        <p className="mt-5 text-xs text-neutral-400">
          Show this screen to whoever is setting you up — it has the details they need.
        </p>
      </div>
    </div>
  );
}
