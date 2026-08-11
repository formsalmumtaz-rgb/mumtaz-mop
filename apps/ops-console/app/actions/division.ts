"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Set the operator's active division (service line). Cookie-backed so every
// server flow that calls getServiceLineId() resolves to the chosen division.
// We REDIRECT back to the current page after setting the cookie (rather than only
// revalidating) so the whole tree re-renders against the new cookie in one clean
// navigation — no stale render, no reverting select.
export async function setActiveDivisionAction(fd: FormData): Promise<void> {
  const code = String(fd.get("division") ?? "").trim();
  const rawTo = String(fd.get("redirect_to") ?? "").trim();
  // Only allow same-app relative paths (never an open redirect).
  const to = rawTo.startsWith("/") && !rawTo.startsWith("//") ? rawTo : "/dashboard";
  const jar = await cookies();
  if (code) jar.set("mop_division", code, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  else jar.delete("mop_division");
  redirect(to);
}
