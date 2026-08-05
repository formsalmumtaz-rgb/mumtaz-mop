import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client — used ONLY by the admin-driven invite flow to create auth
// users on behalf of a logged-in admin. Never exposed to the browser. The invited
// user sets their own password via the emailed link (we never handle passwords).
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
