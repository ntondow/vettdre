#!/bin/bash
# VettdRE Project Setup Script
# Run this from inside your vettdre project directory:
#   bash setup-vettdre.sh

set -e
echo "🏗️  Setting up VettdRE project files..."

# ============================================================
# 1. PRISMA SCHEMA
# ============================================================
echo "📦 Writing Prisma schema..."
cat > prisma/schema.prisma << 'SCHEMA'
// VettdRE Database Schema
// Prisma ORM schema for PostgreSQL (Supabase)

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ============================================================
// ENUMS
// ============================================================

enum OrgTier {
  solo
  pro
  enterprise
}

enum SubscriptionStatus {
  trialing
  active
  past_due
  canceled
  paused
}

enum UserRole {
  owner
  admin
  manager
  agent
}

enum ContactStatus {
  lead
  active
  client
  past_client
  archived
}

enum ConfidenceLevel {
  high
  medium
  low
}

enum PropertyType {
  house
  condo
  co_op
  townhouse
  multi_family
  land
  commercial
  rental_unit
}

enum TransactionType {
  sale
  rental
  new_development
}

enum PropertyStatus {
  available
  pending
  under_contract
  sold
  leased
  off_market
}

enum DealStatus {
  open
  won
  lost
}

enum PipelineType {
  sales
  rental
  new_development
  custom
}

enum ActivityType {
  email
  call
  text
  showing
  note
  meeting
  document
  system
}

enum ActivityDirection {
  inbound
  outbound
}

enum TaskType {
  follow_up
  call
  email
  showing
  document
  review
  meeting
  custom
}

enum TaskPriority {
  urgent
  high
  medium
  low
}

enum TaskStatus {
  pending
  in_progress
  completed
  skipped
  overdue
}

enum ShowingStatus {
  scheduled
  confirmed
  completed
  cancelled
  no_show
}

enum InterestLevel {
  hot
  warm
  neutral
  cold
}

enum TemplateChannel {
  email
  sms
}

enum AutomationTrigger {
  new_lead
  stage_change
  score_change
  no_activity
  task_overdue
  showing_completed
  custom
}

// ============================================================
// MODELS
// ============================================================

model Organization {
  id                   String             @id @default(uuid())
  name                 String
  slug                 String             @unique
  tier                 OrgTier            @default(solo)
  subscriptionStatus   SubscriptionStatus @default(trialing) @map("subscription_status")
  stripeCustomerId     String?            @map("stripe_customer_id")
  stripeSubscriptionId String?            @map("stripe_subscription_id")
  trialEndsAt          DateTime?          @map("trial_ends_at")
  maxUsers             Int                @default(1) @map("max_users")
  aiLookupsLimit       Int                @default(50) @map("ai_lookups_limit")
  aiLookupsUsed        Int                @default(0) @map("ai_lookups_used")
  aiLookupsResetAt     DateTime?          @map("ai_lookups_reset_at")
  settings             Json               @default("{}")
  logoUrl              String?            @map("logo_url")
  website              String?
  phone                String?
  address              String?
  createdAt            DateTime           @default(now()) @map("created_at")
  updatedAt            DateTime           @updatedAt @map("updated_at")
  users                User[]
  contacts             Contact[]
  properties           Property[]
  pipelines            Pipeline[]
  deals                Deal[]
  activities           Activity[]
  tasks                Task[]
  showings             Showing[]
  emailTemplates       EmailTemplate[]
  automations          Automation[]
  auditLogs            AuditLog[]

  @@map("organizations")
}

model User {
  id               String    @id @default(uuid())
  orgId            String    @map("org_id")
  authProviderId   String?   @unique @map("auth_provider_id")
  email            String
  fullName         String    @map("full_name")
  role             UserRole  @default(agent)
  avatarUrl        String?   @map("avatar_url")
  phone            String?
  timezone         String    @default("America/New_York")
  licenseNumber    String?   @map("license_number")
  isActive         Boolean   @default(true) @map("is_active")
  lastLoginAt      DateTime? @map("last_login_at")
  notificationPrefs Json     @default("{\"email\": true, \"push\": true, \"sms\": false}") @map("notification_prefs")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  organization     Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  assignedContacts Contact[]    @relation("AssignedAgent")
  assignedDeals    Deal[]       @relation("DealAgent")
  activities       Activity[]
  assignedTasks    Task[]       @relation("TaskAssignee")
  createdTasks     Task[]       @relation("TaskCreator")
  completedTasks   Task[]       @relation("TaskCompleter")
  assignedShowings Showing[]
  createdTemplates EmailTemplate[]
  createdAutomations Automation[]
  auditLogs        AuditLog[]

  @@unique([orgId, email])
  @@map("users")
}

