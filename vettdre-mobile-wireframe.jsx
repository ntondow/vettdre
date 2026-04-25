import { useState, useCallback, useEffect, useRef } from "react";

// ── VettdRE Mobile — Interactive Wireframe Prototype ──────────
// Clean / minimal white aesthetic · Maps to real codebase data structures
// Agent-first: Dashboard → Scout → Pipeline → Clients → Earnings

const SCREENS = {
  DASHBOARD: "dashboard",
  SCOUT: "scout",
  CAMERA: "camera",
  SCREENSHOT: "screenshot",
  URL_PASTE: "url_paste",
  RESOLVING: "resolving",
  PROFILE: "profile",
  SAVED: "saved",
  MAP: "map",
  PIPELINE: "pipeline",
  SEARCH: "search",
  NOTIFICATIONS: "notifications",
  EARNINGS: "earnings",
  CLIENTS: "clients",
  CLIENT_INVITE: "client_invite",
  CLIENT_DETAIL: "client_detail",
  INVITE_SENT: "invite_sent",
};

// ── Mock Data (matches real Prisma schema fields) ─────────────

const MOCK_BUILDING = {
  bbl: "1-01637-0029",
  address: "425 W 52nd St",
  borough: "Manhattan",
  neighborhood: "Hell's Kitchen",
  zipCode: "10019",
  // MapPLUTO fields
  buildingClass: "D4",
  buildingClassDesc: "Elevator Co-op",
  yearBuilt: 1965,
  numFloors: 16,
  unitsTotal: 187,
  unitsRes: 185,
  lotArea: 15250,
  bldgArea: 168520,
  zoneDist1: "R8",
  builtFAR: 11.04,
  maxFAR: 12.0,
  assessTotal: 18750000,
  ownerName: "425 WEST 52ND OWNERS CORP",
  // ACRIS fields
  lastSalePrice: 42500000,
  lastSaleDate: "2019-03-15",
  mortgageAmount: 28000000,
  mortgageLender: "Signature Bank",
  deedType: "DEED",
  // HPD fields
  hpdViolations: { open: 12, total: 89 },
  hpdComplaints: { open: 3, total: 45 },
  rentStabilized: true,
  rsUnits: 142,
  // DOB fields
  activePermits: 2,
  recentPermits: [
    { type: "A2 - Alteration", filed: "2025-11-20", description: "Interior renovation floors 3-5" },
    { type: "EW - Equipment Work", filed: "2026-01-08", description: "Elevator modernization" },
  ],
  // AI analysis
  aiNotes: "Postwar elevator co-op with 142 rent-stabilized units. Active renovation suggests repositioning strategy. Owner purchased in 2019 for $42.5M with $28M mortgage — moderate leverage. 12 open HPD violations indicate deferred maintenance. Unused FAR of 0.96 represents ~14,640 sqft development potential.",
  ownerConfidence: 82,
  distressScore: 45,
};

const MOCK_SAVED = [
  { id: "1", address: "425 W 52nd St", neighborhood: "Hell's Kitchen", units: 187, status: "contacted", lastViewed: "2h ago" },
  { id: "2", address: "310 E 46th St", neighborhood: "Turtle Bay", units: 94, status: "new", lastViewed: "1d ago" },
  { id: "3", address: "88 Greenwich St", neighborhood: "FiDi", units: 312, status: "in_discussion", lastViewed: "3d ago" },
  { id: "4", address: "1501 Broadway", neighborhood: "Times Square", units: 0, status: "researched", lastViewed: "5d ago" },
  { id: "5", address: "45-17 21st St", neighborhood: "LIC", units: 156, status: "new", lastViewed: "1w ago" },
];

const PIPELINE_STAGES = [
  { key: "new", label: "New", color: "#3B82F6", count: 8 },
  { key: "researched", label: "Researched", color: "#8B5CF6", count: 5 },
  { key: "contacted", label: "Contacted", color: "#F59E0B", count: 3 },
  { key: "in_discussion", label: "In Discussion", color: "#10B981", count: 2 },
  { key: "under_contract", label: "Under Contract", color: "#6366F1", count: 1 },
  { key: "closed", label: "Closed", color: "#059669", count: 4 },
];

// Maps to Prisma: ClientOnboarding model
// Status maps to OnboardingStatus enum: draft | pending | partially_signed | completed | expired | voided
// Name split into clientFirstName + clientLastName (combined here for display)
// invitedAt → sentAt, signedAt → completedAt, sentVia → "email" | "sms" | "email+sms" | "link"
const MOCK_CLIENTS = [
  { id: "c1", firstName: "Sarah", lastName: "Chen", email: "sarah.chen@gmail.com", phone: "(917) 555-0142", status: "completed", sentAt: "Mar 28", completedAt: "Mar 29", sentVia: "email+sms", docs: 3, docsComplete: 3 },
  { id: "c2", firstName: "Marcus", lastName: "Williams", email: "m.williams@outlook.com", phone: "(646) 555-0198", status: "pending", sentAt: "Mar 30", completedAt: null, sentVia: "email+sms", docs: 3, docsComplete: 0 },
  { id: "c3", firstName: "David", lastName: "Kim", email: "david.kim@icloud.com", phone: "(212) 555-0267", status: "partially_signed", sentAt: "Mar 29", completedAt: null, sentVia: "email", docs: 3, docsComplete: 1 },
  { id: "c4", firstName: "Rachel", lastName: "Torres", email: "r.torres@yahoo.com", phone: "(718) 555-0334", status: "expired", sentAt: "Mar 15", completedAt: null, sentVia: "sms", docs: 3, docsComplete: 0 },
  { id: "c5", firstName: "James", lastName: "Okafor", email: "j.okafor@gmail.com", phone: "(929) 555-0411", status: "completed", sentAt: "Mar 25", completedAt: "Mar 26", sentVia: "email+sms", docs: 3, docsComplete: 3 },
];

// Display helper — mirrors how the real app would format
const clientName = (c) => `${c.firstName} ${c.lastName}`;
const clientInitials = (c) => `${c.firstName[0]}${c.lastName[0]}`;

// Maps to OnboardingStatus enum values
const CLIENT_STATUS_COLORS = {
  draft: "#94A3B8",
  pending: "#F59E0B",
  partially_signed: "#3B82F6",
  completed: "#10B981",
  expired: "#94A3B8",
  voided: "#EF4444",
};

const CLIENT_STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending",
  partially_signed: "In Progress",
  completed: "Signed",
  expired: "Expired",
  voided: "Voided",
};

const MOCK_TODAY = [
  { id: "t1", type: "showing", time: "10:30 AM", title: "Showing — 425 W 52nd St #8C", client: "Sarah Chen", color: "#3B82F6" },
  { id: "t2", type: "follow_up", time: "1:00 PM", title: "Follow up with Marcus Williams", client: null, color: "#F59E0B" },
  { id: "t3", type: "showing", time: "3:00 PM", title: "Showing — 88 Greenwich St #12B", client: "David Kim", color: "#3B82F6" },
  { id: "t4", type: "task", time: "5:00 PM", title: "Submit deal docs for 310 E 46th", client: null, color: "#8B5CF6" },
];

const MOCK_NOTIFICATIONS = [
  { id: "n1", type: "signed", text: "Sarah Chen signed all 3 documents", time: "2m ago", icon: "✅", unread: true },
  { id: "n2", type: "viewed", text: "David Kim opened the signing link", time: "15m ago", icon: "👁", unread: true },
  { id: "n3", type: "lead", text: "New lead from StreetEasy: James Rivera", time: "1h ago", icon: "🔔", unread: true },
  { id: "n4", type: "deal", text: "Deal approved: 310 E 46th St #4A", time: "3h ago", icon: "🎉", unread: false },
  { id: "n5", type: "compliance", text: "License expires in 30 days", time: "1d ago", icon: "⚠️", unread: false },
  { id: "n6", type: "payment", text: "Commission payment received: $4,200", time: "2d ago", icon: "💰", unread: false },
  { id: "n7", type: "stage", text: "88 Greenwich moved to Under Contract", time: "3d ago", icon: "📊", unread: false },
];

const STATUS_COLORS = {
  new: "#3B82F6",
  researched: "#8B5CF6",
  contacted: "#F59E0B",
  in_discussion: "#10B981",
  under_contract: "#6366F1",
  closed: "#059669",
  dead: "#94A3B8",
};

// ── Performance & Animation Styles ────────────────────────────

