import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authEnforced } from "@/lib/auth-flags";

// Auth gate. When enforcement is on (fail-closed default), any page request
// without a valid Supabase session is redirected to /login. Public paths
// (/login, /auth/*) are exempt; /api/* is excluded by the matcher (those system
// routes self-authorize via their own secrets/device tokens). Also refreshes the
// session cookies on each request (standard @supabase/ssr pattern).
const PUBLIC = ["/login", "/auth"];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  if (!authEnforced()) return res; // explicit dev/staging opt-out

  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return res;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  // Exclude API (system routes), Next internals, and static assets.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