model Contact {
  id                String        @id @default(uuid())
  orgId             String        @map("org_id")
  assignedTo        String?       @map("assigned_to")
  firstName         String        @map("first_name")
  lastName          String        @map("last_name")
  email             String?
  phone             String?
  secondaryPhone    String?       @map("secondary_phone")
  address           String?
  city              String?
  state             String?
  zip               String?
  status            ContactStatus @default(lead)
  source            String?
  sourceDetail      String?       @map("source_detail")
  tags              String[]      @default([])
  qualificationScore Int?         @map("qualification_score")
  scoreUpdatedAt     DateTime?    @map("score_updated_at")
  enrichmentStatus   String       @default("pending") @map("enrichment_status")
  lastContactedAt   DateTime?     @map("last_contacted_at")
  lastActivityAt    DateTime?     @map("last_activity_at")
  totalActivities   Int           @default(0) @map("total_activities")
  preferences       Json          @default("{}")
  notes             String?
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")
  organization      Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  assignedAgent     User?         @relation("AssignedAgent", fields: [assignedTo], references: [id], onDelete: SetNull)
  enrichmentProfiles EnrichmentProfile[]
  qualificationScores QualificationScore[]
  deals             Deal[]
  activities        Activity[]
  tasks             Task[]
  showings          Showing[]
  propertyInterests ContactPropertyInterest[]

  @@index([orgId, status])
  @@index([orgId, qualificationScore(sort: Desc)])
  @@index([orgId, email])
  @@index([orgId, lastName, firstName])
  @@map("contacts")
}

model EnrichmentProfile {
  id                String          @id @default(uuid())
  contactId         String          @map("contact_id")
  version           Int             @default(1)
  employer          String?
  jobTitle          String?         @map("job_title")
  industry          String?
  companySize       String?         @map("company_size")
  careerTenureYears Int?            @map("career_tenure_years")
  incomeRangeLow    Int?            @map("income_range_low")
  incomeRangeHigh   Int?            @map("income_range_high")
  incomeConfidence  ConfidenceLevel? @map("income_confidence")
  currentAddress    String?         @map("current_address")
  currentCity       String?         @map("current_city")
  currentState      String?         @map("current_state")
  currentZip        String?         @map("current_zip")
  ownsProperty      Boolean?        @map("owns_property")
  propertyValueEst  Int?            @map("property_value_est")
  mortgageStatus    String?         @map("mortgage_status")
  rentVsOwn         String?         @map("rent_vs_own")
  linkedinUrl       String?         @map("linkedin_url")
  facebookUrl       String?         @map("facebook_url")
  instagramUrl      String?         @map("instagram_url")
  twitterUrl        String?         @map("twitter_url")
  otherSocials      Json            @default("{}") @map("other_socials")
  profilePhotoUrl   String?         @map("profile_photo_url")
  lifeEvents        Json            @default("[]") @map("life_events")
  education         Json            @default("[]")
  aiSummary         String?         @map("ai_summary")
  aiInsights        Json            @default("[]") @map("ai_insights")
  rawData           Json            @default("{}") @map("raw_data")
  dataSources       String[]        @default([]) @map("data_sources")
  confidenceLevel   ConfidenceLevel @default(low) @map("confidence_level")
  enrichedAt        DateTime        @default(now()) @map("enriched_at")
  expiresAt         DateTime?       @map("expires_at")
  contact           Contact         @relation(fields: [contactId], references: [id], onDelete: Cascade)
  qualificationScores QualificationScore[]

  @@unique([contactId, version])
  @@index([contactId])
  @@map("enrichment_profiles")
}

