"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

// Set the operator's active division (service line). Cookie-backed so every
// server flow that calls getServiceLineId() resolves to the chosen division.
export async function setActiveDivisionAction(fd: FormData): Promise<void> {
  const code = String(fd.get("division") ?? "").trim();
  const jar = await cookies();
  if (code) jar.set("mop_division", code, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  else jar.delete("mop_division");
  revalidatePath("/", "layout");
}
