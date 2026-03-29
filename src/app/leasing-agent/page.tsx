"use client";

import { useState } from "react";
import Link from "next/link";

// ── SEO metadata (exported from layout or head) ─────────────
// Since this is a "use client" page, we export metadata via generateMetadata
// in a separate file or use the <head> approach. For simplicity, we use
// a parallel metadata export below.

// ══════════════════════════════════════════════════════════════
// Landing Page Component
// ══════════════════════════════════════════════════════════════

export default function LeasingAgentPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Nav />
      <Hero />
      <StatsBar />
      <HowItWorks />
      <MagicMoment />
      <Pricing />
      <FAQ />
      <FooterCTA />
    </div>
  );
}

// ── Nav ──────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/leasing-agent" className="font-bold text-lg text-slate-900 tracking-tight">
          Vettd<span className="text-blue-600">RE</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Get started free
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ── Hero ─────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="pt-28 pb-16 sm:pt-36 sm:pb-24 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Copy */}
        <div>
          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.1] tracking-tight text-slate-900">
            The leasing agent that works while you sleep
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-500 leading-relaxed max-w-xl">
            AI-powered SMS leasing assistant for NYC landlords. Answers inquiries, qualifies leads, and books showings — 24/7. Free to start, live in 3 minutes.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-base shadow-lg shadow-blue-600/20"
            >
              Get started free &rarr;
            </Link>
            <button
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
              className="px-6 py-3 text-slate-600 font-medium rounded-xl hover:bg-slate-100 transition-colors text-base"
            >
              See how it works &darr;
            </button>
          </div>
        </div>

        {/* Phone mockup */}
        <div className="flex justify-center lg:justify-end">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}

// ── Phone Mockup (CSS animated SMS conversation) ─────────────

