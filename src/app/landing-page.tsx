"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ============================================================
// Scroll-reveal hook
// ============================================================
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); io.unobserve(el); } },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

// ============================================================
// Animated counter
// ============================================================
function AnimatedStat({ value, suffix, label }: { value: string; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState("0");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) { setStarted(true); io.unobserve(el); } },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const numericPart = value.replace(/[^0-9.]/g, "");
    const target = parseFloat(numericPart) || 0;
    const prefix = value.replace(/[0-9.]+.*/, "");
    const hasDot = value.includes(".");
    const duration = 1200;
    const steps = 40;
    const interval = duration / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = Math.min(step / steps, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;
      setDisplay(prefix + (hasDot ? current.toFixed(0) : Math.round(current).toString()));
      if (step >= steps) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [started, value]);

  return (
    <div ref={ref} className="text-center">
      <p className="text-3xl md:text-4xl font-bold text-white">
        {started ? display : "0"}{suffix && <span>{suffix}</span>}
      </p>
      <p className="text-xs md:text-sm text-slate-400 mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}

// ============================================================
// SVG Icons
// ============================================================
function IconSearch() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}
function IconCalculator() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.25-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008zm2.25-4.5h.008v.008H15v-.008zm0 2.25h.008v.008H15v-.008zM4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}
function IconMap() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}
function IconPhone() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
function IconArrowRight() {
  return (
    <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}
function IconChevronDown() {
  return (
    <svg className="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// ============================================================
// Landing Page
// ============================================================
export default function LandingPage() {
  const r1 = useReveal();
  const r2 = useReveal();
  const r3 = useReveal();
  const r4 = useReveal();
  const r5 = useReveal();
  const r6 = useReveal();
  const r7 = useReveal();
  const r8 = useReveal();

  const scrollToFeatures = useCallback(() => {
    document.getElementById("intelligence")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="bg-[#060A14] text-white min-h-screen overflow-x-hidden">
      {/* ============================================================ */}
      {/* NAV                                                          */}
      {/* ============================================================ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#060A14]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            Vettd<span className="text-blue-500">RE</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <button onClick={scrollToFeatures} className="hover:text-white transition-colors">Features</button>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">
              Sign in
            </Link>
            <Link href="/signup" className="text-sm font-medium bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-colors">
              Request Early Access
            </Link>
          </div>
        </div>
      </nav>

      {/* ============================================================ */}
      {/* HERO                                                         */}
      {/* ============================================================ */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 px-4 sm:px-6 lg:px-8">
        {/* Glow effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-600/10 rounded-full blur-[128px] pointer-events-none" />
        <div className="absolute top-20 right-1/4 w-[400px] h-[400px] bg-violet-600/8 rounded-full blur-[96px] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/20 bg-blue-500/5 text-blue-400 text-xs font-medium mb-8"
            style={{ animation: "fade-in 0.6s ease" }}>
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
            Now live in NYC, NYS, and NJ
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6"
            style={{ animation: "reveal-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s both" }}>
            Know every{" "}
            <span className="relative inline-block">
              building
              <span className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full" />
            </span>
            .{" "}
            <br className="hidden sm:block" />
            Reach every{" "}
            <span className="relative inline-block">
              owner
              <span className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-blue-500 rounded-full" />
            </span>
            .
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
            style={{ animation: "reveal-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.25s both" }}>
            14+ data sources fused into one intelligent building profile. Search properties, unmask LLC owners, model deals, and close — all on one platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
            style={{ animation: "reveal-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.4s both" }}>
            <Link href="/signup"
              className="group inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30">
              Request Early Access
              <IconArrowRight />
            </Link>
            <button onClick={scrollToFeatures}
              className="inline-flex items-center gap-2 px-6 py-3 text-slate-400 hover:text-white font-medium transition-colors">
              See How It Works
              <IconChevronDown />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="max-w-3xl mx-auto mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12"
          style={{ animation: "reveal-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.55s both" }}>
          <AnimatedStat value="14" suffix="+" label="Data Sources Fused" />
          <AnimatedStat value="1" suffix="M+" label="Buildings Indexed" />
          <AnimatedStat value="3" label="Markets Live" />
          <AnimatedStat value="95" suffix="%" label="Owner Match Rate" />
        </div>
      </section>

      {/* ============================================================ */}
      {/* PRODUCT MOCKUP                                               */}
      {/* ============================================================ */}
      <section className="relative px-4 sm:px-6 lg:px-8 pb-24">
        <div ref={r1} className="reveal-scale max-w-5xl mx-auto">
          <div className="rounded-2xl border border-white/10 bg-[#0C1220] shadow-2xl shadow-blue-900/10 overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#0A0F1E]">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-white/10" />
                <span className="w-3 h-3 rounded-full bg-white/10" />
                <span className="w-3 h-3 rounded-full bg-white/10" />
              </div>
              <div className="flex-1 mx-4">
                <div className="max-w-sm mx-auto h-6 rounded-md bg-white/5 flex items-center px-3">
                  <span className="text-[10px] text-slate-500">app.vettdre.com/market-intel/building/1-00547-0001</span>
                </div>
              </div>
            </div>

            {/* App mockup */}
            <div className="p-4 md:p-6">
              {/* Header bar */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">255 West 84th Street</h3>
                  <p className="text-xs text-slate-500">Manhattan, NY 10024 · BBL: 1-00547-0001</p>
                </div>
                <div className="flex gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium">Investment Score: 82</span>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">Distress: 67</span>
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Units", value: "24", sub: "Residential" },
                  { label: "Year Built", value: "1928", sub: "Pre-war" },
                  { label: "Assessed Value", value: "$4.2M", sub: "DOF 2024" },
                  { label: "Last Sale", value: "$8.7M", sub: "03/2019 · ACRIS" },
                ].map(item => (
                  <div key={item.label} className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                    <p className="text-sm font-semibold text-white">{item.value}</p>
                    <p className="text-[10px] text-slate-600">{item.sub}</p>
                  </div>
                ))}
              </div>

              {/* Data sources bar */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
                {[
                  { label: "HPD Violations", val: "12 open", color: "text-red-400" },
                  { label: "DOB Permits", val: "3 active", color: "text-blue-400" },
                  { label: "Rent Stabilized", val: "18 units", color: "text-violet-400" },
                  { label: "LL84 Grade", val: "C", color: "text-amber-400" },
                  { label: "RPIE Filed", val: "Non-compliant", color: "text-red-400" },
                  { label: "Energy (EUI)", val: "142.3 kBTU", color: "text-amber-400" },
                ].map(item => (
                  <div key={item.label} className="bg-white/[0.03] rounded-lg p-2.5 border border-white/5">
                    <p className="text-[10px] text-slate-500 mb-0.5">{item.label}</p>
                    <p className={`text-xs font-medium ${item.color}`}>{item.val}</p>
                  </div>
                ))}
              </div>

              {/* Owner section */}
              <div className="bg-white/[0.03] rounded-lg p-4 border border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Registered Owner</p>
                    <p className="text-sm font-semibold text-white">84TH ST ASSOCIATES LLC</p>
                    <p className="text-xs text-slate-500 mt-0.5">Managing Agent: David Chen · HPD Registration</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 mb-1">Related Entities</p>
                    <p className="text-xs text-blue-400 font-medium">4 other properties found</p>
                    <p className="text-[10px] text-slate-600">via ACRIS + NYS Corp</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* INTELLIGENCE LAYER                                           */}
      {/* ============================================================ */}
      <section id="intelligence" className="relative py-24 md:py-32 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent pointer-events-none" />

        <div ref={r2} className="reveal max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Every building,{" "}
              <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">fully understood</span>.
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              We fuse 14+ public data sources into one intelligent profile — so you see what others miss.
            </p>
          </div>

          {/* Data source badges */}
          <div className="flex flex-wrap justify-center gap-2 mb-16">
            {["PLUTO", "ACRIS", "HPD", "DOB", "DOF", "LL84", "RPIE", "NYS Rolls", "NJ MOD-IV", "NY Corps", "Census", "Geocodio", "Brave Search", "Apollo.io"].map((src) => (
              <span key={src} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400 font-medium hover:bg-white/10 hover:text-slate-300 transition-colors">
                {src}
              </span>
            ))}
          </div>

          {/* Three feature cards */}
          <div className="grid md:grid-cols-3 gap-6">
            <IntelCard
              title="Distress Scoring"
              description="Every building gets a 0-100 distress score based on RPIE non-compliance, violations, LL97 penalties, hold time, and more. Find motivated sellers before anyone else."
              gradient="from-red-500/20 to-amber-500/20"
              icon={<span className="text-2xl">🔥</span>}
            />
            <IntelCard
              title="LLC Piercing"
              description="We cross-reference ACRIS deed holders, HPD registrations, NYS corporate filings, and Apollo.io to reveal the real person behind any LLC — and every other entity they control."
              gradient="from-violet-500/20 to-blue-500/20"
              icon={<span className="text-2xl">🔍</span>}
            />
            <IntelCard
              title="Investment Scoring"
              description="Automated opportunity detection — excess FAR, below-market comps, energy retrofit potential, and rent gaps surfaced instantly for every property."
              gradient="from-emerald-500/20 to-cyan-500/20"
              icon={<span className="text-2xl">📈</span>}
            />
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* FEATURES GRID                                                */}
      {/* ============================================================ */}
      <section id="features" className="py-24 md:py-32 px-4 sm:px-6 lg:px-8">
        <div ref={r3} className="reveal max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              From search to close.{" "}
              <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">One platform.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={<IconSearch />}
              title="Market Intelligence"
              description="Search 1M+ properties across NYC, NYS, and NJ. Advanced filters, map view, radius search, and real-time web listings."
            />
            <FeatureCard
              icon={<IconCalculator />}
              title="AI Deal Modeler"
              description="AI-powered underwriting that calibrates to actual census data, LL84 energy costs, and web-sourced market rents. Not just spreadsheets — intelligence."
            />
            <FeatureCard
              icon={<IconTarget />}
              title="Owner Prospecting"
              description="Find building owners through HPD registrations, ACRIS deed records, and NYS corporate filings. Skip-trace with People Data Labs and Apollo.io."
            />
            <FeatureCard
              icon={<IconChart />}
              title="GP/LP Promote Builder"
              description="Structure partnership deals with customizable waterfall models. Calculate GP and LP returns, sensitivity tables, and investor-ready summaries."
            />
            <FeatureCard
              icon={<IconMap />}
              title="Neighborhood Profiles"
              description="Census-powered demographics for every block — median income, rent levels, vacancy rates, housing stock, and 5-year trends."
            />
            <FeatureCard
              icon={<IconPhone />}
              title="Built-In Communications"
              description="Purchase a local phone number, send SMS directly from building profiles, and manage all conversations in one inbox."
            />
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* HOW IT WORKS                                                 */}
      {/* ============================================================ */}
      <section id="how-it-works" className="relative py-24 md:py-32 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent pointer-events-none" />

        <div ref={r4} className="reveal max-w-4xl mx-auto relative">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Three steps to your next deal.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              step="01"
              title="Search"
              description="Find properties using 20+ filters — units, value, building class, distress signals, energy grades. Or let the map show you what's in any neighborhood."
            />
            <StepCard
              step="02"
              title="Analyze"
              description="Open any building's full intelligence profile. Violations, permits, ownership chains, energy grades, comps, and census demographics — all in one view."
            />
            <StepCard
              step="03"
              title="Act"
              description="Model the deal with AI underwriting, structure the partnership, reach the owner by SMS or call, and move it through your pipeline. Search to close, without leaving VettdRE."
            />
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* PRICING                                                      */}
      {/* ============================================================ */}
      <section id="pricing" className="py-24 md:py-32 px-4 sm:px-6 lg:px-8">
        <div ref={r5} className="reveal max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Plans for every stage.</h2>
            <p className="text-slate-400">Start free. Scale when you're ready.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            <PricingCard
              name="Free"
              price="$0"
              description="Get started with NYC Market Intel"
              features={[
                "NYC Market Intel (5/day)",
                "Basic building profiles",
                "Public data sources",
              ]}
            />
            <PricingCard
              name="Explorer"
              price="$59"
              description="Expand to NYS & NJ markets"
              features={[
                "NYC + NYS + NJ markets",
                "Full building profiles",
                "Neighborhood demographics",
                "Corporate filings (basic)",
                "Unlimited searches",
              ]}
            />
            <PricingCard
              name="Pro"
              price="$219"
              description="Full intelligence & deal tools"
              highlighted
              features={[
                "Everything in Explorer",
                "Contact info + Apollo enrichment",
                "Deal Modeler + AI underwriting",
                "GP/LP Promote builder",
                "Phone & SMS",
                "Web intelligence",
                "Full LLC piercing",
              ]}
            />
            <PricingCard
              name="Team"
              price="$399"
              description="Collaborate across your firm"
              features={[
                "Everything in Pro",
                "Investor management",
                "Waterfall templates",
                "Sensitivity analysis",
                "Multiple phone numbers",
                "Team member seats",
              ]}
            />
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* TRUST SIGNALS                                                */}
      {/* ============================================================ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div ref={r6} className="reveal max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for NYC real estate professionals.</h2>
          <p className="text-slate-400 mb-12 max-w-xl mx-auto">
            VettdRE is used by multifamily investors, brokers, and acquisitions teams across the tri-state area.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: "🏛️", text: "Official NYC, NYS & NJ government data" },
              { icon: "🔒", text: "Bank-grade encryption" },
              { icon: "⚡", text: "Real-time data — no stale feeds" },
              { icon: "💳", text: "No credit card required" },
            ].map(item => (
              <div key={item.text} className="flex flex-col items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-2xl">{item.icon}</span>
                <p className="text-sm text-slate-400 leading-snug">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* FOOTER CTA                                                   */}
      {/* ============================================================ */}
      <section className="py-24 md:py-32 px-4 sm:px-6 lg:px-8">
        <div ref={r7} className="reveal max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Stop searching.{" "}
            <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">Start closing.</span>
          </h2>
          <p className="text-lg text-slate-400 mb-8">
            Join the next generation of real estate intelligence.
          </p>
          <Link href="/signup"
            className="group inline-flex items-center px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30">
            Request Early Access
            <IconArrowRight />
          </Link>
        </div>
      </section>

      {/* ============================================================ */}
      {/* FOOTER                                                       */}
      {/* ============================================================ */}
      <footer ref={r8} className="reveal border-t border-white/5 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold">
              Vettd<span className="text-blue-500">RE</span>
            </Link>
            <div className="flex gap-6 text-sm text-slate-500">
              <button onClick={scrollToFeatures} className="hover:text-slate-300 transition-colors">Features</button>
              <a href="#pricing" className="hover:text-slate-300 transition-colors">Pricing</a>
              <Link href="/login" className="hover:text-slate-300 transition-colors">Sign in</Link>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            &copy; {new Date().getFullYear()} VettdRE. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// Card Components
// ============================================================

function IntelCard({ title, description, gradient, icon }: {
  title: string; description: string; gradient: string; icon: React.ReactNode;
}) {
  return (
    <div className="group relative rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:bg-white/[0.04] transition-colors">
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />
      <div className="relative">
        <div className="mb-4">{icon}</div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: {
  icon: React.ReactNode; title: string; description: string;
}) {
  return (
    <div className="group rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/10 transition-all">
      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 mb-4 group-hover:bg-blue-500/20 transition-colors">
        {icon}
      </div>
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({ step, title, description }: {
  step: string; title: string; description: string;
}) {
  return (
    <div className="text-center md:text-left">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 text-blue-400 font-bold text-sm mb-4 border border-blue-500/20">
        {step}
      </div>
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function PricingCard({ name, price, description, features, highlighted }: {
  name: string; price: string; description: string; features: string[]; highlighted?: boolean;
}) {
  return (
    <div className={`relative rounded-2xl p-6 flex flex-col ${
      highlighted
        ? "bg-gradient-to-b from-blue-600/10 to-violet-600/5 border-2 border-blue-500/30"
        : "bg-white/[0.02] border border-white/5"
    }`}>
      {highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-blue-600 text-white text-xs font-semibold rounded-full">
          Most Popular
        </span>
      )}
      <h3 className="text-lg font-semibold mb-1">{name}</h3>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-3xl font-bold">{price}</span>
        {price !== "$0" && <span className="text-sm text-slate-500">/month</span>}
      </div>
      <p className="text-sm text-slate-400 mb-6">{description}</p>
      <ul className="space-y-2.5 flex-1">
        {features.map(f => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
            <IconCheck />
            {f}
          </li>
        ))}
      </ul>
      <Link href="/signup"
        className={`mt-6 block text-center py-2.5 rounded-lg text-sm font-semibold transition-colors ${
          highlighted
            ? "bg-blue-600 hover:bg-blue-500 text-white"
            : "bg-white/5 hover:bg-white/10 text-slate-300"
        }`}>
        Get Started
      </Link>
    </div>
  );
}
