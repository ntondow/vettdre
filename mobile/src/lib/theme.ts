// ── Theme Constants ───────────────────────────────────────────
// Single source of truth for colors, spacing, typography, and shadows.
// Import from here instead of hardcoding hex values in screens.

export const COLORS = {
  // Brand
  primary: "#2563EB",
  primaryLight: "#EFF6FF",
  primaryBorder: "#BFDBFE",

  // Text
  text: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  textPlaceholder: "#CBD5E1",

  // Backgrounds
  bg: "#FFFFFF",
  bgSecondary: "#F8FAFC",
  bgTertiary: "#F1F5F9",

  // Borders
  border: "#E2E8F0",
  borderLight: "#F1F5F9",

  // Success
  success: "#10B981",
  successDark: "#16A34A",
  successBg: "#F0FDF4",
  successBorder: "#BBF7D0",
  successText: "#166534",

  // Warning
  warning: "#F59E0B",
  warningBg: "#FFFBEB",
  warningBorder: "#FDE68A",
  warningText: "#92400E",

  // Danger
  danger: "#EF4444",
  dangerBg: "#FEF2F2",
  dangerBorder: "#FECACA",
  dangerText: "#991B1B",

  // Info
  info: "#3B82F6",
  infoBg: "#EFF6FF",
  infoBorder: "#BFDBFE",

  // Overlay
  overlay: "rgba(0,0,0,0.5)",
  overlayLight: "rgba(0,0,0,0.3)",

  // Misc
  white: "#FFFFFF",
  black: "#000000",
  skeleton: "#E2E8F0",
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
  full: 9999,
} as const;

export const FONT = {
  size: {
    xs: 11,
    sm: 12,
    md: 13,
    base: 14,
    lg: 15,
    xl: 16,
    xxl: 18,
    title: 22,
    hero: 28,
    jumbo: 32,
  },
  weight: {
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    extrabold: "800" as const,
  },
} as const;

// Common shadow presets
export const SHADOW = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
} as const;

// Status color/label mappings used across multiple screens
export const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; label: string }
> = {
  draft: { color: "#64748B", bg: "#F1F5F9", label: "Draft" },
  sent: { color: "#2563EB", bg: "#EFF6FF", label: "Sent" },
  viewed: { color: "#F59E0B", bg: "#FFFBEB", label: "Viewed" },
  completed: { color: "#10B981", bg: "#F0FDF4", label: "Completed" },
  signed: { color: "#10B981", bg: "#F0FDF4", label: "Signed" },
  cancelled: { color: "#EF4444", bg: "#FEF2F2", label: "Cancelled" },
  voided: { color: "#EF4444", bg: "#FEF2F2", label: "Voided" },
  expired: { color: "#94A3B8", bg: "#F8FAFC", label: "Expired" },
  pending: { color: "#F59E0B", bg: "#FFFBEB", label: "Pending" },
  approved: { color: "#10B981", bg: "#F0FDF4", label: "Approved" },
  rejected: { color: "#EF4444", bg: "#FEF2F2", label: "Rejected" },
  active: { color: "#10B981", bg: "#F0FDF4", label: "Active" },
  inactive: { color: "#94A3B8", bg: "#F8FAFC", label: "Inactive" },
  new: { color: "#2563EB", bg: "#EFF6FF", label: "New" },
};

export function getStatusStyle(status: string) {
  return STATUS_CONFIG[status.toLowerCase()] ?? STATUS_CONFIG.draft;
}
