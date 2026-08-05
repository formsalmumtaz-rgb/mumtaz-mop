import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Cookie-bound Supabase client for Server Components / Route Handlers / Actions.
// Handles session refresh transparently (the refresh-token flow that also backs
// the field app's offline sessions, DECISIONS §11.5).
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component render — safe to ignore; middleware refreshes.
          }
        },
      },
    },
  );
}
