import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

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
    pathname.startsWith("/join") ||
    pathname.startsWith("/submit-deal") ||
    pathname.startsWith("/leasing-agent") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/twilio") ||
    pathname.startsWith("/api/book") ||
    pathname.startsWith("/api/stripe/checkout") ||
    pathname.startsWith("/api/stripe/portal") ||
    pathname === "/";

  // Redirect unauthenticated users to login (except public pages)
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname.startsWith("/login") || pathname.startsWith("/signup"))) {
    const redirectTo = request.nextUrl.searchParams.get("redirect");
    const url = request.nextUrl.clone();
    if (redirectTo && redirectTo.startsWith("/")) {
      url.pathname = redirectTo;
      url.search = "";
    } else {
      url.pathname = "/market-intel";
    }
    return NextResponse.redirect(url);
  }

  // For authenticated users on protected routes: auto-provision & auto-approve
  if (user && !isPublicRoute) {
    // Look up by email (reliable) — auth_provider_id may be NULL for admin-created users
    const { data: dbUser } = await supabase
      .from("users")
      .select("id, is_approved, is_active, auth_provider_id, org_id")
      .eq("email", user.email!)
      .limit(1)
      .maybeSingle();

    if (dbUser) {
      // Link auth_provider_id if missing (admin-created users)
      if (!dbUser.auth_provider_id) {
        await supabase
          .from("users")
          .update({ auth_provider_id: user.id })
          .eq("email", user.email!);
      }

      // Block unapproved or deactivated users
      if (!dbUser.is_approved || dbUser.is_active === false) {
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        return NextResponse.redirect(url);
      }
    } else {
      // No DB user found — auto-provision: create org + user
      // Extract org name from email domain
      const emailDomain = user.email?.split("@")[1] || "";
      const orgName = emailDomain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "protonmail.com", "mail.com"].includes(emailDomain.toLowerCase())
        ? emailDomain.split(".")[0].charAt(0).toUpperCase() + emailDomain.split(".")[0].slice(1)
        : "My Brokerage";
      const slug = `org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Create organization
      const referralCode = Math.random().toString(36).slice(2, 10);
      const { data: newOrg } = await supabase
        .from("organizations")
        .insert({
          name: orgName,
          slug,
          tier: "solo",
          subscription_status: "trialing",
          settings: {},
          referral_code: referralCode,
        })
        .select("id")
        .single();

      if (newOrg) {
        // Create user record
        const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
        await supabase
          .from("users")
          .insert({
            org_id: newOrg.id,
            auth_provider_id: user.id,
            email: user.email!,
            full_name: fullName,
            role: "owner",
            plan: "free",
            is_approved: true,
            is_active: true,
            usage_counters: {},
            notification_prefs: { email: true, push: true, sms: false },
          });

        // Referral attribution — read cookie set during signup
        const refCode = request.cookies.get("referral_code")?.value;
        if (refCode) {
          const { data: referringOrg } = await supabase
            .from("organizations")
            .select("id")
            .eq("referral_code", refCode)
            .limit(1)
            .maybeSingle();
          if (referringOrg && referringOrg.id !== newOrg.id) {
            await supabase
              .from("organizations")
              .update({ referred_by_org_id: referringOrg.id })
              .eq("id", newOrg.id);
          }
          // Clear the referral cookie
          supabaseResponse.cookies.set("referral_code", "", { maxAge: 0, path: "/" });
        }
      }
    }
  }

  // Prevent caching of the root route (landing page vs auth redirect)
  if (pathname === "/") {
    supabaseResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    supabaseResponse.headers.set("Pragma", "no-cache");
  }

  return supabaseResponse;
}
