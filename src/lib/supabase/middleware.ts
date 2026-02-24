import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/pending-approval") ||
    pathname.startsWith("/book") ||
    pathname === "/";

  // Redirect unauthenticated users to login (except public pages)
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname.startsWith("/login") || pathname.startsWith("/signup"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/market-intel";
    return NextResponse.redirect(url);
  }

  // Check account approval + active status for authenticated users on protected routes
  if (user && !isPublicRoute) {
    // Look up by email (reliable) — auth_provider_id may be NULL for admin-created users
    const { data: dbUser } = await supabase
      .from("users")
      .select("is_approved, is_active, auth_provider_id")
      .eq("email", user.email!)
      .limit(1)
      .maybeSingle();

    if (!dbUser || !dbUser.is_approved || dbUser.is_active === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending-approval";
      return NextResponse.redirect(url);
    }

    // Link auth_provider_id if missing (admin-created users)
    if (dbUser && !dbUser.auth_provider_id) {
      await supabase
        .from("users")
        .update({ auth_provider_id: user.id })
        .eq("email", user.email!);
    }
  }

  return supabaseResponse;
}
