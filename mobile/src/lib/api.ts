// ── API Client ────────────────────────────────────────────────
// Thin wrapper around fetch that hits the existing Next.js API routes.
// All requests include the Supabase auth token for server-side auth.

import { supabase } from "./supabase";
import type {
  EarningsPeriod,
  EarningsSummary,
  ClientOnboarding,
  CalendarEvent,
  Task,
  BuildingProfile,
  AppNotification,
  BrokerAgent,
} from "@/types";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://app.vettdre.com";

// ── Core Fetch ────────────────────────────────────────────────

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _isRetry = false
): Promise<T> {
  const headers = await getAuthHeaders();
  const url = `${API_URL}${path}`;

  // Abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  // 401 — try refreshing the token once, then retry
  if (response.status === 401 && !_isRetry) {
    const { error } = await supabase.auth.refreshSession();
    if (!error) {
      return apiFetch<T>(path, options, true);
    }
    // Refresh failed — let the error propagate below
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`API ${response.status}: ${text}`);
  }

  // Guard against non-JSON success responses
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    // Some endpoints return empty 204 — return null as T
    if (response.status === 204) return null as T;
    throw new Error(`Unexpected response type: ${contentType}`);
  }

  return response.json();
}

// ── Earnings ──────────────────────────────────────────────────

export async function fetchEarnings(
  period: EarningsPeriod = "month"
): Promise<EarningsSummary> {
  return apiFetch(`/api/mobile/earnings?period=${period}`);
}

// ── Schedule (Today) ──────────────────────────────────────────

export interface TodaySchedule {
  events: CalendarEvent[];
  tasks: Task[];
}

export async function fetchTodaySchedule(): Promise<TodaySchedule> {
  return apiFetch("/api/mobile/schedule/today");
}

// ── Client Onboarding ─────────────────────────────────────────

export async function fetchClients(): Promise<ClientOnboarding[]> {
  return apiFetch("/api/mobile/clients");
}

export async function fetchClientDetail(
  id: string
): Promise<ClientOnboarding> {
  return apiFetch(`/api/mobile/clients/${id}`);
}

export interface CreateInvitePayload {
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone?: string;
  dealType?: string;
  propertyAddress?: string;
  templateIds: string[];
  sentVia: "email" | "sms" | "email+sms" | "link";
}

export async function sendClientInvite(
  payload: CreateInvitePayload
): Promise<ClientOnboarding> {
  return apiFetch("/api/mobile/clients/invite", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function resendInvite(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/mobile/clients/${id}/resend`, { method: "POST" });
}

export async function voidOnboarding(
  id: string,
  reason?: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/mobile/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "void", reason }),
  });
}

export async function deleteOnboarding(
  id: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/mobile/clients/${id}`, { method: "DELETE" });
}

export async function archiveOnboarding(
  id: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/mobile/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "archive" }),
  });
}

// ── Scout / Building Intelligence ─────────────────────────────

export async function scoutByAddress(
  address: string
): Promise<BuildingProfile> {
  return apiFetch(
    `/api/mobile/scout?address=${encodeURIComponent(address)}`
  );
}

export async function scoutByBBL(bbl: string): Promise<BuildingProfile> {
  return apiFetch(`/api/mobile/scout?bbl=${encodeURIComponent(bbl)}`);
}

export async function scoutByCoords(
  lat: number,
  lng: number
): Promise<BuildingProfile> {
  return apiFetch(`/api/mobile/scout?lat=${lat}&lng=${lng}`);
}

export async function scoutByScreenshot(
  imageBase64: string
): Promise<BuildingProfile> {
  return apiFetch("/api/mobile/scout/screenshot", {
    method: "POST",
    body: JSON.stringify({ image: imageBase64 }),
  });
}

