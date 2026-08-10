import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { getTenantId } from "@/lib/tenant";
import { listServiceLines, getActiveServiceLineCode, type ServiceLine } from "@/lib/domain/reference";

export const metadata: Metadata = {
  title: "MOP Admin Console",
  description: "Mumtaz Operations Platform — master data maintenance",
};

// Divisions for the switcher. Guarded — on unauthenticated/login paths (no RLS
// context) this simply yields no divisions and the switcher is hidden.
async function safeDivisions(): Promise<{ divisions: ServiceLine[]; active: string | null }> {
  try {
    const tenantId = await getTenantId();
    const [divisions, active] = await Promise.all([listServiceLines(tenantId), getActiveServiceLineCode()]);
    return { divisions, active };
  } catch {
    return { divisions: [], active: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { divisions, active } = await safeDivisions();
  return (
    <html lang="en">
      <body>
        <AppShell divisions={divisions} activeDivision={active}>{children}</AppShell>
      </body>
    </html>
  );
}
