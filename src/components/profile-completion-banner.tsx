// Slice 13 / B-017 — Profile completion banner.
//
// Renders a warning banner when an agent's profile is missing fields that
// matter for downstream artifacts (signed onboarding documents, SMS
// delivery, NYS compliance). Returns null when the field list is empty so
// callsites can render unconditionally.
//
// Stateless / dumb — caller decides which fields are "missing" and how the
// CTA wires up. On /my-deals the action is a link to /settings/profile;
// on /settings/profile itself there's no link (the form below IS the
// action), and the banner reads as guidance.

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

export interface ProfileCompletionBannerProps {
  /**
   * Human-readable list of missing field names ("License Number",
   * "Phone", "Full Name"). Empty array → component renders nothing.
   */
  missingFields: string[];
  /**
   * Optional CTA target. When omitted the banner renders without a link
   * (use this on /settings/profile, where the form itself is the action).
   */
  actionHref?: string;
  /**
   * CTA label. Defaults to "Update profile". Ignored when actionHref is
   * absent.
   */
  actionLabel?: string;
}

export default function ProfileCompletionBanner({
  missingFields,
  actionHref,
  actionLabel = "Update profile",
}: ProfileCompletionBannerProps) {
  if (missingFields.length === 0) return null;

  const fieldList = missingFields.join(", ");

  return (
    <div
      data-testid="profile-completion-banner"
      role="alert"
      className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start sm:items-center gap-3"
    >
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900">
          Complete your profile
        </p>
        <p className="text-xs text-amber-800 mt-0.5">
          Missing: <span className="font-medium">{fieldList}</span>. These
          appear on signed documents and SMS deliveries.
        </p>
      </div>
      {actionHref && (
        <Link
          href={actionHref}
          data-testid="profile-completion-banner-cta"
          className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-amber-900 hover:text-amber-950 underline-offset-2 hover:underline"
        >
          {actionLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

// ── Helper: shared field-completeness logic ───────────────────────
//
// Centralized so both /my-deals (server-side) and /settings/profile
// (client-side) compute the same thing. Keeping the field set in one
// place prevents drift if a future field is added.
//
// Three fields gate completeness, each tied to a concrete downstream
// artifact:
//   - fullName       → renders on every signed onboarding document
//   - phone          → required for SMS delivery on Client Onboarding
//   - licenseNumber  → NYS legal requirement on signed agreements

export interface ProfileShape {
  fullName?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
}

export function computeMissingProfileFields(
  profile: ProfileShape | null | undefined,
): string[] {
  if (!profile) return [];
  const missing: string[] = [];
  if (!profile.fullName?.trim()) missing.push("Full Name");
  if (!profile.phone?.trim()) missing.push("Phone");
  if (!profile.licenseNumber?.trim()) missing.push("License Number");
  return missing;
}
