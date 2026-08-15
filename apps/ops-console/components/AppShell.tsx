"use client";
import { usePathname } from "next/navigation";
import { SideNav } from "./SideNav";
import { CommandK } from "./CommandK";
import type { ServiceLine } from "@/lib/domain/reference";

// Renders the navigation shell for authenticated pages. Login / auth routes are
// shown bare (no sidebar) so the sign-in screen stands alone.
export function AppShell({ children, divisions, activeDivision, commit }: {
  children: React.ReactNode;
  divisions: ServiceLine[];
  activeDivision: string | null;
  commit?: string;
}) {
  const pathname = usePathname() ?? "";
  const bare = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (bare) return <main className="min-h-screen">{children}</main>;

  return (
    <div className="min-h-screen lg:pl-60">
      <SideNav divisions={divisions} activeDivision={activeDivision} commit={commit} />
      <CommandK />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