model QualificationScore {
  id                    String           @id @default(uuid())
  contactId             String           @map("contact_id")
  enrichmentProfileId   String?          @map("enrichment_profile_id")
  totalScore            Int              @map("total_score")
  financialCapacity     Int              @default(0) @map("financial_capacity")
  intentSignals         Int              @default(0) @map("intent_signals")
  identityVerification  Int              @default(0) @map("identity_verification")
  engagementLevel       Int              @default(0) @map("engagement_level")
  marketFit             Int              @default(0) @map("market_fit")
  scoreExplanation      String?          @map("score_explanation")
  factorDetails         Json             @default("{}") @map("factor_details")
  scoringModelVersion   String           @default("v1.0") @map("scoring_model_version")
  excludedFactors       String[]         @default([]) @map("excluded_factors")
  scoredAt              DateTime         @default(now()) @map("scored_at")
  contact               Contact          @relation(fields: [contactId], references: [id], onDelete: Cascade)
  enrichmentProfile     EnrichmentProfile? @relation(fields: [enrichmentProfileId], references: [id], onDelete: SetNull)

  @@index([contactId])
  @@map("qualification_scores")
}

model Property {
  id               String         @id @default(uuid())
  orgId            String         @map("org_id")
  createdBy        String?        @map("created_by")
  address          String
  unitNumber       String?        @map("unit_number")
  city             String
  state            String
  zip              String?
  neighborhood     String?
  latitude         Decimal?       @db.Decimal(10, 7)
  longitude        Decimal?       @db.Decimal(10, 7)
  propertyType     PropertyType   @map("property_type")
  transactionType  TransactionType @map("transaction_type")
  status           PropertyStatus @default(available)
  price            Decimal?       @db.Decimal(12, 2)
  pricePerSqft     Decimal?       @db.Decimal(8, 2) @map("price_per_sqft")
  monthlyRent      Decimal?       @db.Decimal(10, 2) @map("monthly_rent")
  monthlyCc        Decimal?       @db.Decimal(10, 2) @map("monthly_cc")
  monthlyTaxes     Decimal?       @db.Decimal(10, 2) @map("monthly_taxes")
  bedrooms         Int?
  bathrooms        Decimal?       @db.Decimal(3, 1)
  sqft             Int?
  yearBuilt        Int?           @map("year_built")
  mlsNumber        String?        @map("mls_number")
  listingUrl       String?        @map("listing_url")
  listedAt         DateTime?      @map("listed_at")
  description      String?
  images           Json           @default("[]")
  developmentName  String?        @map("development_name")
  buildingName     String?        @map("building_name")
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")
  organization     Organization   @relation(fields: [orgId], references: [id], onDelete: Cascade)
  deals            Deal[]
  showings         Showing[]
  contactInterests ContactPropertyInterest[]

  @@index([orgId, status])
  @@index([orgId, transactionType])
  @@index([orgId, city])
  @@map("properties")
}

model Pipeline {
  id            String       @id @default(uuid())
  orgId         String       @map("org_id")
  name          String
  pipelineType  PipelineType @map("pipeline_type")
  stages        Json         @default("[]")
  isDefault     Boolean      @default(false) @map("is_default")
  isActive      Boolean      @default(true) @map("is_active")
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")
  organization  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  deals         Deal[]

  @@index([orgId])
  @@map("pipelines")
}

model Deal {
  id               String     @id @default(uuid())
  orgId            String     @map("org_id")
  contactId        String     @map("contact_id")
  propertyId       String?    @map("property_id")
  assignedTo       String?    @map("assigned_to")
  pipelineId       String     @map("pipeline_id")
  stageId          String     @map("stage_id")
  stageEnteredAt   DateTime   @default(now()) @map("stage_entered_at")
  name             String?
  dealValue        Decimal?   @db.Decimal(12, 2) @map("deal_value")
  offerPrice       Decimal?   @db.Decimal(12, 2) @map("offer_price")
  askingPrice      Decimal?   @db.Decimal(12, 2) @map("asking_price")
  commissionRate   Decimal?   @db.Decimal(5, 4) @map("commission_rate")
  commissionAmount Decimal?   @db.Decimal(10, 2) @map("commission_amount")
  expectedCloseDate DateTime? @map("expected_close_date") @db.Date
  actualCloseDate   DateTime? @map("actual_close_date") @db.Date
  winProbability   Int?       @map("win_probability")
  riskFlags        Json       @default("[]") @map("risk_flags")
  nextBestAction   String?    @map("next_best_action")
  status           DealStatus @default(open)
  lostReason       String?    @map("lost_reason")
  notes            String?
  createdAt        DateTime   @default(now()) @map("created_at")
  updatedAt        DateTime   @updatedAt @map("updated_at")
  closedAt         DateTime?  @map("closed_at")
  organization     Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contact          Contact      @relation(fields: [contactId], references: [id], onDelete: Cascade)
  property         Property?    @relation(fields: [propertyId], references: [id], onDelete: SetNull)
  assignedAgent    User?        @relation("DealAgent", fields: [assignedTo], references: [id], onDelete: SetNull)
  pipeline         Pipeline     @relation(fields: [pipelineId], references: [id], onDelete: Restrict)
  activities       Activity[]
  tasks            Task[]
  showings         Showing[]

  @@index([orgId, status])
  @@index([contactId])
  @@index([pipelineId, stageId])
  @@map("deals")
}