export async function scoutByUrl(url: string): Promise<BuildingProfile> {
  return apiFetch("/api/mobile/scout/url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

// ── Activity Feed ────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  type: string;
  direction: string | null;
  subject: string | null;
  body: string | null;
  isAi: boolean;
  occurredAt: string;
  contactId: string | null;
  contactName: string | null;
  dealValue: number | null;
}

export async function fetchRecentActivity(limit = 20): Promise<{ activities: ActivityItem[] }> {
  return apiFetch(`/api/mobile/activity?limit=${limit}`);
}

// ── CRM Contacts ─────────────────────────────────────────────

export interface CrmContact {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  contactType: string;
  status: string;
  source: string | null;
  tags: string[];
  score: number | null;
  lastContactedAt: string | null;
  lastActivityAt: string | null;
  totalActivities: number;
  dealCount: number;
  pendingTasks: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrmContactsResponse {
  contacts: CrmContact[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchCrmContacts(params?: {
  q?: string;
  status?: string;
  type?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<CrmContactsResponse> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  if (params?.type) qs.set("type", params.type);
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return apiFetch(`/api/mobile/contacts${query ? `?${query}` : ""}`);
}

export interface CrmContactDetail {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  contactType: string;
  status: string;
  source: string | null;
  sourceDetail: string | null;
  tags: string[];
  notes: string | null;
  lastContactedAt: string | null;
  lastActivityAt: string | null;
  totalActivities: number;
  createdAt: string;
  updatedAt: string;
  enrichment: {
    employer: string | null;
    jobTitle: string | null;
    linkedinUrl: string | null;
    ownsProperty: boolean | null;
    confidence: string | null;
    sources: string[];
  } | null;
  score: {
    total: number;
    financial: number | null;
    intent: number | null;
    engagement: number | null;
    marketFit: number | null;
  } | null;
  deals: Array<{
    id: string;
    value: number | null;
    status: string;
    winProbability: number | null;
    stage: string | null;
    pipeline: string | null;
    createdAt: string;
  }>;
  activities: Array<{
    id: string;
    type: string;
    direction: string | null;
    subject: string | null;
    body: string | null;
    isAi: boolean;
    createdAt: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    type: string;
    priority: string;
    dueAt: string | null;
    status: string;
  }>;
  showings: Array<{
    id: string;
    scheduledAt: string;
    status: string;
    interestLevel: string | null;
    feedback: string | null;
    propertyAddress: string | null;
  }>;
}

export async function fetchCrmContactDetail(id: string): Promise<CrmContactDetail> {
  return apiFetch(`/api/mobile/contacts/${id}`);
}

// ── Pipeline ──────────────────────────────────────────────────

export interface PipelineStage {
  key: string;
  label: string;
  count: number;
  color: string;
}

export interface PipelineData {
  buildingStages: PipelineStage[];
  clientStages: PipelineStage[];
  totalBuildings: number;
  totalClients: number;
}

export async function fetchPipeline(): Promise<PipelineData> {
  return apiFetch("/api/mobile/pipeline");
}

// ── Pipeline Stage Drill-Down ─────────────────────────────────

export interface StageItem {
  id: string;
  // Buildings
  address?: string;
  unit?: string;
  listingType?: string;
  price?: number | null;
  priceType?: "rent" | "sale" | null;
  bedrooms?: string;
  bathrooms?: string;
  sqft?: number;
  availableDate?: string | null;
  daysOnMarket?: number | null;
  tenantName?: string | null;
  tenantEmail?: string | null;
  // Clients
  name?: string;
  email?: string;
  phone?: string | null;
  dealType?: string | null;
  propertyAddress?: string | null;
  sentAt?: string | null;
  completedAt?: string | null;
  allDocsSigned?: boolean;
  docProgress?: { signed: number; total: number };
  // Common
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface StageDetailResponse {
  type: "buildings" | "clients";
  status: string;
  items: StageItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchStageItems(
  type: "buildings" | "clients",
  status: string,
  limit = 50,
  offset = 0
): Promise<StageDetailResponse> {
  return apiFetch(
    `/api/mobile/pipeline/stage?type=${type}&status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`
  );
}

// ── Notifications ─────────────────────────────────────────────

export async function fetchNotifications(): Promise<AppNotification[]> {
  return apiFetch("/api/mobile/notifications");
}

export async function markNotificationsRead(
  ids: string[]
): Promise<{ success: boolean }> {
  return apiFetch("/api/mobile/notifications/read", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// ── Saved Buildings (Server-Side) ─────────────────────────────

export interface SavedBuildingServer {
  id: string;
  address: string;
  borough: string | null;
  totalUnits: number | null;
  yearBuilt: number | null;
  ownerName: string | null;
  status: string;
  createdAt: string;
}

export async function fetchSavedBuildings(): Promise<SavedBuildingServer[]> {
  return apiFetch("/api/mobile/buildings");
}

export async function saveBuildingToServer(data: {
  bbl: string;
  address: string;
  borough?: string;
  totalUnits?: number;
  yearBuilt?: number;
  ownerName?: string;
  lastSalePrice?: number;
  assessedValue?: number;
}): Promise<SavedBuildingServer> {
  return apiFetch("/api/mobile/buildings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Deal Submissions ─────────────────────────────────────────

export interface SubmitDealPayload {
  propertyAddress: string;
  unit?: string;
  dealType: "sale" | "lease" | "rental";
  transactionValue: number;
  closingDate?: string;
  commissionPct?: number;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  representedSide?: string;
  notes?: string;
}

export async function submitDeal(
  payload: SubmitDealPayload
): Promise<{ id: string; status: string }> {
  return apiFetch("/api/mobile/deals/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Agent Profile ─────────────────────────────────────────────

export async function fetchAgentProfile(): Promise<BrokerAgent> {
  return apiFetch("/api/mobile/agent/profile");
}

export interface ProfileUpdatePayload {
  fullName?: string;
  phone?: string | null;
  title?: string | null;
  licenseNumber?: string | null;
}

export async function updateAgentProfile(
  payload: ProfileUpdatePayload
): Promise<unknown> {
  return apiFetch("/api/mobile/agent/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ── Tasks ────────────────────────────────────────────────────

export async function completeTask(
  id: string
): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/mobile/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
}

export async function snoozeTask(
  id: string,
  days: number = 1
): Promise<{ id: string; dueAt: string }> {
  return apiFetch(`/api/mobile/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ snoozeDays: days }),
  });
}
