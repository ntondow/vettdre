/**
 * Identity Verification Provider Abstraction
 *
 * Common interface for IDV providers (Didit, Stripe Identity).
 * Allows swapping providers without changing business logic.
 */

// ── Status Types ─────────────────────────────────────────────

export type IdvStatus =
  | "created"       // Session created, waiting for user
  | "in_progress"   // User started verification
  | "approved"      // Passed all checks
  | "declined"      // Failed verification
  | "in_review"     // Manual review needed
  | "abandoned"     // User left without completing
  | "expired";      // Session timed out

export type IdvProvider = "didit" | "stripe";

// ── Session Types ────────────────────────────────────────────

export interface CreateSessionParams {
  applicationId: string;
  applicantId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  /** URL to redirect applicant back to after hosted verification */
  returnUrl: string;
}

export interface CreateSessionResult {
  provider: IdvProvider;
  sessionId: string;
  /** URL to redirect the applicant to for hosted verification */
  verificationUrl: string;
}

export interface IdvResult {
  provider: IdvProvider;
  sessionId: string;
  status: IdvStatus;
  documentType?: string;       // passport, drivers_license, id_card
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;        // ISO date
  nationality?: string;
  issuingCountry?: string;
  livenessScore?: number;      // 0-100
  faceMatchScore?: number;     // 0-100
  documentQuality?: number;    // 0-100
  warnings: string[];
  rawResponse: string;         // JSON string — will be encrypted before storage
}

// ── Webhook Types ────────────────────────────────────────────

export interface WebhookParseResult {
  sessionId: string;
  status: IdvStatus;
  /** If true, caller should fetch full result via getResult() */
  shouldFetchResult: boolean;
}

// ── Provider Interface ───────────────────────────────────────

export interface IdvProviderClient {
  readonly name: IdvProvider;

  /**
   * Create a new verification session with the provider.
   * Returns a URL the applicant should be redirected to.
   */
  createSession(params: CreateSessionParams): Promise<CreateSessionResult>;

  /**
   * Fetch the verification result for a completed session.
   */
  getResult(sessionId: string): Promise<IdvResult>;

  /**
   * Parse and validate an inbound webhook from the provider.
   * Returns null if signature validation fails.
   */
  parseWebhook(
    body: string,
    headers: Record<string, string>,
  ): Promise<WebhookParseResult | null>;
}
