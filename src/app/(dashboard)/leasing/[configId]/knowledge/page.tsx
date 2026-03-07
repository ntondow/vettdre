"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Loader2, Plus, Trash2, Lock, GripVertical,
  MessageCircle, HelpCircle, Swords, Gift, Sparkles, ChevronDown,
} from "lucide-react";
import { getKnowledgeConfig, saveKnowledgeBase } from "../../actions";

// ── Types ────────────────────────────────────────────────────

interface FAQItem {
  question: string;
  answer: string;
}

interface Competitor {
  name: string;
  address: string;
  weakness: string;
  ourAdvantage: string;
}

interface Concession {
  name: string;
  trigger: string;
  value: string;
  maxPerMonth: number;
}

type Tab = "personality" | "faq" | "competitors" | "concessions";

const TABS: { key: Tab; label: string; icon: typeof MessageCircle; proOnly?: boolean }[] = [
  { key: "personality", label: "Personality", icon: Sparkles },
  { key: "faq", label: "FAQ", icon: HelpCircle },
  { key: "competitors", label: "Competitors", icon: Swords, proOnly: true },
  { key: "concessions", label: "Concessions", icon: Gift, proOnly: true },
];

const TONE_OPTIONS = [
  { value: "professional_friendly", label: "Professional & Friendly" },
  { value: "casual_warm", label: "Casual & Warm" },
  { value: "luxury_concierge", label: "Luxury Concierge" },
  { value: "no_nonsense", label: "No-Nonsense Direct" },
  { value: "enthusiastic", label: "Enthusiastic & Upbeat" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English", flag: "🇺🇸", tier: "free" as const },
  { value: "es", label: "Spanish", flag: "🇪🇸", tier: "pro" as const },
  { value: "zh", label: "Mandarin (Simplified)", flag: "🇨🇳", tier: "team" as const },
  { value: "ru", label: "Russian", flag: "🇷🇺", tier: "team" as const },
  { value: "he", label: "Hebrew", flag: "🇮🇱", tier: "team" as const },
];

const CONCESSION_TRIGGERS = [
  "first_visit",
  "multiple_tours",
  "price_objection",
  "competitor_mention",
  "move_in_30_days",
  "referred_prospect",
];

// ══════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════

export default function KnowledgeBasePage() {
  const params = useParams();
  const router = useRouter();
  const configId = params.configId as string;

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("personality");
  const [tier, setTier] = useState<string>("free");
  const [propertyName, setPropertyName] = useState("");

  // Personality fields
  const [aiName, setAiName] = useState("Leasing Assistant");
  const [aiTone, setAiTone] = useState("professional_friendly");
  const [greeting, setGreeting] = useState("");
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [customInstructions, setCustomInstructions] = useState("");

  // FAQ
  const [faqs, setFaqs] = useState<FAQItem[]>([]);

  // Competitors
  const [competitors, setCompetitors] = useState<Competitor[]>([]);

  // Concessions
  const [concessionsEnabled, setConcessionsEnabled] = useState(false);
  const [concessions, setConcessions] = useState<Concession[]>([]);

  // ── Load ──────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    setLoading(true);
    const result = await getKnowledgeConfig(configId);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    const c = result.config!;
    setTier(c.tier);
    setPropertyName(c.propertyName);
    setAiName(c.aiName);
    setAiTone(c.aiTone);
    setGreeting(c.greeting);
    setLanguages(c.languages || ["en"]);
    setCustomInstructions(c.customInstructions || "");

    // Load from buildingKnowledge JSON
    const kb = c.buildingKnowledge || {};
    setFaqs(kb.faq || []);
    setCompetitors(kb.competitors || []);
    setConcessionsEnabled(kb.concessionsEnabled || false);
    setConcessions(kb.concessions || []);
    setLoading(false);
  }, [configId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Save ──────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    // Build the knowledge object with new fields merged
    const knowledgeUpdate: Record<string, unknown> = {
      faq: faqs.filter(f => f.question.trim() && f.answer.trim()),
      competitors: isPro ? competitors.filter(c => c.name.trim()) : undefined,
      concessionsEnabled: isPro ? concessionsEnabled : undefined,
      concessions: isPro && concessionsEnabled ? concessions.filter(c => c.name.trim() && c.value.trim()) : undefined,
    };

    const result = await saveKnowledgeBase(configId, {
      aiName: aiName.trim() || "Leasing Assistant",
      aiTone,
      greeting: greeting.trim(),
      languages,
      customInstructions: customInstructions.trim() || null,
      knowledgeFields: knowledgeUpdate,
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const isPro = tier === "pro" || tier === "team";

  // ── Loading/Error states ──────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error && !propertyName) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={() => router.push("/leasing")} className="text-blue-600 hover:underline">
          Back to Leasing
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/leasing")}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Knowledge Base</h1>
            <p className="text-sm text-slate-500">{propertyName}</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved!" : "Save"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const locked = tab.proOnly && !isPro;
          return (
            <button
              key={tab.key}
              onClick={() => !locked && setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : locked
                  ? "border-transparent text-slate-300 cursor-not-allowed"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {locked && <Lock className="w-3 h-3 ml-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "personality" && (
        <PersonalityTab
          aiName={aiName}
          setAiName={setAiName}
          aiTone={aiTone}
          setAiTone={setAiTone}
          greeting={greeting}
          setGreeting={setGreeting}
          languages={languages}
          setLanguages={setLanguages}
          customInstructions={customInstructions}
          setCustomInstructions={setCustomInstructions}
          tier={tier}
        />
      )}

      {activeTab === "faq" && (
        <FAQTab faqs={faqs} setFaqs={setFaqs} />
      )}

      {activeTab === "competitors" && isPro && (
        <CompetitorsTab competitors={competitors} setCompetitors={setCompetitors} />
      )}

      {activeTab === "concessions" && isPro && (
        <ConcessionsTab
          enabled={concessionsEnabled}
          setEnabled={setConcessionsEnabled}
          concessions={concessions}
          setConcessions={setConcessions}
        />
      )}

      {/* Pro gate for locked tabs */}
      {((activeTab === "competitors" || activeTab === "concessions") && !isPro) && (
        <div className="text-center py-16">
          <Lock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Pro Feature</h3>
          <p className="text-sm text-slate-500 mb-4">
            {activeTab === "competitors"
              ? "Competitive positioning helps your AI differentiate your property."
              : "Concession rules let your AI offer incentives to close deals faster."}
          </p>
          <a
            href="/settings/billing?upgrade=leasing_pro"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Upgrade to Pro
          </a>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Tab: Personality
// ══════════════════════════════════════════════════════════════

function PersonalityTab({
  aiName, setAiName, aiTone, setAiTone, greeting, setGreeting,
  languages, setLanguages, customInstructions, setCustomInstructions, tier,
}: {
  aiName: string; setAiName: (v: string) => void;
  aiTone: string; setAiTone: (v: string) => void;
  greeting: string; setGreeting: (v: string) => void;
  languages: string[]; setLanguages: (v: string[]) => void;
  customInstructions: string; setCustomInstructions: (v: string) => void;
  tier: string;
}) {
  return (
    <div className="space-y-6">
      {/* AI Name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">AI Assistant Name</label>
        <input
          type="text"
          value={aiName}
          onChange={(e) => setAiName(e.target.value)}
          placeholder="e.g., Alex, The 242 Leasing Team"
          maxLength={50}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <p className="mt-1 text-xs text-slate-400">This name appears in the AI&apos;s identity when it introduces itself.</p>
      </div>

      {/* Tone */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Communication Tone</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAiTone(opt.value)}
              className={`px-3 py-2.5 text-sm text-left rounded-lg border transition-colors ${
                aiTone === opt.value
                  ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Greeting */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Opening Greeting</label>
        <textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="Hi! I'm the leasing assistant for this property. How can I help you today?"
          rows={2}
          maxLength={320}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
        />
        <p className="mt-1 text-xs text-slate-400">{greeting.length}/320 characters</p>
      </div>

      {/* Languages */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Supported Languages</label>
        <p className="text-xs text-slate-400 mb-2">AI will auto-detect and respond in the prospect&apos;s language.</p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((lang) => {
            const active = languages.includes(lang.value);
            const tierGated = (lang.tier === "pro" && tier === "free") || (lang.tier === "team" && tier !== "team");
            return (
              <button
                key={lang.value}
                onClick={() => {
                  if (tierGated || lang.value === "en") return;
                  if (active && languages.length > 1) {
                    setLanguages(languages.filter((l) => l !== lang.value));
                  } else if (!active) {
                    setLanguages([...languages, lang.value]);
                  }
                }}
                disabled={tierGated}
                title={tierGated ? `${lang.tier === "team" ? "Team" : "Pro"} feature` : undefined}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  tierGated
                    ? "border-slate-100 text-slate-300 cursor-not-allowed"
                    : active
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {lang.flag} {lang.label}
                {lang.tier !== "free" && (
                  <span className={`ml-1 text-[10px] ${tierGated ? "text-slate-300" : "text-slate-400"}`}>
                    {lang.tier === "pro" ? "Pro" : "Team"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Instructions */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Custom Instructions</label>
        <textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="e.g., Always mention the rooftop is available for events. Never quote exact square footage — say 'spacious' instead."
          rows={4}
          maxLength={1000}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
        />
        <p className="mt-1 text-xs text-slate-400">{customInstructions.length}/1000 — These instructions override default AI behavior.</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Tab: FAQ
// ══════════════════════════════════════════════════════════════

function FAQTab({
  faqs, setFaqs,
}: {
  faqs: FAQItem[]; setFaqs: (v: FAQItem[]) => void;
}) {
  const addFaq = () => setFaqs([...faqs, { question: "", answer: "" }]);

  const updateFaq = (index: number, field: keyof FAQItem, value: string) => {
    const updated = [...faqs];
    updated[index] = { ...updated[index], [field]: value };
    setFaqs(updated);
  };

  const removeFaq = (index: number) => setFaqs(faqs.filter((_, i) => i !== index));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-700">Frequently Asked Questions</h3>
          <p className="text-xs text-slate-400 mt-0.5">Teach your AI the answers to common questions about this property.</p>
        </div>
        <button
          onClick={addFaq}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add FAQ
        </button>
      </div>

      {faqs.length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 mb-3">No FAQs yet</p>
          <button
            onClick={addFaq}
            className="text-sm text-blue-600 hover:underline"
          >
            Add your first FAQ
          </button>
        </div>
      )}

      {faqs.map((faq, i) => (
        <div key={i} className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Question</label>
              <input
                type="text"
                value={faq.question}
                onChange={(e) => updateFaq(i, "question", e.target.value)}
                placeholder="e.g., Is there parking available?"
                maxLength={200}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <button
              onClick={() => removeFaq(i)}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors mt-5"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Answer</label>
            <textarea
              value={faq.answer}
              onChange={(e) => updateFaq(i, "answer", e.target.value)}
              placeholder="e.g., Yes! We have a garage with monthly spots at $200/mo and a waitlist for outdoor spots."
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Tab: Competitors
// ══════════════════════════════════════════════════════════════

function CompetitorsTab({
  competitors, setCompetitors,
}: {
  competitors: Competitor[]; setCompetitors: (v: Competitor[]) => void;
}) {
  const addCompetitor = () => setCompetitors([...competitors, { name: "", address: "", weakness: "", ourAdvantage: "" }]);

  const updateCompetitor = (index: number, field: keyof Competitor, value: string) => {
    const updated = [...competitors];
    updated[index] = { ...updated[index], [field]: value };
    setCompetitors(updated);
  };

  const removeCompetitor = (index: number) => setCompetitors(competitors.filter((_, i) => i !== index));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-700">Competitor Properties</h3>
          <p className="text-xs text-slate-400 mt-0.5">When a prospect mentions a competitor, your AI will know how to position your property.</p>
        </div>
        <button
          onClick={addCompetitor}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Competitor
        </button>
      </div>

      {competitors.length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <Swords className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 mb-3">No competitors added</p>
          <button
            onClick={addCompetitor}
            className="text-sm text-blue-600 hover:underline"
          >
            Add your first competitor
          </button>
        </div>
      )}

      {competitors.map((comp, i) => (
        <div key={i} className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Property Name</label>
                <input
                  type="text"
                  value={comp.name}
                  onChange={(e) => updateCompetitor(i, "name", e.target.value)}
                  placeholder="e.g., The Avalon"
                  maxLength={100}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
                <input
                  type="text"
                  value={comp.address}
                  onChange={(e) => updateCompetitor(i, "address", e.target.value)}
                  placeholder="e.g., 123 Main St"
                  maxLength={200}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <button
              onClick={() => removeCompetitor(i)}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors mt-5"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Their Weakness</label>
            <input
              type="text"
              value={comp.weakness}
              onChange={(e) => updateCompetitor(i, "weakness", e.target.value)}
              placeholder="e.g., Small units, no laundry, far from subway"
              maxLength={200}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Our Advantage</label>
            <input
              type="text"
              value={comp.ourAdvantage}
              onChange={(e) => updateCompetitor(i, "ourAdvantage", e.target.value)}
              placeholder="e.g., Larger floor plans, in-unit washer/dryer, 2 blocks from L train"
              maxLength={200}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Tab: Concessions
// ══════════════════════════════════════════════════════════════

function ConcessionsTab({
  enabled, setEnabled, concessions, setConcessions,
}: {
  enabled: boolean; setEnabled: (v: boolean) => void;
  concessions: Concession[]; setConcessions: (v: Concession[]) => void;
}) {
  const addConcession = () => setConcessions([...concessions, { name: "", trigger: "price_objection", value: "", maxPerMonth: 5 }]);

  const updateConcession = (index: number, field: keyof Concession, value: string | number) => {
    const updated = [...concessions];
    updated[index] = { ...updated[index], [field]: value };
    setConcessions(updated);
  };

  const removeConcession = (index: number) => setConcessions(concessions.filter((_, i) => i !== index));

  const TRIGGER_LABELS: Record<string, string> = {
    first_visit: "First Visit",
    multiple_tours: "Multiple Tours",
    price_objection: "Price Objection",
    competitor_mention: "Competitor Mention",
    move_in_30_days: "Move-in < 30 Days",
    referred_prospect: "Referred Prospect",
  };

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg">
        <div>
          <h3 className="text-sm font-medium text-slate-700">Enable Concessions</h3>
          <p className="text-xs text-slate-400 mt-0.5">Allow AI to offer incentives based on trigger conditions.</p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-blue-600" : "bg-slate-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {!enabled && (
        <div className="text-center py-8 text-sm text-slate-400">
          Concessions are disabled. Toggle on to configure incentive rules.
        </div>
      )}

      {enabled && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-700">Concession Rules</h3>
              <p className="text-xs text-slate-400 mt-0.5">Define what incentives the AI can offer and when.</p>
            </div>
            <button
              onClick={addConcession}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Rule
            </button>
          </div>

          {concessions.length === 0 && (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <Gift className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-3">No concession rules</p>
              <button
                onClick={addConcession}
                className="text-sm text-blue-600 hover:underline"
              >
                Add your first concession rule
              </button>
            </div>
          )}

          {concessions.map((con, i) => (
            <div key={i} className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Concession Name</label>
                    <input
                      type="text"
                      value={con.name}
                      onChange={(e) => updateConcession(i, "name", e.target.value)}
                      placeholder="e.g., 1 Month Free"
                      maxLength={100}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Trigger</label>
                    <select
                      value={con.trigger}
                      onChange={(e) => updateConcession(i, "trigger", e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                    >
                      {CONCESSION_TRIGGERS.map((t) => (
                        <option key={t} value={t}>{TRIGGER_LABELS[t] || t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => removeConcession(i)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors mt-5"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Offer Text</label>
                  <input
                    type="text"
                    value={con.value}
                    onChange={(e) => updateConcession(i, "value", e.target.value)}
                    placeholder="e.g., First month free on a 13-month lease"
                    maxLength={200}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Max Per Month</label>
                  <input
                    type="number"
                    value={con.maxPerMonth}
                    onChange={(e) => updateConcession(i, "maxPerMonth", parseInt(e.target.value) || 0)}
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
