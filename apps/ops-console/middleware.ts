import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authEnforced } from "@/lib/auth-flags";

// Auth gate. When enforcement is on (fail-closed default), any page request
// without a valid Supabase session is redirected to /login. Public paths
// (/login, /auth/*) are exempt; /api/* is excluded by the matcher (those system
// routes self-authorize via their own secrets/device tokens). Also refreshes the
// session cookies on each request (standard @supabase/ssr pattern).
// /brand holds the company logo files that branded EMAILS reference by URL.
// They must be reachable without a session: mail clients fetch them anonymously,
// and until this exemption existed every email logo redirected to /login and
// rendered as a broken image in the recipient's inbox.
const PUBLIC = ["/login", "/auth", "/brand"];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  if (!authEnforced()) return res; // explicit dev/staging opt-out

  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return res;

  // Fail closed, legibly, if the Supabase client can't be built. When these public
  // (NEXT_PUBLIC_) vars are missing on a deployment, createServerClient throws
  // "Your project's URL and Key are required", surfacing as an opaque 500 with a
  // digest on EVERY protected page (the production 500, digest 6663152226). We
  // must not fail open (that would bypass the auth gate), so return a clear 503
  // naming the missing var instead of crashing. The var NAMES are not secrets.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    const missing = [
      !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
      !supabaseAnon && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    return new NextResponse(
      `Server configuration error: ${missing} is not set for this deployment.\n` +
        `Set it in the hosting environment (Vercel → Project → Settings → Environment ` +
        `Variables, scope: Production) and redeploy.`,
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnon,
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