const GLOBAL_STYLES = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideInRight { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  /* Tap feedback — instant visual response on press */
  .tap-target { transition: transform 0.1s ease, opacity 0.1s ease; }
  .tap-target:active { transform: scale(0.97); opacity: 0.85; }

  /* Smooth scroll */
  .scroll-area { -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }

  /* Screen transition wrapper */
  .screen-enter { animation: fadeIn 0.15s ease-out; }

  /* Card hover/press states */
  .card-press { transition: transform 0.1s ease, box-shadow 0.15s ease; }
  .card-press:active { transform: scale(0.98); box-shadow: none; }

  /* Skeleton shimmer for loading states */
  .skeleton {
    background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 8px;
  }
`;

// ── Shared Styles ─────────────────────────────────────────────

const Phone = ({ children }) => (
  <div style={{
    width: 390, height: 844, background: "#FFFFFF", borderRadius: 44,
    border: "8px solid #1a1a1a", position: "relative", overflow: "hidden",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
  }}>
    <style>{GLOBAL_STYLES}</style>
    {/* Status bar */}
    <div style={{
      height: 54, display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      padding: "0 28px 6px", fontSize: 14, fontWeight: 600, color: "#000",
    }}>
      <span>9:41</span>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <svg width="17" height="12" viewBox="0 0 17 12"><rect x="0" y="3" width="3" height="9" rx="1" fill="#000"/><rect x="4.5" y="2" width="3" height="10" rx="1" fill="#000"/><rect x="9" y="0" width="3" height="12" rx="1" fill="#000"/><rect x="13.5" y="0" width="3" height="12" rx="1" fill="#000" opacity=".3"/></svg>
        <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 2.4C5.6 2.4 3.4 3.3 1.8 4.9L0 3.1C2 1.1 4.9 0 8 0s6 1.1 8 3.1L14.2 4.9C12.6 3.3 10.4 2.4 8 2.4z" fill="#000"/><path d="M8 6.8c-1.6 0-3 .6-4.1 1.6L2 6.5c1.5-1.4 3.6-2.2 6-2.2s4.5.8 6 2.2l-1.9 1.9C11 7.4 9.6 6.8 8 6.8z" fill="#000"/><circle cx="8" cy="11" r="1.5" fill="#000"/></svg>
        <div style={{ width: 27, height: 13, border: "1.5px solid #000", borderRadius: 4, position: "relative", display: "flex", alignItems: "center", padding: "0 2px" }}>
          <div style={{ width: "75%", height: 8, background: "#000", borderRadius: 2 }}/>
          <div style={{ position: "absolute", right: -4, top: 3.5, width: 2, height: 5, background: "#000", borderRadius: "0 1px 1px 0" }}/>
        </div>
      </div>
    </div>
    {/* Content area with screen transition */}
    <div className="screen-enter" style={{ height: "calc(100% - 54px)", display: "flex", flexDirection: "column" }}>
      {children}
    </div>
  </div>
);

const TabBar = ({ active, onNavigate }) => {
  const unreadCount = MOCK_NOTIFICATIONS.filter(n => n.unread).length;
  const tabs = [
    { key: SCREENS.DASHBOARD, label: "Home", icon: "🏠" },
    { key: SCREENS.SCOUT, label: "Scout", icon: "🔍" },
    { key: SCREENS.PIPELINE, label: "Pipeline", icon: "📊" },
    { key: SCREENS.CLIENTS, label: "Clients", icon: "👤" },
    { key: SCREENS.NOTIFICATIONS, label: "Alerts", icon: "🔔", badge: unreadCount },
  ];

  return (
    <div style={{
      height: 80, borderTop: "1px solid #F1F5F9", display: "flex",
      alignItems: "flex-start", paddingTop: 8, paddingBottom: 20, background: "#fff",
    }}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onNavigate(tab.key)}
          style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            background: "none", border: "none", cursor: "pointer", padding: 0, position: "relative",
          }}
        >
          <div style={{ position: "relative" }}>
            <span style={{ fontSize: 22 }}>{tab.icon}</span>
            {tab.badge > 0 && (
              <div style={{
                position: "absolute", top: -4, right: -8,
                width: 16, height: 16, borderRadius: 8, background: "#EF4444",
                fontSize: 9, fontWeight: 700, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{tab.badge}</div>
            )}
          </div>
          <span style={{
            fontSize: 10, fontWeight: active === tab.key ? 600 : 400,
            color: active === tab.key ? "#2563EB" : "#94A3B8",
            letterSpacing: 0.2,
          }}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>
    {children}
  </div>
);

// Skeleton shimmer blocks for loading states
const Skeleton = ({ width = "100%", height = 16, radius = 8, style = {} }) => (
  <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />
);

const SkeletonCard = () => (
  <div style={{ padding: 16, background: "#fff", borderRadius: 14, border: "1px solid #F1F5F9", marginBottom: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Skeleton width={42} height={42} radius={21} />
      <div style={{ flex: 1 }}>
        <Skeleton width="60%" height={14} style={{ marginBottom: 8 }} />
        <Skeleton width="40%" height={12} />
      </div>
    </div>
  </div>
);

// Reusable skeleton screen shown while data loads
const LoadingScreen = ({ title = "Loading..." }) => (
  <>
    <div className="scroll-area" style={{ flex: 1, padding: "12px 20px 0" }}>
      <Skeleton width={140} height={24} style={{ marginBottom: 20 }} />
      <Skeleton width="100%" height={120} radius={20} style={{ marginBottom: 16 }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <Skeleton width="25%" height={60} radius={14} />
        <Skeleton width="25%" height={60} radius={14} />
        <Skeleton width="25%" height={60} radius={14} />
        <Skeleton width="25%" height={60} radius={14} />
      </div>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </>
);

// ── Screen: Agent Dashboard (Home) ───────────────────────────

const DashboardScreen = ({ onNavigate }) => (
  <>
    <div className="scroll-area" style={{ flex: 1, overflowY: "auto", padding: "16px 20px 0" }}>
      {/* Greeting + notification bell */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, color: "#94A3B8" }}>Good morning,</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#0F172A", letterSpacing: -0.5 }}>Nathan</div>
        </div>
        <button onClick={() => onNavigate(SCREENS.NOTIFICATIONS)} style={{
          width: 40, height: 40, borderRadius: 20, background: "#F8FAFC",
          border: "1px solid #E2E8F0", cursor: "pointer", position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>
          🔔
          <div style={{
            position: "absolute", top: -2, right: -2,
            width: 18, height: 18, borderRadius: 9, background: "#EF4444",
            fontSize: 10, fontWeight: 700, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid #fff",
          }}>3</div>
        </button>
      </div>

      {/* Earnings hero card — tap for full view */}
      <button onClick={() => onNavigate(SCREENS.EARNINGS)} style={{
        width: "100%", background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
        borderRadius: 20, padding: "20px", color: "#fff", marginBottom: 16,
        border: "none", cursor: "pointer", textAlign: "left",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>This Month</div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>$8,400</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>Pending</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#FBBF24" }}>$5,200</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
          <div style={{ flex: 1, padding: "8px", background: "rgba(255,255,255,0.08)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>3</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>Deals</div>
          </div>
          <div style={{ flex: 1, padding: "8px", background: "rgba(255,255,255,0.08)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>12</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>Showings</div>
          </div>
          <div style={{ flex: 1, padding: "8px", background: "rgba(255,255,255,0.08)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>5</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>Clients</div>
          </div>
          <div style={{ flex: 1, padding: "8px", background: "rgba(255,255,255,0.08)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>87%</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>Close Rate</div>
          </div>
        </div>
      </button>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Scout", icon: "🔍", screen: SCREENS.SCOUT },
          { label: "Invite", icon: "📲", screen: SCREENS.CLIENT_INVITE },
          { label: "Map", icon: "📍", screen: SCREENS.MAP },
          { label: "Search", icon: "🏢", screen: SCREENS.SEARCH },
        ].map((a) => (
          <button key={a.label} onClick={() => onNavigate(a.screen)} style={{
            flex: 1, padding: "14px 4px", background: "#F8FAFC", border: "1px solid #E2E8F0",
            borderRadius: 14, cursor: "pointer", textAlign: "center",
          }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{a.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: "#64748B" }}>{a.label}</div>
          </button>
        ))}
      </div>

      {/* Today's schedule */}
      <SectionLabel>Today's Schedule</SectionLabel>
      <div style={{ marginBottom: 20 }}>
        {MOCK_TODAY.map((item) => (
          <div key={item.id} style={{
            padding: "12px 14px", background: "#fff", border: "1px solid #F1F5F9",
            borderRadius: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 4, height: 36, borderRadius: 2, background: item.color, flexShrink: 0,
            }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                {item.time}{item.client ? ` · ${item.client}` : ""}
              </div>
            </div>
            {item.type === "showing" && (
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>💬</div>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📞</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <SectionLabel>Recent Activity</SectionLabel>
      {MOCK_NOTIFICATIONS.slice(0, 3).map((n) => (
        <div key={n.id} style={{
          padding: "10px 0", borderBottom: "1px solid #F8FAFC",
          display: "flex", gap: 10, alignItems: "center",
        }}>
          <span style={{ fontSize: 16 }}>{n.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#475569" }}>{n.text}</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{n.time}</div>
          </div>
          {n.unread && <div style={{ width: 6, height: 6, borderRadius: 3, background: "#2563EB" }}/>}
        </div>
      ))}
    </div>
    <TabBar active={SCREENS.DASHBOARD} onNavigate={onNavigate} />
  </>
);

// ── Screen: Scout (Building Research) ────────────────────────

const ScoutScreen = ({ onNavigate }) => (
  <>
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
      {/* Greeting */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#0F172A", letterSpacing: -0.5 }}>Scout</div>
        <div style={{ fontSize: 15, color: "#94A3B8", marginTop: 2 }}>Research any NYC building instantly</div>
      </div>

      {/* Three input methods */}
      <SectionLabel>How do you want to start?</SectionLabel>

      <button onClick={() => onNavigate(SCREENS.CAMERA)} style={{
        width: "100%", padding: "20px 18px", background: "#F8FAFC", border: "1.5px solid #E2E8F0",
        borderRadius: 16, marginBottom: 12, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📸</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A" }}>Photo a Building</div>
          <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>Snap a photo — we'll identify it from GPS</div>
        </div>
      </button>

      <button onClick={() => onNavigate(SCREENS.SCREENSHOT)} style={{
        width: "100%", padding: "20px 18px", background: "#F8FAFC", border: "1.5px solid #E2E8F0",
        borderRadius: 16, marginBottom: 12, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📱</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A" }}>Screenshot a Listing</div>
          <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>StreetEasy, Zillow, any listing screenshot</div>
        </div>
      </button>

      <button onClick={() => onNavigate(SCREENS.URL_PASTE)} style={{
        width: "100%", padding: "20px 18px", background: "#F8FAFC", border: "1.5px solid #E2E8F0",
        borderRadius: 16, marginBottom: 12, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🔗</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A" }}>Paste a URL</div>
          <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>Drop any listing link for instant intel</div>
        </div>
      </button>

      {/* Quick search */}
      <div style={{ marginTop: 16, marginBottom: 20 }}>
        <SectionLabel>Or search by address</SectionLabel>
        <button onClick={() => onNavigate(SCREENS.SEARCH)} style={{
          width: "100%", padding: "14px 16px", background: "#F8FAFC", border: "1.5px solid #E2E8F0",
          borderRadius: 12, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ color: "#94A3B8", fontSize: 16 }}>🔍</span>
          <span style={{ color: "#94A3B8", fontSize: 15 }}>425 W 52nd St, Manhattan...</span>
        </button>
      </div>

      {/* Recent */}
      <SectionLabel>Recently viewed</SectionLabel>
      {MOCK_SAVED.slice(0, 3).map((b) => (
        <button key={b.id} onClick={() => onNavigate(SCREENS.PROFILE)} style={{
          width: "100%", padding: "14px 0", background: "none", border: "none", borderBottom: "1px solid #F1F5F9",
          cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#0F172A" }}>{b.address}</div>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>{b.neighborhood} · {b.units} units · {b.lastViewed}</div>
          </div>
          <span style={{ color: "#CBD5E1", fontSize: 18 }}>›</span>
        </button>
      ))}
    </div>
    <TabBar active={SCREENS.SCOUT} onNavigate={onNavigate} />
  </>
);

// ── Screen: Camera Capture ────────────────────────────────────

const CameraScreen = ({ onNavigate }) => (
  <div style={{ flex: 1, background: "#000", display: "flex", flexDirection: "column", position: "relative" }}>
    {/* Simulated viewfinder */}
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
      {/* Back button */}
      <button onClick={() => onNavigate(SCREENS.SCOUT)} style={{
        position: "absolute", top: 12, left: 16, background: "rgba(255,255,255,0.2)",
        border: "none", borderRadius: 20, width: 36, height: 36, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18,
      }}>←</button>

      {/* Crosshair / guide */}
      <div style={{
        width: 280, height: 220, border: "2px solid rgba(255,255,255,0.4)", borderRadius: 16,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.7)" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏢</div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Point at a building</div>
          <div style={{ fontSize: 12, marginTop: 4, color: "rgba(255,255,255,0.5)" }}>GPS will identify the address</div>
        </div>
      </div>

      {/* GPS indicator */}
      <div style={{
        position: "absolute", top: 12, right: 16, background: "rgba(16,185,129,0.2)",
        borderRadius: 20, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: "#10B981" }}/>
        <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>GPS Active</span>
      </div>
    </div>

    {/* Capture controls */}
    <div style={{ padding: "20px 0 40px", display: "flex", alignItems: "center", justifyContent: "center", gap: 40 }}>
      {/* Gallery */}
      <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 16 }}>🖼️</span>
      </div>
      {/* Shutter */}
      <button onClick={() => onNavigate(SCREENS.RESOLVING)} style={{
        width: 72, height: 72, borderRadius: 36, border: "4px solid #fff",
        background: "rgba(255,255,255,0.1)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, background: "#fff" }}/>
      </button>
      {/* Flip */}
      <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 16 }}>🔄</span>
      </div>
    </div>
  </div>
);

// ── Screen: Screenshot Upload ─────────────────────────────────

const ScreenshotScreen = ({ onNavigate }) => (
  <>
    <div style={{ flex: 1, padding: "12px 20px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => onNavigate(SCREENS.SCOUT)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#64748B", padding: 0 }}>←</button>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A" }}>Screenshot Intel</div>
      </div>

      {/* Upload area */}
      <div style={{
        border: "2px dashed #CBD5E1", borderRadius: 20, padding: "48px 20px",
        textAlign: "center", marginBottom: 24,
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>Upload a listing screenshot</div>
        <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.5 }}>StreetEasy, Zillow, Apartments.com, RentHop —<br/>we'll extract the data with AI</div>
        <button onClick={() => onNavigate(SCREENS.RESOLVING)} style={{
          marginTop: 20, padding: "12px 28px", background: "#2563EB", color: "#fff",
          border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer",
        }}>Choose from Photos</button>
      </div>

      {/* What we extract */}
      <SectionLabel>Claude Vision extracts</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {["Address", "Price", "Beds/Baths", "Sqft", "Broker", "Days on Market", "Unit Details", "Building Name"].map((item) => (
          <div key={item} style={{
            padding: "6px 12px", background: "#F8FAFC", border: "1px solid #E2E8F0",
            borderRadius: 8, fontSize: 13, color: "#64748B",
          }}>{item}</div>
        ))}
      </div>

      <div style={{ marginTop: 24, padding: "16px", background: "#FFFBEB", borderRadius: 12, border: "1px solid #FDE68A" }}>
        <div style={{ fontSize: 13, color: "#92400E", lineHeight: 1.5 }}>
          <strong>Pro tip:</strong> VettdRE layers everything the listing doesn't show — ownership, violations, permits, zoning, rent stabilization. You'll instantly know more than the listing agent.
        </div>
      </div>
    </div>
    <TabBar active={SCREENS.SCOUT} onNavigate={onNavigate} />
  </>
);

// ── Screen: URL Paste ─────────────────────────────────────────

const UrlPasteScreen = ({ onNavigate }) => (
  <>
    <div style={{ flex: 1, padding: "12px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => onNavigate(SCREENS.SCOUT)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#64748B", padding: 0 }}>←</button>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A" }}>Paste a Listing URL</div>
      </div>

      <div style={{
        padding: "16px", background: "#F8FAFC", border: "1.5px solid #E2E8F0",
        borderRadius: 12, marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 8 }}>Listing URL</div>
        <div style={{
          padding: "12px", background: "#fff", border: "1px solid #E2E8F0",
          borderRadius: 8, fontSize: 14, color: "#94A3B8",
        }}>https://streeteasy.com/building/425-west-52...</div>
      </div>

      <button onClick={() => onNavigate(SCREENS.RESOLVING)} style={{
        width: "100%", padding: "14px", background: "#2563EB", color: "#fff",
        border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer",
        marginBottom: 24,
      }}>Get Building Intel</button>

      <SectionLabel>Supported platforms</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {["StreetEasy", "Zillow", "Apartments.com", "RentHop", "Redfin", "Craigslist", "Any listing URL"].map((p) => (
          <div key={p} style={{
            padding: "8px 14px", background: "#F8FAFC", border: "1px solid #E2E8F0",
            borderRadius: 10, fontSize: 13, color: "#64748B",
          }}>{p}</div>
        ))}
      </div>
    </div>
    <TabBar active={SCREENS.SCOUT} onNavigate={onNavigate} />
  </>
);

// ── Screen: Resolving (Loading) ───────────────────────────────

const ResolvingScreen = ({ onNavigate }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const navigatedRef = useRef(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setCurrentStep(1), 400),
      setTimeout(() => setCurrentStep(2), 800),
      setTimeout(() => setCurrentStep(3), 1200),
      setTimeout(() => setCurrentStep(4), 1600),
      setTimeout(() => setCurrentStep(5), 1900),
      setTimeout(() => {
        if (!navigatedRef.current) {
          navigatedRef.current = true;
          onNavigate(SCREENS.PROFILE);
        }
      }, 2300),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const steps = [
    { label: "GPS → Address" },
    { label: "Address → BBL" },
    { label: "Querying MapPLUTO" },
    { label: "ACRIS ownership" },
    { label: "HPD violations" },
    { label: "AI analysis" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{
        width: 80, height: 80, borderRadius: 40, border: "3px solid #E2E8F0",
        borderTopColor: "#2563EB", animation: "spin 1s linear infinite",
        marginBottom: 28,
      }}/>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#0F172A", marginBottom: 8 }}>Resolving address...</div>

      <div style={{ width: "100%", maxWidth: 260, marginTop: 20 }}>
        {steps.map((s, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
              transition: "opacity 0.3s ease",
              opacity: done || active ? 1 : 0.5,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 10,
                background: done ? "#10B981" : active ? "#2563EB" : "#E2E8F0",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: "#fff", fontWeight: 700,
                transition: "background 0.3s ease",
              }}>
                {done ? "✓" : active ? "·" : ""}
              </div>
              <span style={{
                fontSize: 14,
                color: done ? "#10B981" : active ? "#0F172A" : "#94A3B8",
                fontWeight: active ? 600 : 400,
                transition: "color 0.3s ease",
              }}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Screen: Building Profile Card (THE HERO) ──────────────────

const ProfileScreen = ({ onNavigate }) => (
  <>
    <div style={{ flex: 1, overflowY: "auto" }}>
      {/* Header with back + save */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: "1px solid #F1F5F9",
      }}>
        <button onClick={() => onNavigate(SCREENS.SCOUT)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#64748B", padding: 0 }}>←</button>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, color: "#16A34A", cursor: "pointer" }}>
            + Save to Pipeline
          </button>
          <button style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 14, cursor: "pointer" }}>⋯</button>
        </div>
      </div>

      <div style={{ padding: "0 20px 20px" }}>
        {/* Address hero */}
        <div style={{ padding: "20px 0 16px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", letterSpacing: -0.3 }}>{MOCK_BUILDING.address}</div>
          <div style={{ fontSize: 14, color: "#64748B", marginTop: 4 }}>{MOCK_BUILDING.neighborhood}, {MOCK_BUILDING.borough} · {MOCK_BUILDING.zipCode}</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2, fontFamily: "monospace" }}>BBL: {MOCK_BUILDING.bbl}</div>
        </div>

        {/* Quick stats row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Units", value: MOCK_BUILDING.unitsTotal },
            { label: "Floors", value: MOCK_BUILDING.numFloors },
            { label: "Built", value: MOCK_BUILDING.yearBuilt },
            { label: "Zone", value: MOCK_BUILDING.zoneDist1 },
          ].map((s) => (
            <div key={s.label} style={{
              flex: 1, textAlign: "center", padding: "12px 4px", background: "#F8FAFC",
              borderRadius: 12, border: "1px solid #F1F5F9",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* AI Notes */}
        <div style={{
          padding: "16px", background: "#F0F9FF", border: "1px solid #BAE6FD",
          borderRadius: 14, marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", letterSpacing: 0.5, textTransform: "uppercase" }}>AI Analysis</span>
          </div>
          <div style={{ fontSize: 14, color: "#0C4A6E", lineHeight: 1.6 }}>{MOCK_BUILDING.aiNotes}</div>
        </div>

        {/* Ownership section */}
        <SectionLabel>Ownership</SectionLabel>
        <div style={{ background: "#F8FAFC", borderRadius: 14, padding: "16px", marginBottom: 20, border: "1px solid #F1F5F9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>{MOCK_BUILDING.ownerName}</div>
            <div style={{ background: "#DBEAFE", borderRadius: 8, padding: "3px 8px", fontSize: 11, fontWeight: 600, color: "#2563EB" }}>
              {MOCK_BUILDING.ownerConfidence}% confidence
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>Purchase Price</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>${(MOCK_BUILDING.lastSalePrice/1e6).toFixed(1)}M</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>Purchase Date</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Mar 2019</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>Mortgage</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>${(MOCK_BUILDING.mortgageAmount/1e6).toFixed(0)}M</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>Lender</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{MOCK_BUILDING.mortgageLender}</div>
            </div>
          </div>
        </div>

        {/* Condition signals */}
        <SectionLabel>Condition Signals</SectionLabel>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, padding: "14px", background: MOCK_BUILDING.hpdViolations.open > 10 ? "#FEF2F2" : "#F8FAFC", borderRadius: 12, border: `1px solid ${MOCK_BUILDING.hpdViolations.open > 10 ? "#FECACA" : "#F1F5F9"}`, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: MOCK_BUILDING.hpdViolations.open > 10 ? "#DC2626" : "#0F172A" }}>{MOCK_BUILDING.hpdViolations.open}</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Open Violations</div>
          </div>
          <div style={{ flex: 1, padding: "14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A" }}>{MOCK_BUILDING.hpdComplaints.open}</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Open Complaints</div>
          </div>
          <div style={{ flex: 1, padding: "14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A" }}>{MOCK_BUILDING.activePermits}</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Active Permits</div>
          </div>
        </div>

        {/* Rent Stabilization */}
        {MOCK_BUILDING.rentStabilized && (
          <div style={{
            padding: "14px 16px", background: "#FFFBEB", border: "1px solid #FDE68A",
            borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#92400E" }}>Rent Stabilized</div>
              <div style={{ fontSize: 13, color: "#A16207" }}>{MOCK_BUILDING.rsUnits} of {MOCK_BUILDING.unitsTotal} units</div>
            </div>
            <div style={{ background: "#FEF3C7", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "#92400E" }}>
              {Math.round((MOCK_BUILDING.rsUnits / MOCK_BUILDING.unitsTotal) * 100)}% RS
            </div>
          </div>
        )}

        {/* Distress Score */}
        <SectionLabel>Distress Score</SectionLabel>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{MOCK_BUILDING.distressScore}/100</span>
            <span style={{ fontSize: 12, color: "#64748B" }}>Moderate distress</span>
          </div>
          <div style={{ height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              width: `${MOCK_BUILDING.distressScore}%`, height: "100%", borderRadius: 4,
              background: MOCK_BUILDING.distressScore > 70 ? "#EF4444" : MOCK_BUILDING.distressScore > 40 ? "#F59E0B" : "#10B981",
            }}/>
          </div>
        </div>

        {/* Recent Permits */}
        <SectionLabel>Recent Permits</SectionLabel>
        {MOCK_BUILDING.recentPermits.map((p, i) => (
          <div key={i} style={{
            padding: "12px 14px", background: "#F8FAFC", borderRadius: 12,
            border: "1px solid #F1F5F9", marginBottom: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{p.type}</span>
              <span style={{ fontSize: 12, color: "#94A3B8" }}>{p.filed}</span>
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{p.description}</div>
          </div>
        ))}

        {/* Development Potential */}
        <div style={{ marginTop: 12 }}>
          <SectionLabel>Development Potential</SectionLabel>
          <div style={{ padding: "16px", background: "#F0FDF4", borderRadius: 14, border: "1px solid #BBF7D0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: "#64748B" }}>Built FAR</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{MOCK_BUILDING.builtFAR}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: "#64748B" }}>Max FAR</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{MOCK_BUILDING.maxFAR}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 600 }}>Unused FAR</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#16A34A" }}>{(MOCK_BUILDING.maxFAR - MOCK_BUILDING.builtFAR).toFixed(2)} ({Math.round((MOCK_BUILDING.maxFAR - MOCK_BUILDING.builtFAR) * MOCK_BUILDING.lotArea).toLocaleString()} sqft)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <TabBar active={SCREENS.SCOUT} onNavigate={onNavigate} />
  </>
);

// ── Screen: Saved Buildings ───────────────────────────────────

const SavedScreen = ({ onNavigate }) => (
  <>
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#0F172A" }}>Buildings</div>
        <div style={{ fontSize: 13, color: "#94A3B8" }}>{MOCK_SAVED.length} saved</div>
      </div>

      {/* Search */}
      <div style={{
        padding: "10px 14px", background: "#F8FAFC", border: "1px solid #E2E8F0",
        borderRadius: 10, marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: "#94A3B8" }}>🔍</span>
        <span style={{ color: "#94A3B8", fontSize: 14 }}>Search saved buildings...</span>
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto" }}>
        {["All", "New", "Contacted", "In Discussion"].map((f, i) => (
          <div key={f} style={{
            padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
            background: i === 0 ? "#0F172A" : "#F8FAFC",
            color: i === 0 ? "#fff" : "#64748B",
            border: i === 0 ? "none" : "1px solid #E2E8F0",
          }}>{f}</div>
        ))}
      </div>

      {/* Building cards */}
      {MOCK_SAVED.map((b) => (
        <button key={b.id} onClick={() => onNavigate(SCREENS.PROFILE)} style={{
          width: "100%", padding: "16px", background: "#fff", border: "1px solid #F1F5F9",
          borderRadius: 14, marginBottom: 10, cursor: "pointer", textAlign: "left",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A" }}>{b.address}</div>
              <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>{b.neighborhood} · {b.units} units</div>
            </div>
            <div style={{
              padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
              color: STATUS_COLORS[b.status], background: `${STATUS_COLORS[b.status]}18`,
            }}>{b.status.replace("_", " ")}</div>
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>Viewed {b.lastViewed}</div>
        </button>
      ))}
    </div>
    <TabBar active={SCREENS.SCOUT} onNavigate={onNavigate} />
  </>
);

// ── Screen: Map View ──────────────────────────────────────────

const MapScreen = ({ onNavigate }) => (
  <>
    <div style={{ flex: 1, position: "relative", background: "#E8ECF1" }}>
      {/* Simulated map */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #E8ECF1 0%, #D1D9E6 50%, #C8D0DC 100%)" }}>
        {/* Grid lines to simulate streets */}
        {[100, 200, 300, 400, 500, 600].map((y) => (
          <div key={`h${y}`} style={{ position: "absolute", left: 0, right: 0, top: y, height: 1, background: "rgba(148,163,184,0.3)" }}/>
        ))}
        {[60, 130, 200, 270, 340].map((x) => (
          <div key={`v${x}`} style={{ position: "absolute", top: 0, bottom: 0, left: x, width: 1, background: "rgba(148,163,184,0.3)" }}/>
        ))}

        {/* Pins */}
        {[
          { x: 100, y: 180, status: "contacted", label: "425 W 52nd" },
          { x: 220, y: 290, status: "new", label: "310 E 46th" },
          { x: 160, y: 420, status: "in_discussion", label: "88 Greenwich" },
          { x: 280, y: 160, status: "new", label: "45-17 21st" },
          { x: 80, y: 350, status: "researched", label: "1501 Broadway" },
        ].map((pin, i) => (
          <button key={i} onClick={() => onNavigate(SCREENS.PROFILE)} style={{
            position: "absolute", left: pin.x, top: pin.y,
            width: 28, height: 28, borderRadius: 14, background: STATUS_COLORS[pin.status],
            border: "3px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, color: "#fff", fontWeight: 700, zIndex: 2,
          }}>
            {i + 1}
          </button>
        ))}

        {/* Current location */}
        <div style={{
          position: "absolute", left: 180, top: 340,
          width: 16, height: 16, borderRadius: 8, background: "#2563EB",
          border: "3px solid #fff", boxShadow: "0 0 0 8px rgba(37,99,235,0.15)",
          zIndex: 3,
        }}/>
      </div>

      {/* Map controls */}
      <div style={{ position: "absolute", top: 12, left: 20, right: 20, zIndex: 5 }}>
        <div style={{
          padding: "12px 16px", background: "#fff", borderRadius: 14,
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ color: "#94A3B8" }}>🔍</span>
          <span style={{ color: "#94A3B8", fontSize: 14, flex: 1 }}>Search this area...</span>
          <div style={{
            display: "flex", gap: 2, background: "#F1F5F9", borderRadius: 8, padding: 2,
          }}>
            <div style={{ padding: "4px 10px", background: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#0F172A" }}>Map</div>
            <button onClick={() => onNavigate(SCREENS.SAVED)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, color: "#64748B", background: "none", border: "none", cursor: "pointer" }}>List</button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: 12, left: 20, right: 20, zIndex: 5,
        padding: "12px 16px", background: "#fff", borderRadius: 14,
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {PIPELINE_STAGES.slice(0, 4).map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: s.color }}/>
              <span style={{ fontSize: 11, color: "#64748B" }}>{s.label} ({s.count})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    <TabBar active={SCREENS.SCOUT} onNavigate={onNavigate} />
  </>
);

// ── Screen: Pipeline (Buildings + Clients toggle) ────────────

const PipelineScreen = ({ onNavigate }) => {
  const [pipelineTab, setPipelineTab] = useState("buildings");
  const total = PIPELINE_STAGES.reduce((s, st) => s + st.count, 0);

  // Maps to OnboardingStatus enum + Contact lifecycle
  const CLIENT_STAGES = [
    { key: "pending", label: "Invite Sent", color: "#F59E0B", count: 2 },
    { key: "partially_signed", label: "Docs In Progress", color: "#3B82F6", count: 1 },
    { key: "completed", label: "Fully Signed", color: "#10B981", count: 2 },
    { key: "active", label: "Active Client", color: "#8B5CF6", count: 3 },
    { key: "closed", label: "Deal Closed", color: "#059669", count: 5 },
  ];
  const clientTotal = CLIENT_STAGES.reduce((s, st) => s + st.count, 0);

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 0" }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Pipeline</div>

        {/* Toggle */}
        <div style={{
          display: "flex", background: "#F1F5F9", borderRadius: 12, padding: 3, marginBottom: 20,
        }}>
          <button onClick={() => setPipelineTab("buildings")} style={{
            flex: 1, padding: "10px", borderRadius: 10, fontSize: 14, fontWeight: 600,
            border: "none", cursor: "pointer",
            background: pipelineTab === "buildings" ? "#fff" : "transparent",
            color: pipelineTab === "buildings" ? "#0F172A" : "#94A3B8",
            boxShadow: pipelineTab === "buildings" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}>🏢 Buildings ({total})</button>
          <button onClick={() => setPipelineTab("clients")} style={{
            flex: 1, padding: "10px", borderRadius: 10, fontSize: 14, fontWeight: 600,
            border: "none", cursor: "pointer",
            background: pipelineTab === "clients" ? "#fff" : "transparent",
            color: pipelineTab === "clients" ? "#0F172A" : "#94A3B8",
            boxShadow: pipelineTab === "clients" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}>👤 Clients ({clientTotal})</button>
        </div>

        {pipelineTab === "buildings" ? (
          <>
            {/* Stage breakdown bar */}
            <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 20, gap: 2 }}>
              {PIPELINE_STAGES.map((s) => (
                <div key={s.key} style={{ flex: s.count, background: s.color, borderRadius: 3 }}/>
              ))}
            </div>

            {/* Stage cards */}
            {PIPELINE_STAGES.map((stage) => (
              <div key={stage.key} style={{
                padding: "14px 16px", background: "#fff", border: "1px solid #F1F5F9",
                borderRadius: 12, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${stage.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: stage.color }}/>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>{stage.label}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>{stage.count} building{stage.count !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <span style={{ color: "#CBD5E1", fontSize: 18 }}>›</span>
              </div>
            ))}

            {/* Recent activity */}
            <div style={{ marginTop: 20 }}>
              <SectionLabel>Recent Activity</SectionLabel>
              {[
                { text: "Moved 88 Greenwich St to In Discussion", time: "2h ago" },
                { text: "Added notes to 425 W 52nd St", time: "5h ago" },
                { text: "Saved 45-17 21st St from screenshot", time: "1d ago" },
              ].map((a, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #F8FAFC", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#475569" }}>{a.text}</span>
                  <span style={{ fontSize: 12, color: "#94A3B8", whiteSpace: "nowrap", marginLeft: 8 }}>{a.time}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Client stage breakdown bar */}
            <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 20, gap: 2 }}>
              {CLIENT_STAGES.map((s) => (
                <div key={s.key} style={{ flex: s.count, background: s.color, borderRadius: 3 }}/>
              ))}
            </div>

            {/* Client stage cards */}
            {CLIENT_STAGES.map((stage) => (
              <div key={stage.key} style={{
                padding: "14px 16px", background: "#fff", border: "1px solid #F1F5F9",
                borderRadius: 12, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${stage.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: stage.color }}/>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>{stage.label}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>{stage.count} client{stage.count !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <span style={{ color: "#CBD5E1", fontSize: 18 }}>›</span>
              </div>
            ))}

            {/* Clients needing action */}
            <div style={{ marginTop: 20 }}>
              <SectionLabel>Needs Attention</SectionLabel>
              {[
                { name: "Marcus Williams", issue: "Docs sent 2 days ago — not opened", urgent: true },
                { name: "Rachel Torres", issue: "Invite expired — resend?", urgent: true },
                { name: "David Kim", issue: "1 of 3 docs signed — nudge?", urgent: false },
              ].map((c, i) => (
                <div key={i} style={{
                  padding: "12px 14px", background: c.urgent ? "#FEF2F2" : "#FFFBEB",
                  border: `1px solid ${c.urgent ? "#FECACA" : "#FDE68A"}`,
                  borderRadius: 12, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{clientName(c)}</div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{c.issue}</div>
                  </div>
                  <button onClick={() => onNavigate(SCREENS.CLIENT_DETAIL)} style={{
                    padding: "6px 12px", background: "#fff", border: "1px solid #E2E8F0",
                    borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#2563EB", cursor: "pointer",
                  }}>View</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <TabBar active={SCREENS.PIPELINE} onNavigate={onNavigate} />
    </>
  );
};

// ── Screen: Earnings ──────────────────────────────────────────

const EarningsScreen = ({ onNavigate }) => (
  <>
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => onNavigate(SCREENS.DASHBOARD)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#64748B", padding: 0 }}>←</button>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A" }}>Earnings</div>
      </div>
      {/* Hero balance */}
      <div style={{
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
        borderRadius: 20, padding: "24px 20px", color: "#fff", marginBottom: 20,
      }}>
        <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 4 }}>Total Earned</div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>$47,200</div>
        <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>Pending</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#FBBF24" }}>$5,200</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>This Month</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#34D399" }}>$8,400</div>
          </div>
        </div>
      </div>

      {/* Period pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {["Week", "Month", "Quarter", "Year"].map((p, i) => (
          <div key={p} style={{
            padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500,
            background: i === 1 ? "#0F172A" : "#F8FAFC",
            color: i === 1 ? "#fff" : "#64748B",
          }}>{p}</div>
        ))}
      </div>

      {/* Mini chart */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, marginBottom: 20, padding: "0 4px" }}>
        {[3200, 5100, 0, 8400, 6200, 4800].map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: "100%", maxWidth: 32, borderRadius: 6,
              height: `${Math.max((v / 8400) * 80, 2)}%`,
              background: i === 3 ? "#10B981" : v > 0 ? "#3B82F6" : "#E2E8F0",
            }}/>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>{["Jan", "Feb", "Mar", "Apr", "May", "Jun"][i]}</span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Deals", value: "3", icon: "📋" },
          { label: "Avg Deal", value: "$2.8K", icon: "📊" },
          { label: "Volume", value: "$284K", icon: "🏢" },
          { label: "Split", value: "70/30", icon: "💰" },
        ].map((s) => (
          <div key={s.label} style={{
            padding: "14px", background: "#F8FAFC", borderRadius: 14,
            border: "1px solid #F1F5F9",
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent deals */}
      <SectionLabel>Recent Deals</SectionLabel>
      {[
        { addr: "310 E 46th St #4A", status: "paid", amount: "$4,200", date: "Mar 28" },
        { addr: "88 Greenwich St #12B", status: "invoiced", amount: "$5,200", date: "Mar 15" },
        { addr: "425 W 52nd St #8C", status: "paid", amount: "$3,800", date: "Feb 20" },
      ].map((d, i) => (
        <div key={i} style={{
          padding: "12px 0", borderBottom: "1px solid #F8FAFC",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: 4,
              background: d.status === "paid" ? "#10B981" : "#F59E0B",
            }}/>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#0F172A" }}>{d.addr}</div>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>{d.date}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: d.status === "paid" ? "#10B981" : "#0F172A" }}>+{d.amount}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{d.status}</div>
          </div>
        </div>
      ))}
    </div>
    <TabBar active={SCREENS.DASHBOARD} onNavigate={onNavigate} />
  </>
);

// ── Screen: Search ────────────────────────────────────────────

const SearchScreen = ({ onNavigate }) => (
  <>
    <div style={{ flex: 1, padding: "12px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => onNavigate(SCREENS.SCOUT)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#64748B", padding: 0 }}>←</button>
        <div style={{
          flex: 1, padding: "12px 14px", background: "#F8FAFC", border: "1.5px solid #2563EB",
          borderRadius: 12, fontSize: 15, color: "#0F172A",
        }}>425 W 52nd St|</div>
      </div>

      <SectionLabel>Search by address, BBL, or owner name</SectionLabel>

      {/* Results */}
      <div style={{ marginTop: 12 }}>
        {[
          { addr: "425 W 52nd St", detail: "Manhattan · Hell's Kitchen · 187 units · D4" },
          { addr: "425 W 52nd St #PHA", detail: "Manhattan · Condo unit · 2BR" },
        ].map((r, i) => (
          <button key={i} onClick={() => onNavigate(SCREENS.RESOLVING)} style={{
            width: "100%", padding: "14px 0", background: "none", border: "none",
            borderBottom: "1px solid #F1F5F9", cursor: "pointer", textAlign: "left",
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#0F172A" }}>{r.addr}</div>
            <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>{r.detail}</div>
          </button>
        ))}
      </div>

      {/* AI search hint */}
      <div style={{
        marginTop: 28, padding: "16px", background: "#F0F9FF", borderRadius: 14,
        border: "1px solid #BAE6FD",
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0369A1", marginBottom: 6 }}>Try natural language search</div>
        <div style={{ fontSize: 13, color: "#0C4A6E", lineHeight: 1.5 }}>
          "Prewar 20+ unit buildings in Washington Heights"<br/>
          "Rent-stabilized with 10+ open violations in the Bronx"
        </div>
        <div style={{ marginTop: 10, padding: "8px 14px", background: "#DBEAFE", borderRadius: 8, display: "inline-block", fontSize: 12, fontWeight: 600, color: "#2563EB" }}>
          Coming in Phase 3
        </div>
      </div>
    </div>
    <TabBar active={SCREENS.SCOUT} onNavigate={onNavigate} />
  </>
);

// ── Screen: Notifications / Alerts ───────────────────────────

const NotificationsScreen = ({ onNavigate }) => (
  <>
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#0F172A" }}>Alerts</div>
        <button style={{
          padding: "6px 14px", background: "#F8FAFC", border: "1px solid #E2E8F0",
          borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#64748B", cursor: "pointer",
        }}>Mark all read</button>
      </div>

      {/* Today */}
      <SectionLabel>Today</SectionLabel>
      {MOCK_NOTIFICATIONS.filter(n => n.unread).map((n) => (
        <div key={n.id} style={{
          padding: "14px 16px", background: "#EFF6FF", border: "1px solid #DBEAFE",
          borderRadius: 14, marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 20, marginTop: 1 }}>{n.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#0F172A" }}>{n.text}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{n.time}</div>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "#2563EB", marginTop: 6, flexShrink: 0 }}/>
        </div>
      ))}

      {/* Earlier */}
      <div style={{ marginTop: 8 }}>
        <SectionLabel>Earlier</SectionLabel>
        {MOCK_NOTIFICATIONS.filter(n => !n.unread).map((n) => (
          <div key={n.id} style={{
            padding: "14px 16px", background: "#fff", border: "1px solid #F1F5F9",
            borderRadius: 14, marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 20, marginTop: 1 }}>{n.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#475569" }}>{n.text}</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{n.time}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Notification preferences */}
      <div style={{
        marginTop: 16, padding: "14px 16px", background: "#F8FAFC",
        borderRadius: 14, border: "1px solid #E2E8F0", textAlign: "center",
      }}>
        <div style={{ fontSize: 13, color: "#64748B" }}>Manage notification preferences in <span style={{ fontWeight: 600, color: "#2563EB" }}>Settings</span></div>
      </div>
    </div>
    <TabBar active={SCREENS.NOTIFICATIONS} onNavigate={onNavigate} />
  </>
);

// ── Screen: Clients (Registration Hub) ───────────────────────

const ClientsScreen = ({ onNavigate }) => {
  const completed = MOCK_CLIENTS.filter(c => c.status === "completed").length;
  const pending = MOCK_CLIENTS.filter(c => c.status === "pending" || c.status === "partially_signed").length;

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0F172A" }}>Clients</div>
            <div style={{ fontSize: 14, color: "#94A3B8", marginTop: 2 }}>{MOCK_CLIENTS.length} total · {completed} signed · {pending} pending</div>
          </div>
          <button onClick={() => onNavigate(SCREENS.CLIENT_INVITE)} style={{
            padding: "10px 16px", background: "#2563EB", color: "#fff",
            border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 16 }}>+</span> Invite
          </button>
        </div>

        {/* Status summary cards */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Pending", count: pending, color: "#F59E0B", bg: "#FFFBEB" },
            { label: "Signed", count: completed, color: "#10B981", bg: "#F0FDF4" },
            { label: "Expired", count: MOCK_CLIENTS.filter(c => c.status === "expired").length, color: "#94A3B8", bg: "#F8FAFC" },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, padding: "14px 10px", borderRadius: 14, background: s.bg,
              border: `1px solid ${s.color}30`, textAlign: "center",
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
          {["All", "Pending", "In Progress", "Completed", "Expired"].map((f, i) => (
            <div key={f} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
              background: i === 0 ? "#0F172A" : "#F8FAFC",
              color: i === 0 ? "#fff" : "#64748B",
              border: i === 0 ? "none" : "1px solid #E2E8F0",
            }}>{f}</div>
          ))}
        </div>

        {/* Client cards */}
        {MOCK_CLIENTS.map((c) => (
          <button key={c.id} onClick={() => onNavigate(SCREENS.CLIENT_DETAIL)} style={{
            width: "100%", padding: "16px", background: "#fff", border: "1px solid #F1F5F9",
            borderRadius: 14, marginBottom: 10, cursor: "pointer", textAlign: "left",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 21, background: "#F1F5F9",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 600, color: "#64748B",
                }}>{clientInitials(c)}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>{clientName(c)}</div>
                  <div style={{ fontSize: 13, color: "#64748B", marginTop: 1 }}>{c.email}</div>
                </div>
              </div>
              <div style={{
                padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                color: CLIENT_STATUS_COLORS[c.status],
                background: `${CLIENT_STATUS_COLORS[c.status]}18`,
              }}>{CLIENT_STATUS_LABELS[c.status]}</div>
            </div>

            {/* Document progress */}
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 4, background: "#F1F5F9", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${(c.docsComplete / c.docs) * 100}%`, height: "100%", background: c.docsComplete === c.docs ? "#10B981" : "#3B82F6", borderRadius: 2 }}/>
              </div>
              <span style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>{c.docsComplete}/{c.docs} docs</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 12, color: "#94A3B8" }}>Sent {c.sentAt}</span>
              {c.completedAt && <span style={{ fontSize: 12, color: "#10B981" }}>Completed {c.completedAt}</span>}
            </div>
          </button>
        ))}
      </div>
      <TabBar active={SCREENS.CLIENTS} onNavigate={onNavigate} />
    </>
  );
};

