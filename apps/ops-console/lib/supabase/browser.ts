"use client";
import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client for the login form (and, later, the field PWA which
// validates the JWT locally for offline use — DECISIONS §11.5).
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
