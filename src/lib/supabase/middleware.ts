import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ── Rate Limiting (Upstash Redis) ────────────────────────────
// Inline import check to avoid breaking middleware if Upstash not configured
let _rateLimitEnabled: boolean | null = null;
function isRateLimitConfigured(): boolean {
  if (_rateLimitEnabled === null) {
    _rateLimitEnabled = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  }
  return _rateLimitEnabled;
}

async function checkGlobalRateLimit(request: NextRequest): Promise<NextResponse | null> {
  if (!isRateLimitConfigured()) return null;
  if (!request.nextUrl.pathname.startsWith("/api/")) return null;

  try {
    // Dynamic import to avoid bundling issues in edge middleware
    const { Ratelimit } = await import("@upstash/ratelimit");
    const { Redis } = await import("@upstash/redis");

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "rl:global",
    });

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const result = await limiter.limit(ip);
    if (!result.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": result.limit.toString(),
            "X-RateLimit-Remaining": result.remaining.toString(),
            "X-RateLimit-Reset": result.reset.toString(),
            "Retry-After": Math.ceil(Math.max(0, (result.reset - Date.now()) / 1000)).toString(),
          },
        },
      );
    }
  } catch (e) {
    // Rate limit failure should not block requests — log and continue
    console.error("[Rate Limit] Middleware error:", e);
  }
  return null;
}

export async function updateSession(request: NextRequest) {
  // ── Global Rate Limit Check (API routes only) ──────────────
  const rateLimitResponse = await checkGlobalRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
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
    pathname.startsWith("/sign/") ||
    pathname.startsWith("/screen/") ||
    pathname.startsWith("/leasing-agent") ||
    pathname.startsWith("/chat/") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/api/onboarding") ||
    pathname.startsWith("/api/screen/") ||
    pathname.startsWith("/api/screening/") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/twilio") ||
    pathname.startsWith("/api/book") ||
    pathname.startsWith("/api/automations/cron") ||
    pathname.startsWith("/api/terminal/") ||
    pathname.startsWith("/api/intel/condo-units-refresh") ||
    pathname.startsWith("/api/intel/acris-sync") ||
    pathname.startsWith("/api/intel/hpd-mdr-sync") ||
    pathname.startsWith("/api/intel/exemptions-refresh") ||
    pathname.startsWith("/api/intel/tax-liens-sync") ||
    pathname.startsWith("/api/intel/nys-corps-sync") ||
    pathname.startsWith("/api/intel/ofac-sync") ||
    pathname.startsWith("/api/intel/resolve-edges") ||
    pathname.startsWith("/api/intel/mortgage-sync") ||
    pathname.startsWith("/api/intel/distress-recompute") ||
    pathname.startsWith("/api/intel/building-signals-recompute") ||
    pathname.startsWith("/api/intel/unresolved") ||
    pathname.startsWith("/api/health/") ||
    pathname.startsWith("/api/mobile") ||
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
      .select("id, is_approved, is_active, auth_provider_id, org_id, last_login_at")
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

      // Track last_login_at. Threshold de-bounces to "first activity per
      // 5-min window" — catches fresh sign-ins (NULL or old) without
      // writing on every page nav. Fire-and-forget; errors go to logs.
      const FIVE_MIN_MS = 5 * 60 * 1000;
      const lastLoginMs = dbUser.last_login_at
        ? new Date(dbUser.last_login_at).getTime()
        : 0;
      if (Date.now() - lastLoginMs > FIVE_MIN_MS) {
        const { error } = await supabase
          .from("users")
          .update({ last_login_at: new Date().toISOString() })
          .eq("email", user.email!);
        if (error) console.error("[middleware] last_login_at update failed:", error);
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