model Activity {
  id             String            @id @default(uuid())
  orgId          String            @map("org_id")
  contactId      String            @map("contact_id")
  dealId         String?           @map("deal_id")
  userId         String?           @map("user_id")
  type           ActivityType
  direction      ActivityDirection?
  subject        String?
  body           String?
  metadata       Json              @default("{}")
  isAiGenerated  Boolean           @default(false) @map("is_ai_generated")
  aiDraftAccepted Boolean?         @map("ai_draft_accepted")
  occurredAt     DateTime          @default(now()) @map("occurred_at")
  createdAt      DateTime          @default(now()) @map("created_at")
  organization   Organization      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contact        Contact           @relation(fields: [contactId], references: [id], onDelete: Cascade)
  deal           Deal?             @relation(fields: [dealId], references: [id], onDelete: SetNull)
  user           User?             @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([contactId, occurredAt(sort: Desc)])
  @@index([orgId, type])
  @@map("activities")
}

model Task {
  id              String      @id @default(uuid())
  orgId           String      @map("org_id")
  contactId       String?     @map("contact_id")
  dealId          String?     @map("deal_id")
  assignedTo      String?     @map("assigned_to")
  createdBy       String?     @map("created_by")
  title           String
  description     String?
  type            TaskType    @default(follow_up)
  priority        TaskPriority @default(medium)
  dueAt           DateTime?   @map("due_at")
  reminderAt      DateTime?   @map("reminder_at")
  status          TaskStatus  @default(pending)
  completedAt     DateTime?   @map("completed_at")
  completedBy     String?     @map("completed_by")
  isAiGenerated   Boolean     @default(false) @map("is_ai_generated")
  aiReasoning     String?     @map("ai_reasoning")
  aiSuggestedAction String?   @map("ai_suggested_action")
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")
  organization    Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contact         Contact?     @relation(fields: [contactId], references: [id], onDelete: Cascade)
  deal            Deal?        @relation(fields: [dealId], references: [id], onDelete: SetNull)
  assignee        User?        @relation("TaskAssignee", fields: [assignedTo], references: [id], onDelete: SetNull)
  creator         User?        @relation("TaskCreator", fields: [createdBy], references: [id], onDelete: SetNull)
  completer       User?        @relation("TaskCompleter", fields: [completedBy], references: [id], onDelete: SetNull)

  @@index([assignedTo, status, dueAt])
  @@index([orgId, status])
  @@map("tasks")
}

model Showing {
  id              String        @id @default(uuid())
  orgId           String        @map("org_id")
  contactId       String        @map("contact_id")
  propertyId      String        @map("property_id")
  dealId          String?       @map("deal_id")
  assignedTo      String?       @map("assigned_to")
  scheduledAt     DateTime      @map("scheduled_at")
  durationMinutes Int           @default(30) @map("duration_minutes")
  status          ShowingStatus @default(scheduled)
  feedback        String?
  interestLevel   InterestLevel? @map("interest_level")
  followUpNotes   String?       @map("follow_up_notes")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")
  organization    Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contact         Contact       @relation(fields: [contactId], references: [id], onDelete: Cascade)
  property        Property      @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  deal            Deal?         @relation(fields: [dealId], references: [id], onDelete: SetNull)
  assignee        User?         @relation(fields: [assignedTo], references: [id], onDelete: SetNull)

  @@index([orgId, scheduledAt])
  @@map("showings")
}

