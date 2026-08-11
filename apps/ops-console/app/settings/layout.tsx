import { requireView } from "@/lib/auth";

// Server-side authorization for the entire /settings/* admin area (master data,
// users, divisions, system settings). A user without settings.manage is
// redirected — they cannot view these pages by typing the URL, not just by the
// menu being hidden. Individual write actions keep their own requirePermission.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireView("settings.manage");
  return <>{children}</>;
}