// ── Screen: Client Invite (New Onboarding) ───────────────────

const ClientInviteScreen = ({ onNavigate }) => {
  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 0" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={() => onNavigate(SCREENS.CLIENTS)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#64748B", padding: 0 }}>←</button>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A" }}>New Client Invite</div>
        </div>

        {/* Client Info Section */}
        <SectionLabel>Client Information</SectionLabel>
        <div style={{ marginBottom: 20 }}>
          {[
            { label: "Full Name", placeholder: "Sarah Chen", filled: true },
            { label: "Email", placeholder: "sarah.chen@gmail.com", filled: true },
            { label: "Phone", placeholder: "(917) 555-0142", filled: true },
          ].map((f) => (
            <div key={f.label} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#64748B", marginBottom: 4 }}>{f.label}</div>
              <div style={{
                padding: "12px 14px", background: "#F8FAFC", border: "1.5px solid #E2E8F0",
                borderRadius: 10, fontSize: 15, color: f.filled ? "#0F172A" : "#94A3B8",
              }}>{f.placeholder}</div>
            </div>
          ))}
        </div>

        {/* Document Selection */}
        <SectionLabel>Documents to Sign</SectionLabel>
        <div style={{ marginBottom: 20 }}>
          {[
            { name: "DOS-1736 — Agency Disclosure", checked: true, required: true },
            { name: "DOS-2156 — Fair Housing Notice", checked: true, required: true },
            { name: "Tenant Representation Agreement", checked: true, required: false },
          ].map((d) => (
            <div key={d.name} style={{
              padding: "14px 16px", background: "#fff", border: "1px solid #F1F5F9",
              borderRadius: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6, border: d.checked ? "none" : "2px solid #CBD5E1",
                background: d.checked ? "#2563EB" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, color: "#fff", fontWeight: 700,
              }}>{d.checked ? "✓" : ""}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#0F172A" }}>{d.name}</div>
                {d.required && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>Required by NYS</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Delivery Method */}
        <SectionLabel>Send Invite Via</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[
            { label: "Email + SMS", icon: "📲", active: true },
            { label: "Email Only", icon: "📧", active: false },
            { label: "SMS Only", icon: "💬", active: false },
            { label: "Copy Link", icon: "🔗", active: false },
          ].map((m) => (
            <div key={m.label} style={{
              flex: 1, padding: "12px 6px", borderRadius: 12, textAlign: "center",
              background: m.active ? "#EFF6FF" : "#F8FAFC",
              border: m.active ? "1.5px solid #2563EB" : "1px solid #E2E8F0",
              cursor: "pointer",
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
              <div style={{ fontSize: 10, fontWeight: m.active ? 600 : 400, color: m.active ? "#2563EB" : "#64748B" }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Preview message */}
        <div style={{
          padding: "14px 16px", background: "#F8FAFC", borderRadius: 14,
          border: "1px solid #E2E8F0", marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>Preview</div>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
            Hi Sarah, Nathan from VettdRE has invited you to complete your onboarding documents. Tap the link below to review and sign: <span style={{ color: "#2563EB" }}>vettdre.com/sign/abc123</span>
          </div>
        </div>

        {/* Send Button */}
        <button onClick={() => onNavigate(SCREENS.INVITE_SENT)} style={{
          width: "100%", padding: "16px", background: "#2563EB", color: "#fff",
          border: "none", borderRadius: 14, fontSize: 16, fontWeight: 600,
          cursor: "pointer", marginBottom: 20,
        }}>Send Invite</button>
      </div>
    </>
  );
};

// ── Screen: Client Detail ────────────────────────────────────

const ClientDetailScreen = ({ onNavigate }) => {
  const client = MOCK_CLIENTS[2]; // David Kim — "partially_signed" status for interesting detail
  return (
    <>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", borderBottom: "1px solid #F1F5F9",
        }}>
          <button onClick={() => onNavigate(SCREENS.CLIENTS)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#64748B", padding: 0 }}>←</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 500, color: "#64748B", cursor: "pointer" }}>
              Resend
            </button>
            <button style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 14, cursor: "pointer" }}>⋯</button>
          </div>
        </div>

        <div style={{ padding: "0 20px 20px" }}>
          {/* Client hero */}
          <div style={{ padding: "20px 0 16px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 28, background: "#EFF6FF",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 600, color: "#2563EB",
            }}>{clientInitials(client)}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A" }}>{clientName(client)}</div>
              <div style={{ fontSize: 14, color: "#64748B", marginTop: 2 }}>{client.email}</div>
              <div style={{ fontSize: 14, color: "#64748B" }}>{client.phone}</div>
            </div>
          </div>

          {/* Status banner */}
          <div style={{
            padding: "14px 16px", background: "#EFF6FF", border: "1px solid #BFDBFE",
            borderRadius: 14, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1D4ED8" }}>Viewed — 1 of 3 docs signed</div>
              <div style={{ fontSize: 12, color: "#3B82F6", marginTop: 2 }}>Last opened Mar 30, 2:45 PM</div>
            </div>
            <div style={{
              width: 42, height: 42, borderRadius: 21, background: "#DBEAFE",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 700, color: "#2563EB",
            }}>33%</div>
          </div>

          {/* Document status */}
          <SectionLabel>Documents</SectionLabel>
          {[
            { name: "DOS-1736 — Agency Disclosure", status: "signed", signedAt: "Mar 30, 2:12 PM" },
            { name: "DOS-2156 — Fair Housing Notice", status: "viewed", signedAt: null },
            { name: "Tenant Rep Agreement", status: "not_opened", signedAt: null },
          ].map((d, i) => (
            <div key={i} style={{
              padding: "14px 16px", background: "#fff", border: "1px solid #F1F5F9",
              borderRadius: 14, marginBottom: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: d.status === "signed" ? "#F0FDF4" : d.status === "viewed" ? "#EFF6FF" : "#F8FAFC",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                  }}>
                    {d.status === "signed" ? "✅" : d.status === "viewed" ? "👁" : "📄"}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#0F172A" }}>{d.name}</div>
                    {d.signedAt && <div style={{ fontSize: 12, color: "#10B981", marginTop: 2 }}>Signed {d.signedAt}</div>}
                    {d.status === "viewed" && <div style={{ fontSize: 12, color: "#3B82F6", marginTop: 2 }}>Opened, not yet signed</div>}
                    {d.status === "not_opened" && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Not yet opened</div>}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Activity timeline */}
          <div style={{ marginTop: 16 }}>
            <SectionLabel>Activity</SectionLabel>
            {[
              { text: "Signed DOS-1736 Agency Disclosure", time: "Mar 30, 2:12 PM", icon: "✅" },
              { text: "Opened signing link", time: "Mar 30, 2:08 PM", icon: "👁" },
              { text: "Invite sent via email + SMS", time: "Mar 29, 10:15 AM", icon: "📲" },
            ].map((a, i) => (
              <div key={i} style={{
                padding: "10px 0", borderBottom: "1px solid #F8FAFC",
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 14, marginTop: 1 }}>{a.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#475569" }}>{a.text}</div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
            <button style={{
              flex: 1, padding: "12px", background: "#F0FDF4", border: "1px solid #BBF7D0",
              borderRadius: 12, fontSize: 13, fontWeight: 600, color: "#16A34A", cursor: "pointer",
            }}>💬 Text Client</button>
            <button style={{
              flex: 1, padding: "12px", background: "#EFF6FF", border: "1px solid #BFDBFE",
              borderRadius: 12, fontSize: 13, fontWeight: 600, color: "#2563EB", cursor: "pointer",
            }}>📧 Email Client</button>
          </div>
        </div>
      </div>
      <TabBar active={SCREENS.CLIENTS} onNavigate={onNavigate} />
    </>
  );
};

// ── Screen: Invite Sent Confirmation ─────────────────────────

const InviteSentScreen = ({ onNavigate }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
    <div style={{
      width: 80, height: 80, borderRadius: 40, background: "#F0FDF4",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 40, marginBottom: 24,
    }}>✓</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Invite Sent!</div>
    <div style={{ fontSize: 15, color: "#64748B", textAlign: "center", lineHeight: 1.5, marginBottom: 8 }}>
      Sarah Chen will receive an email and text with their signing link.
    </div>
    <div style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", marginBottom: 32 }}>
      3 documents · DOS-1736, DOS-2156, Tenant Rep Agreement
    </div>

    {/* Status preview */}
    <div style={{
      width: "100%", padding: "16px", background: "#F8FAFC", borderRadius: 14,
      border: "1px solid #E2E8F0", marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>Delivery Status</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: "#10B981" }}/>
        <span style={{ fontSize: 14, color: "#0F172A" }}>Email delivered</span>
        <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: "auto" }}>Just now</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: "#10B981" }}/>
        <span style={{ fontSize: 14, color: "#0F172A" }}>SMS delivered</span>
        <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: "auto" }}>Just now</span>
      </div>
    </div>

    <div style={{ display: "flex", gap: 10, width: "100%" }}>
      <button onClick={() => onNavigate(SCREENS.CLIENT_INVITE)} style={{
        flex: 1, padding: "14px", background: "#F8FAFC", border: "1px solid #E2E8F0",
        borderRadius: 12, fontSize: 14, fontWeight: 600, color: "#64748B", cursor: "pointer",
      }}>Invite Another</button>
      <button onClick={() => onNavigate(SCREENS.CLIENTS)} style={{
        flex: 1, padding: "14px", background: "#2563EB", color: "#fff",
        border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
      }}>View Clients</button>
    </div>
  </div>
);

// ── App Root ──────────────────────────────────────────────────

// ── Performance Architecture Notes ────────────────────────────
// In the real Expo/React Native build, these patterns translate to:
//
// 1. INSTANT SCREEN TRANSITIONS
//    - React Navigation with native stack (not JS-based)
//    - Shared element transitions for building cards
//    - Tab bar uses @react-navigation/bottom-tabs (native)
//    - Screens pre-rendered in background via React.memo + lazy
//
// 2. DATA FEELS INSTANT
//    - Supabase Realtime subscriptions (not polling)
//    - React Query with staleTime: 5min, gcTime: 30min
//    - Optimistic updates on all mutations (pipeline moves, invite sends)
//    - SQLite offline cache via @op-engineering/op-sqlite
//    - Building profiles: cache BBL lookups locally after first fetch
//
// 3. SCOUT SPEED (the core loop)
//    - Camera: EXIF GPS extracted on-device (no server round-trip for coords)
//    - Geocode + BBL resolution: edge function (~80ms p95)
//    - Building profile: parallel Promise.allSettled (PLUTO + ACRIS + HPD + DOB)
//    - Progressive rendering: show what we have, stream the rest
//    - AI analysis streams via SSE (partial results visible immediately)
//
// 4. PERCEIVED SPEED
//    - Skeleton screens on every data-dependent view
//    - Haptic feedback on every tap (Haptics.impactAsync)
//    - Pull-to-refresh with native feel
//    - Prefetch next likely screen (e.g., viewing Clients → prefetch invite form)
//    - Image/avatar placeholders with shimmer animation
//
// 5. OFFLINE FIRST
//    - Saved buildings viewable offline (SQLite)
//    - Queue invite sends when offline → auto-send on reconnect
//    - Pipeline changes sync in background via Supabase Realtime

export default function VettdREMobileWireframe() {
  const [screen, setScreen] = useState(SCREENS.DASHBOARD);
  const prevScreenRef = useRef(SCREENS.DASHBOARD);
  const navigate = useCallback((s) => {
    prevScreenRef.current = s;
    setScreen(s);
  }, []);

  const screenMap = {
    [SCREENS.DASHBOARD]: DashboardScreen,
    [SCREENS.SCOUT]: ScoutScreen,
    [SCREENS.CAMERA]: CameraScreen,
    [SCREENS.SCREENSHOT]: ScreenshotScreen,
    [SCREENS.URL_PASTE]: UrlPasteScreen,
    [SCREENS.RESOLVING]: ResolvingScreen,
    [SCREENS.PROFILE]: ProfileScreen,
    [SCREENS.SAVED]: SavedScreen,
    [SCREENS.MAP]: MapScreen,
    [SCREENS.PIPELINE]: PipelineScreen,
    [SCREENS.EARNINGS]: EarningsScreen,
    [SCREENS.SEARCH]: SearchScreen,
    [SCREENS.NOTIFICATIONS]: NotificationsScreen,
    [SCREENS.CLIENTS]: ClientsScreen,
    [SCREENS.CLIENT_INVITE]: ClientInviteScreen,
    [SCREENS.CLIENT_DETAIL]: ClientDetailScreen,
    [SCREENS.INVITE_SENT]: InviteSentScreen,
  };

  const CurrentScreen = screenMap[screen] || DashboardScreen;

  return (
    <div style={{
      minHeight: "100vh", background: "#F1F5F9",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "40px 20px", gap: 24,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#0F172A", letterSpacing: -0.5 }}>VettdRE Mobile</div>
        <div style={{ fontSize: 14, color: "#64748B", marginTop: 4 }}>Interactive Wireframe Prototype · Tap to navigate</div>
      </div>

      {/* key={screen} forces re-mount → re-triggers fadeIn animation on every nav */}
      <Phone key={screen}>
        <CurrentScreen onNavigate={navigate} />
      </Phone>

      {/* Screen indicator */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 520 }}>
        {[
          [SCREENS.DASHBOARD, "Home"],
          [SCREENS.SCOUT, "Scout"],
          [SCREENS.CAMERA, "Camera"],
          [SCREENS.SCREENSHOT, "Screenshot"],
          [SCREENS.URL_PASTE, "URL"],
          [SCREENS.PROFILE, "Profile"],
          [SCREENS.SAVED, "Buildings"],
          [SCREENS.MAP, "Map"],
          [SCREENS.PIPELINE, "Pipeline"],
          [SCREENS.EARNINGS, "Earnings"],
          [SCREENS.CLIENTS, "Clients"],
          [SCREENS.CLIENT_INVITE, "Invite"],
          [SCREENS.CLIENT_DETAIL, "Client Detail"],
          [SCREENS.NOTIFICATIONS, "Alerts"],
          [SCREENS.SEARCH, "Search"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => navigate(key)}
            className="tap-target"
            style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
              cursor: "pointer", border: "none",
              background: screen === key ? "#2563EB" : "#E2E8F0",
              color: screen === key ? "#fff" : "#64748B",
            }}
          >{label}</button>
        ))}
      </div>
    </div>
  );
}