model EmailTemplate {
  id              String          @id @default(uuid())
  orgId           String          @map("org_id")
  createdBy       String?         @map("created_by")
  name            String
  subject         String?
  body            String
  channel         TemplateChannel @default(email)
  mergeFields     String[]        @default([]) @map("merge_fields")
  timesUsed       Int             @default(0) @map("times_used")
  lastUsedAt      DateTime?       @map("last_used_at")
  isAiGenerated   Boolean         @default(false) @map("is_ai_generated")
  category        String?
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")
  organization    Organization    @relation(fields: [orgId], references: [id], onDelete: Cascade)
  creator         User?           @relation(fields: [createdBy], references: [id], onDelete: SetNull)

  @@index([orgId])
  @@map("email_templates")
}

model Automation {
  id              String            @id @default(uuid())
  orgId           String            @map("org_id")
  createdBy       String?           @map("created_by")
  name            String
  description     String?
  triggerType     AutomationTrigger @map("trigger_type")
  triggerConfig   Json              @default("{}") @map("trigger_config")
  conditions      Json              @default("[]")
  actions         Json              @default("[]")
  isActive        Boolean           @default(true) @map("is_active")
  runsCount       Int               @default(0) @map("runs_count")
  lastRunAt       DateTime?         @map("last_run_at")
  lastError       String?           @map("last_error")
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")
  organization    Organization      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  creator         User?             @relation(fields: [createdBy], references: [id], onDelete: SetNull)
  runs            AutomationRun[]

  @@index([orgId, triggerType, isActive])
  @@map("automations")
}

model AutomationRun {
  id              String    @id @default(uuid())
  automationId    String    @map("automation_id")
  contactId       String?   @map("contact_id")
  dealId          String?   @map("deal_id")
  triggerData     Json      @default("{}") @map("trigger_data")
  actionsTaken    Json      @default("[]") @map("actions_taken")
  status          String    @default("success")
  errorMessage    String?   @map("error_message")
  startedAt       DateTime  @default(now()) @map("started_at")
  completedAt     DateTime? @map("completed_at")
  automation      Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)

  @@index([automationId])
  @@map("automation_runs")
}

model ContactPropertyInterest {
  id            String        @id @default(uuid())
  contactId     String        @map("contact_id")
  propertyId    String        @map("property_id")
  interestLevel InterestLevel @default(neutral) @map("interest_level")
  notes         String?
  createdAt     DateTime      @default(now()) @map("created_at")
  contact       Contact       @relation(fields: [contactId], references: [id], onDelete: Cascade)
  property      Property      @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  @@unique([contactId, propertyId])
  @@map("contact_property_interests")
}

model AuditLog {
  id          String   @id @default(uuid())
  orgId       String   @map("org_id")
  userId      String?  @map("user_id")
  action      String
  entityType  String   @map("entity_type")
  entityId    String   @map("entity_id")
  changes     Json?
  metadata    Json     @default("{}")
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")
  createdAt   DateTime @default(now()) @map("created_at")
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user         User?        @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([orgId, createdAt(sort: Desc)])
  @@index([entityType, entityId])
  @@map("audit_log")
}
SCHEMA

# ============================================================
# 2. CREATE DIRECTORY STRUCTURE
# ============================================================
echo "📁 Creating directory structure..."
mkdir -p src/lib/supabase
mkdir -p src/app/auth/callback
mkdir -p "src/app/(auth)/login"
mkdir -p "src/app/(auth)/signup"
mkdir -p "src/app/(dashboard)/dashboard"
mkdir -p "src/app/(dashboard)/contacts"
mkdir -p "src/app/(dashboard)/pipeline"
mkdir -p "src/app/(dashboard)/properties"
mkdir -p src/components/layout
mkdir -p src/components/ui

# ============================================================
# 3. PRISMA CLIENT
# ============================================================
echo "🔧 Writing lib files..."
cat > src/lib/prisma.ts << 'EOF'
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
EOF

# ============================================================
# 4. SUPABASE CLIENTS
# ============================================================
cat > src/lib/supabase/client.ts << 'EOF'
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
EOF

cat > src/lib/supabase/server.ts << 'EOF'
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}
EOF

