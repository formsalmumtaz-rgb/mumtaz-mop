import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Handles Supabase redirects (invite acceptance, password recovery, magic link):
// exchanges the code for a session cookie, then continues to `next`.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const next = url.searchParams.get("next") ?? "/";
  return NextResponse.redirect(new URL(next, url.origin));
}