function PhoneMockup() {
  return (
    <div className="relative w-[300px] sm:w-[340px]">
      {/* Phone frame */}
      <div className="bg-slate-900 rounded-[2.5rem] p-3 shadow-2xl shadow-slate-900/30">
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-slate-900 rounded-b-2xl z-10" />

        {/* Screen */}
        <div className="bg-slate-50 rounded-[2rem] overflow-hidden">
          {/* Status bar */}
          <div className="bg-white px-6 py-2 flex items-center justify-between text-[10px] text-slate-400">
            <span>11:47 PM</span>
            <span className="flex items-center gap-1">
              <span>&#9679;&#9679;&#9679;&#9679;</span>
            </span>
          </div>

          {/* Chat header */}
          <div className="bg-white border-b border-slate-100 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">AI</div>
              <div>
                <p className="text-sm font-semibold text-slate-800">242 E 10th St</p>
                <p className="text-[10px] text-green-500 font-medium">Online</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="px-3 py-4 space-y-3 min-h-[360px] bg-gradient-to-b from-slate-50 to-white">
            {/* Message 1 — prospect */}
            <div className="flex justify-end animate-[msgIn_0.4s_ease-out_0.5s_both]">
              <div className="max-w-[80%]">
                <div className="bg-blue-600 text-white px-3.5 py-2 rounded-2xl rounded-br-md text-[13px] leading-relaxed">
                  Hey, do you have any 1BRs available?
                </div>
                <p className="text-[9px] text-slate-400 text-right mt-0.5 pr-1">11:47 PM</p>
              </div>
            </div>

            {/* Message 2 — AI */}
            <div className="flex justify-start animate-[msgIn_0.4s_ease-out_1.8s_both]">
              <div className="max-w-[80%]">
                <div className="bg-white border border-slate-200 px-3.5 py-2 rounded-2xl rounded-bl-md text-[13px] leading-relaxed text-slate-800 shadow-sm">
                  Hi! Yes — Unit 2B is available now at $2,200/mo. Heat and hot water included, 4 min walk to the F train. Want to schedule a showing?
                </div>
                <p className="text-[9px] text-slate-400 mt-0.5 pl-1">11:47 PM</p>
              </div>
            </div>

            {/* Message 3 — prospect */}
            <div className="flex justify-end animate-[msgIn_0.4s_ease-out_3.5s_both]">
              <div className="max-w-[80%]">
                <div className="bg-blue-600 text-white px-3.5 py-2 rounded-2xl rounded-br-md text-[13px] leading-relaxed">
                  What about pets?
                </div>
                <p className="text-[9px] text-slate-400 text-right mt-0.5 pr-1">11:48 PM</p>
              </div>
            </div>

            {/* Message 4 — AI */}
            <div className="flex justify-start animate-[msgIn_0.4s_ease-out_5s_both]">
              <div className="max-w-[80%]">
                <div className="bg-white border border-slate-200 px-3.5 py-2 rounded-2xl rounded-bl-md text-[13px] leading-relaxed text-slate-800 shadow-sm">
                  Pets are welcome! I have availability Thursday at 6 PM or Saturday at 11 AM — which works better for you?
                </div>
                <p className="text-[9px] text-slate-400 mt-0.5 pl-1">11:48 PM</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stats Bar ────────────────────────────────────────────────

function StatsBar() {
  return (
    <section className="bg-slate-50 border-y border-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-0 text-center">
        <div className="sm:border-r sm:border-slate-200">
          <p className="text-3xl font-extrabold text-slate-900">&lt; 15s</p>
          <p className="text-sm text-slate-500 mt-1">response time</p>
        </div>
        <div className="sm:border-r sm:border-slate-200">
          <p className="text-3xl font-extrabold text-slate-900">24/7</p>
          <p className="text-sm text-slate-500 mt-1">never misses a text</p>
        </div>
        <div>
          <p className="text-3xl font-extrabold text-slate-900">3 min</p>
          <p className="text-sm text-slate-500 mt-1">setup time</p>
        </div>
      </div>
    </section>
  );
}

// ── How It Works ─────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      emoji: "\uD83C\uDFE2",
      title: "Add your listing",
      desc: "Enter your address and units. We\u2019ll pull NYC building data automatically.",
    },
    {
      emoji: "\uD83E\uDD16",
      title: "AI handles inquiries",
      desc: "Prospects text your number. AI responds instantly with real availability, answers questions, and qualifies leads.",
    },
    {
      emoji: "\u2705",
      title: "You confirm showings",
      desc: "Get notified when a showing is booked. Upgrade to Pro and it books directly to your calendar.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-center text-slate-900 tracking-tight">
          Set it up in 3 minutes. Let it run forever.
        </h2>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-10">
          {steps.map((step, i) => (
            <div key={i} className="text-center">
              <div className="text-5xl mb-4">{step.emoji}</div>
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold mb-3">
                {i + 1}
              </div>
              <h3 className="text-lg font-bold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── The Magic Moment ─────────────────────────────────────────

function MagicMoment() {
  return (
    <section className="bg-slate-900 py-20 px-4 sm:px-6 text-center">
      <div className="max-w-3xl mx-auto">
        <p className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
          Put this number on your Craigslist listing.
        </p>
        <p className="mt-4 text-xl sm:text-2xl text-slate-400 font-medium">
          Your AI handles everything else.
        </p>
        <Link
          href="/signup"
          className="inline-block mt-8 px-8 py-3 border-2 border-white text-white font-semibold rounded-xl hover:bg-white hover:text-slate-900 transition-colors text-base"
        >
          Get started free &rarr;
        </Link>
      </div>
    </section>
  );
}

// ── Pricing ──────────────────────────────────────────────────

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    cta: "Get started free",
    popular: false,
    features: [
      { label: "Messages per day", value: "25" },
      { label: "Properties", value: "3" },
      { label: "SMS channel", value: true },
      { label: "Email channel", value: false },
      { label: "Auto-book showings", value: false },
      { label: "3-touch follow-up sequences", value: false },
      { label: "Spanish language", value: false },
      { label: "Web chat widget", value: false },
      { label: "Voice channel", value: false },
      { label: "Multi-language (5 languages)", value: false },
    ],
  },
  {
    name: "Pro",
    price: "$149",
    period: "/building/mo",
    cta: "Start with Pro",
    popular: true,
    features: [
      { label: "Messages per day", value: "500" },
      { label: "Properties", value: "10" },
      { label: "SMS channel", value: true },
      { label: "Email channel", value: true },
      { label: "Auto-book showings", value: true },
      { label: "3-touch follow-up sequences", value: true },
      { label: "Spanish language", value: true },
      { label: "Web chat widget", value: false },
      { label: "Voice channel", value: false },
      { label: "Multi-language (5 languages)", value: false },
    ],
  },
  {
    name: "Team",
    price: "$399",
    period: "/building/mo",
    cta: "Get Team",
    popular: false,
    features: [
      { label: "Messages per day", value: "Unlimited" },
      { label: "Properties", value: "Unlimited" },
      { label: "SMS channel", value: true },
      { label: "Email channel", value: true },
      { label: "Auto-book showings", value: true },
      { label: "3-touch follow-up sequences", value: true },
      { label: "Spanish language", value: true },
      { label: "Web chat widget", value: true },
      { label: "Voice channel", value: true },
      { label: "Multi-language (5 languages)", value: true },
    ],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="py-20 px-4 sm:px-6 bg-slate-50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-center text-slate-900 tracking-tight">
          Simple pricing. No surprises.
        </h2>
        <p className="text-center text-sm text-slate-500 mt-3">
          Per building per month. Cancel anytime. No setup fees.
        </p>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-2xl border-2 p-6 flex flex-col ${
                plan.popular ? "border-blue-600 shadow-lg shadow-blue-600/10" : "border-slate-200"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
                  Most popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-slate-900">{plan.price}</span>
                  {plan.period && <span className="text-sm text-slate-500">{plan.period}</span>}
                </div>
              </div>

              <ul className="space-y-3 flex-1">
                {plan.features.map((f) => (
                  <li key={f.label} className="flex items-center gap-2.5 text-sm">
                    {typeof f.value === "boolean" ? (
                      f.value ? (
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">&#10003;</span>
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-300 flex items-center justify-center text-xs flex-shrink-0">&mdash;</span>
                      )
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {f.value === "Unlimited" ? "\u221E" : ""}
                      </span>
                    )}
                    <span className={typeof f.value === "boolean" && !f.value ? "text-slate-400" : "text-slate-700"}>
                      {f.label}
                      {typeof f.value === "string" && (
                        <span className="ml-1 font-semibold text-slate-900">{f.value}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`mt-6 block text-center px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  plan.popular
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FAQ ──────────────────────────────────────────────────────

const FAQS = [
  {
    q: "Does my tenant know they're texting an AI?",
    a: "Disclosure varies by jurisdiction. We recommend transparency — many landlords add \"AI-powered\" to their listing description. The AI introduces itself by name (which you set), and always escalates complex situations to you.",
  },
  {
    q: "What happens when the AI can't answer something?",
    a: "It escalates to you via SMS immediately. You reply from your phone, and the conversation continues seamlessly — the prospect never knows they switched to a human.",
  },
  {
    q: "Can I use my existing phone number?",
    a: "Not yet — we provision a dedicated local NYC number (718, 347, or 917 area codes) for each property. This keeps your personal number private and lets the AI respond instantly.",
  },
  {
    q: "What if a prospect texts after my 25 daily messages are used up?",
    a: "Their message is queued, and the AI responds first thing the next morning when your limit resets. Upgrade to Pro for 500 messages/day, or Team for unlimited.",
  },
  {
    q: "Is my building data secure?",
    a: "Yes. Your data is stored on SOC 2-compliant infrastructure, encrypted at rest and in transit. We never share your building data with other users — benchmarks use only anonymous, aggregated statistics.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="py-20 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-center text-slate-900 tracking-tight mb-12">
          Common questions
        </h2>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm font-semibold text-slate-800 pr-4">{faq.q}</span>
                <span className={`text-slate-400 transition-transform flex-shrink-0 ${open === i ? "rotate-45" : ""}`}>
                  +
                </span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  open === i ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <p className="px-5 pb-4 text-sm text-slate-500 leading-relaxed">{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Footer CTA ───────────────────────────────────────────────

function FooterCTA() {
  return (
    <section className="bg-slate-900 py-20 px-4 sm:px-6 text-center">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
          Ready to stop missing leads at 11 PM?
        </h2>
        <p className="mt-4 text-lg text-slate-400">
          Get started free — no credit card required
        </p>
        <Link
          href="/signup"
          className="inline-block mt-8 px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-colors text-base shadow-lg shadow-blue-600/30"
        >
          Get started free &rarr;
        </Link>
        <p className="mt-8 text-xs text-slate-600">
          Powered by VettdRE &middot; Built for NYC landlords
        </p>
      </div>
    </section>
  );
}