cat > src/lib/supabase/middleware.ts << 'EOF'
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
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
  if (!user && !request.nextUrl.pathname.startsWith("/login") && !request.nextUrl.pathname.startsWith("/signup") && !request.nextUrl.pathname.startsWith("/auth") && request.nextUrl.pathname !== "/") {
    const url = request.nextUrl.clone(); url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && (request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/signup"))) {
    const url = request.nextUrl.clone(); url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return supabaseResponse;
}
EOF

# ============================================================
# 5. UTILS
# ============================================================
cat > src/lib/utils.ts << 'EOF'
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

export function getScoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600 bg-emerald-50";
  if (score >= 70) return "text-amber-600 bg-amber-50";
  if (score >= 50) return "text-orange-600 bg-orange-50";
  return "text-red-600 bg-red-50";
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return "Hot";
  if (score >= 70) return "Warm";
  if (score >= 50) return "Developing";
  return "Cold";
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w ]+/g, "").replace(/ +/g, "-");
}
EOF

# ============================================================
# 6. MIDDLEWARE
# ============================================================
cat > src/middleware.ts << 'EOF'
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
export async function middleware(request: NextRequest) { return await updateSession(request); }
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
EOF

# ============================================================
# 7. AUTH CALLBACK
# ============================================================
cat > src/app/auth/callback/route.ts << 'EOF'
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
EOF

# ============================================================
# 8. ROOT LAYOUT & PAGE
# ============================================================
echo "🎨 Writing app pages..."

cat > src/app/globals.css << 'EOF'
@import "tailwindcss";
EOF

cat > src/app/layout.tsx << 'EOF'
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VettdRE — AI-Native Real Estate CRM",
  description: "Intelligence-driven CRM for modern real estate professionals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
EOF

cat > src/app/page.tsx << 'EOF'
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard"); else redirect("/login");
}
EOF

# ============================================================
# 9. LOGIN PAGE
# ============================================================
cat > "src/app/(auth)/login/page.tsx" << 'LOGINEOF'
"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else { router.push("/dashboard"); router.refresh(); }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Vettd<span className="text-blue-600">RE</span></h1>
          <h2 className="mt-6 text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="you@company.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter your password" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50">{loading ? "Signing in..." : "Sign in"}</button>
        </form>
        <p className="text-center text-sm text-slate-500">Don&apos;t have an account? <Link href="/signup" className="text-blue-600 font-medium">Create one</Link></p>
      </div>
    </div>
  );
}
LOGINEOF

# ============================================================
# 10. SIGNUP PAGE
# ============================================================
cat > "src/app/(auth)/signup/page.tsx" << 'SIGNUPEOF'
"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SignUpPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(false); } else { setSuccess(true); setLoading(false); }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Check your email</h2>
          <p className="text-slate-500">We sent a confirmation link to <strong>{email}</strong>.</p>
          <Link href="/login" className="inline-block mt-4 text-blue-600 font-medium text-sm">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Vettd<span className="text-blue-600">RE</span></h1>
          <h2 className="mt-6 text-2xl font-bold text-slate-900">Create your account</h2>
          <p className="mt-1 text-sm text-slate-500">Start qualifying leads with AI</p>
        </div>
        <form onSubmit={handleSignUp} className="space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
            <input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Jane Smith" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="you@company.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Minimum 8 characters" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50">{loading ? "Creating account..." : "Create account"}</button>
        </form>
        <p className="text-center text-sm text-slate-500">Already have an account? <Link href="/login" className="text-blue-600 font-medium">Sign in</Link></p>
      </div>
    </div>
  );
}
SIGNUPEOF

