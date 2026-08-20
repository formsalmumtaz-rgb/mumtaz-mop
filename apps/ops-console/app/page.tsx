import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { destinationFor } from "@/lib/routing";
import { authEnforced } from "@/lib/auth-flags";
import Link from "next/link";

// THE one entry point. Everyone signs in here; where they land is decided by
// their role, after authentication, not by which URL they were told to bookmark.
export const dynamic = "force-dynamic";

export default async function EntryPage() {
  if (!authEnforced()) redirect("/dashboard");   // dev opt-out: straight through
  const session = await getSession();
  const dest = destinationFor(session);

  if (dest.kind === "pending") redirect("/pending");
  if (dest.kind === "field") redirect(dest.url);
  if (dest.kind === "console") redirect(dest.url);

  // Holds both. Ask rather than guess.
  return (
    <div className="mx-auto mt-24 max-w-md px-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Welcome{session?.fullName ? `, ${session.fullName}` : ""}</h1>
        <p className="mt-2 text-sm text-neutral-600">You have access to both. Where are you working today?</p>
        <div className="mt-6 space-y-3">
          <a href={dest.field}
             className="block rounded-lg border-2 border-brand bg-brand px-4 py-4 text-center font-medium text-white hover:bg-brand-dark">
            📱 The field app
            <span className="mt-0.5 block text-xs font-normal opacity-90">Jobs, chemicals, the day. Works with no signal.</span>
          </a>
          <Link href={dest.console}
             className="block rounded-lg border-2 border-neutral-300 px-4 py-4 text-center font-medium text-neutral-800 hover:bg-neutral-50">
            💼 The office console
            <span className="mt-0.5 block text-xs font-normal text-neutral-500">Customers, scheduling, invoicing, reports.</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