# ============================================================
# 11. SIDEBAR
# ============================================================
echo "🧩 Writing components..."
cat > src/components/layout/sidebar.tsx << 'EOF'
"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const nav = [
  { label: "Main", items: [
    { name: "Dashboard", href: "/dashboard", icon: "📊" },
    { name: "Contacts", href: "/contacts", icon: "👥" },
    { name: "Pipeline", href: "/pipeline", icon: "📋" },
    { name: "Properties", href: "/properties", icon: "🏠" },
  ]},
  { label: "Activity", items: [
    { name: "Tasks", href: "/tasks", icon: "✅" },
    { name: "Calendar", href: "/calendar", icon: "📅" },
    { name: "Messages", href: "/messages", icon: "💬" },
  ]},
  { label: "Intelligence", items: [
    { name: "AI Insights", href: "/insights", icon: "🧠" },
    { name: "Analytics", href: "/analytics", icon: "📈" },
    { name: "Market Intel", href: "/market-intel", icon: "🔍" },
  ]},
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const handleSignOut = async () => { await supabase.auth.signOut(); router.push("/login"); router.refresh(); };

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-white border-r border-slate-200 flex flex-col z-40">
      <div className="h-14 flex items-center px-5 border-b border-slate-100">
        <Link href="/dashboard" className="text-xl font-bold text-slate-900">Vettd<span className="text-blue-600">RE</span></Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {nav.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link key={item.name} href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"}`}>
                    <span className="text-base">{item.icon}</span>{item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <button onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors">
          <span className="text-base">🚪</span>Sign out
        </button>
      </div>
    </aside>
  );
}
EOF

# ============================================================
# 12. HEADER
# ============================================================
cat > src/components/layout/header.tsx << 'EOF'
"use client";

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    </header>
  );
}
EOF

# ============================================================
# 13. DASHBOARD LAYOUT
# ============================================================
cat > "src/app/(dashboard)/layout.tsx" << 'EOF'
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="pl-60">{children}</main>
    </div>
  );
}
EOF

# ============================================================
# 14. DASHBOARD PAGE
# ============================================================
cat > "src/app/(dashboard)/dashboard/page.tsx" << 'EOF'
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/header";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const name = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  return (
    <>
      <Header title={`Welcome, ${name}`} subtitle="Here's what's happening with your pipeline." />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Contacts", value: "0", icon: "👥" },
            { label: "Active Deals", value: "0", icon: "📋" },
            { label: "Pipeline Value", value: "$0", icon: "💰" },
            { label: "AI Lookups Left", value: "50", icon: "🧠" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{stat.label}</p>
                <span className="text-2xl">{stat.icon}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-4xl mb-4">🚀</p>
          <h3 className="text-lg font-semibold text-slate-900">VettdRE is ready!</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Your AI-native CRM is set up. Start by adding your first contact from the Contacts page.</p>
        </div>
      </div>
    </>
  );
}
EOF

# ============================================================
# 15. CONTACTS PAGE
# ============================================================
cat > "src/app/(dashboard)/contacts/page.tsx" << 'EOF'
import Header from "@/components/layout/header";

export default function ContactsPage() {
  return (
    <>
      <Header title="Contacts" subtitle="Manage your leads and clients" />
      <div className="p-8">
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">👥</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">No contacts yet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">Add your first contact to get started. AI will build their profile automatically.</p>
        </div>
      </div>
    </>
  );
}
EOF

# ============================================================
# 16. PIPELINE PAGE
# ============================================================
cat > "src/app/(dashboard)/pipeline/page.tsx" << 'EOF'
import Header from "@/components/layout/header";

const stages = ["New Lead", "Contacted", "Showing", "Offer", "Under Contract", "Closed"];

export default function PipelinePage() {
  return (
    <>
      <Header title="Pipeline" subtitle="Track your deals" />
      <div className="p-8">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <div key={stage} className="flex-shrink-0 w-64 bg-white rounded-xl border border-slate-200">
              <div className="p-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">{stage}</h3>
              </div>
              <div className="p-4 min-h-[300px] flex items-center justify-center">
                <p className="text-xs text-slate-400">No deals</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
EOF

# ============================================================
# 17. PROPERTIES PAGE
# ============================================================
cat > "src/app/(dashboard)/properties/page.tsx" << 'EOF'
import Header from "@/components/layout/header";

export default function PropertiesPage() {
  return (
    <>
      <Header title="Properties" subtitle="Manage your listings" />
      <div className="p-8">
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">🏠</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">No properties yet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">Add your listings to track showings and link contacts.</p>
        </div>
      </div>
    </>
  );
}
EOF

# ============================================================
# 18. PUSH SCHEMA & GENERATE CLIENT
# ============================================================
echo ""
echo "✅ All files written!"
echo ""
echo "Now running database setup..."
npx prisma db push
echo ""
echo "Generating Prisma client..."
npx prisma generate
echo ""
echo "🎉 VettdRE setup complete!"
echo ""
echo "Run 'npm run dev' to start the app."
echo "Open http://localhost:3000 in your browser."
