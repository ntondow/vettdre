/**
 * Screening Processing Pipeline
 *
 * Orchestrates the full background processing flow after applicant payment:
 *   1. Pull credit/criminal/eviction reports (CRS)
 *   2. Sync bank transactions (Plaid)
 *   3. Analyze uploaded documents (AI fraud detection)
 *   4. Compute financial wellness profile
 *   5. Compute VettdRE risk score
 *   6. Generate PDF report
 *   7. Notify agent
 *
 * Designed for async execution (called from Stripe webhook or payment confirm).
 * Each step is independently error-tolerant — partial results still produce a report.
 */

import prisma from "@/lib/prisma";
import { encryptToken, decryptToken } from "@/lib/encryption";
import { pullSingleBureau, pullTriBureau, type CreditReportResult } from "./crs";
import { syncTransactions, getIdentity, removeItem, type PlaidTransaction } from "./plaid";
import { analyzeDocument, type DocumentAnalysisInput, type FullAnalysisResult } from "./document-analysis";
import { computeWellnessProfile, type TransactionRow, type WellnessResult } from "./wellness";
import { computeRiskScore, type RiskScoreResult } from "./scoring";
import { generateScreeningPdfBuffer } from "./pdf-report";
import { notifyAgentScreeningComplete, notifyAgentEnhancedDowngrade, notifyAgentScreeningFailed } from "./notifications";
import { SCREENING_TIERS, DOCUMENT_TYPE_LABELS } from "./constants";
import { dispatchAutomationSafe } from "@/lib/automation-dispatcher";
import { linkOrCreateContact, createScreeningActivity } from "./integration";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { retrieveAndDeleteSSN } from "./ssn-passthrough";

// ── Types ─────────────────────────────────────────────────────

export interface PipelineResult {
  applicationId: string;
  status: "complete" | "partial" | "failed";
  riskScore: number | null;
  recommendation: string | null;
  errors: string[];
  timings: Record<string, number>;
}

// ── Main Pipeline ─────────────────────────────────────────────

/**
 * Run the full screening pipeline for a completed application.
 * Called after successful Stripe payment confirmation.
 */
export async function runScreeningPipeline(
  applicationId: string
): Promise<PipelineResult> {
  const errors: string[] = [];
  const timings: Record<string, number> = {};
  const startTime = Date.now();
  let ssnLast4: string | undefined; // Capture SSN last 4 from credit pull for PDF use

  // ── Load Application + Relations ────────────────────────────
  // Documents, plaidConnections, creditReports are on ScreeningApplicant, not ScreeningApplication
  const application = await prisma.screeningApplication.findUnique({
    where: { id: applicationId },
    include: {
      applicants: {
        include: {
          documents: true,
          plaidConnections: true,
          creditReports: true,
        },
      },
      organization: true,
      agent: true,
    },
  });

  if (!application) {
    return { applicationId, status: "failed", riskScore: null, recommendation: null, errors: ["Application not found"], timings };
  }

  // Idempotency: don't re-run if already processing or complete
  if (application.status === "processing" || application.status === "complete") {
    return { applicationId, status: "partial", riskScore: null, recommendation: null, errors: ["Pipeline already ran or running — skipped"], timings };
  }

  // Mark as processing
  await prisma.screeningApplication.update({
    where: { id: applicationId },
    data: { status: "processing" },
  });

  await logEvent(applicationId, "pipeline_started", { tier: application.screeningTier });

  // Find primary applicant (role is "main" per ScreeningApplicantRole enum)
  const primaryApplicant = application.applicants.find((a: any) => a.role === "main");
  if (!primaryApplicant) {
    errors.push("No primary applicant found");
    await failPipeline(applicationId, errors);
    return { applicationId, status: "failed", riskScore: null, recommendation: null, errors, timings };
  }

  const isEnhanced = application.screeningTier === "enhanced";
  const transactionDays = isEnhanced ? SCREENING_TIERS.enhanced.transactionDays : SCREENING_TIERS.base.transactionDays;

  // Convenience: all documents and plaid connections across applicants (primarily from main)
  const allDocuments = application.applicants.flatMap((a: any) => a.documents || []);
  const allPlaidConnections = application.applicants.flatMap((a: any) => a.plaidConnections || []);

  // Wrap all processing in try-finally to ensure status is always updated
  // even on unexpected crashes — prevents "stuck in processing" state
  try {

  // ── Step 0: Enhanced Tier Org Charge (if applicable) ────────
  if (isEnhanced) {
    const chargeStart = Date.now();
    try {
      const charged = await chargeEnhancedFee(applicationId);
      if (!charged) {
        // chargeEnhancedFee already handles downgrade + notification
        // Refresh the application to get the updated tier
        const refreshed = await prisma.screeningApplication.findUnique({
          where: { id: applicationId },
          select: { screeningTier: true },
        });
        // If downgraded, continue with base tier logic
        if (refreshed?.screeningTier === "base") {
          errors.push("Enhanced charge failed — downgraded to base tier");
        }
      }
    } catch (error) {
      errors.push("Enhanced charge error — continuing with base tier");
      console.error("[Screening Pipeline] Enhanced charge error:", error);
    }
    timings.enhancedCharge = Date.now() - chargeStart;
  }

  // ── Step 1: Credit Report Pull ──────────────────────────────
  let creditReports: CreditReportResult[] = [];
  const creditStart = Date.now();
  try {
    // Guard against missing SSN
    if (!primaryApplicant.ssnEncrypted) {
      throw new Error("SSN not provided — cannot pull credit report");
    }

    // Retrieve SSN — prefer Redis pass-through, fall back to encrypted DB for legacy
    let decryptedSSN: string;
    const ssnField = primaryApplicant.ssnEncrypted;

    if (ssnField.startsWith("ref:")) {
      // New flow: SSN stored ephemerally in Redis
      const refId = ssnField.slice(4);
      const ssnResult = await retrieveAndDeleteSSN(refId, primaryApplicant.id);
      if (!ssnResult.success || !ssnResult.ssn) {
        throw new Error(
          ssnResult.error ||
            "SSN reference expired — applicant must re-enter SSN"
        );
      }
      decryptedSSN = ssnResult.ssn;
      ssnLast4 = ssnResult.ssn.slice(-4);
    } else if (ssnField) {
      // Legacy flow: SSN encrypted in database
      decryptedSSN = decryptToken(ssnField);
      ssnLast4 = decryptedSSN.slice(-4);
    } else {
      throw new Error("SSN not provided — cannot pull credit report");
    }

    // Extract personal info fields from the JSON personalInfo blob
    const personalInfo = (primaryApplicant.personalInfo as Record<string, any>) || {};

    const creditRequest = {
      firstName: primaryApplicant.firstName || "",
      lastName: primaryApplicant.lastName || "",
      ssn: decryptedSSN,
      dateOfBirth: personalInfo.dateOfBirth || personalInfo.dob || "",
      address: personalInfo.currentAddress || "",
      city: personalInfo.currentCity || "",
      state: personalInfo.currentState || "",
      zip: personalInfo.currentZip || "",
    };

    if (isEnhanced) {
      creditReports = await pullTriBureau(creditRequest);
    } else {
      const report = await pullSingleBureau(creditRequest);
      creditReports = [report];
    }

    // Store credit reports (CreditReport relates to applicantId, not applicationId)
    // Use existence check for idempotency — prevent duplicate inserts on pipeline re-run
    for (const report of creditReports) {
      const existingReport = await prisma.creditReport.findFirst({
        where: { applicantId: primaryApplicant.id, bureau: report.bureau },
      });
      if (existingReport) {
        console.log(`[Screening Pipeline] Credit report already exists for bureau=${report.bureau}, skipping`);
        continue;
      }

      await prisma.creditReport.create({
        data: {
          applicantId: primaryApplicant.id,
          bureau: report.bureau,
          pullType: report.pullType,
          creditScore: report.creditScore,
          scoreModel: report.scoreModel,
          totalAccounts: report.totalAccounts,
          openAccounts: report.openAccounts,
          totalBalance: report.totalBalance,
          totalMonthlyPayments: report.totalMonthlyPayments,
          delinquentAccounts: report.delinquentAccounts,
          collectionsCount: report.collectionsCount,
          collectionsTotal: report.collectionsTotal,
          publicRecordsCount: report.publicRecordsCount,
          inquiriesCount12m: report.inquiriesCount12m,
          oldestAccountMonths: report.oldestAccountMonths,
          evictionRecords: report.evictionRecords as any,
          evictionCount: report.evictionCount,
          criminalRecords: report.criminalRecords as any,
          criminalCount: report.criminalCount,
          bankruptcyRecords: report.bankruptcyRecords as any,
          hasActiveBankruptcy: report.hasActiveBankruptcy,
          rawReportEncrypted: report.rawReport ? encryptToken(report.rawReport) : null,
          status: "completed",
          pulledAt: new Date(),
        },
      });
    }

    await logEvent(applicationId, "credit_pull_complete", {
      bureaus: creditReports.map(r => r.bureau),
      scores: creditReports.map(r => r.creditScore),
    });
  } catch (error) {
    const msg = `Credit pull failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    errors.push(msg);
    console.error(`[Screening Pipeline] ${msg}`, error);
    await logEvent(applicationId, "credit_pull_failed", { error: msg });
  }
  timings.creditPull = Date.now() - creditStart;

  // ── Step 2: Plaid Transaction Sync ──────────────────────────
  let transactions: PlaidTransaction[] = [];
  let accountBalances: { current: number; available: number }[] = [];
  const plaidStart = Date.now();
  try {
    const plaidConnection = allPlaidConnections[0];
    if (plaidConnection) {
      const accessToken = decryptToken(plaidConnection.accessTokenEncrypted);

      // Sync transactions
      const syncResult = await syncTransactions(accessToken, transactionDays);
      transactions = syncResult.transactions;

      // Store transactions in DB — upsert on unique plaidTransactionId for idempotency
      for (const txn of transactions) {
        await prisma.financialTransaction.upsert({
          where: { plaidTransactionId: txn.transactionId },
          update: {
            // On re-run, update mutable fields
            amount: txn.amount,
            name: txn.name,
            merchantName: txn.merchantName,
            category: txn.category || [],
            primaryCategory: txn.category?.[0] || null,
            vettdreCategory: categorizeTransaction(txn),
          },
          create: {
            plaidConnectionId: plaidConnection.id,
            applicantId: primaryApplicant.id,
            plaidTransactionId: txn.transactionId,
            date: new Date(txn.date),
            amount: txn.amount,
            name: txn.name,
            merchantName: txn.merchantName,
            category: txn.category || [],
            primaryCategory: txn.category?.[0] || null,
            vettdreCategory: categorizeTransaction(txn),
            isRecurring: false, // Will be detected by wellness engine
          },
        });
      }

      // Get account balances from stored connection data (field is `accounts` JSON)
      // Plaid SDK returns snake_case; normalize both conventions for safety
      const accountsData = plaidConnection.accounts as any;
      if (Array.isArray(accountsData)) {
        accountBalances = accountsData.map((a: any) => ({
          current: Number(a.balances?.current ?? a.balanceCurrent ?? a.balance_current ?? 0),
          available: Number(a.balances?.available ?? a.balanceAvailable ?? a.balance_available ?? 0),
        }));
      }

      // Get identity data for cross-verification (store in accounts JSON since no dedicated field)
      try {
        const identity = await getIdentity(accessToken);
        // Update the accounts JSON with identity data appended
        await prisma.plaidConnection.update({
          where: { id: plaidConnection.id },
          data: {
            identityVerified: true,
            // Store identity data in accounts JSON (merge with existing)
            accounts: {
              ...(typeof accountsData === "object" && accountsData !== null ? { accounts: accountsData } : {}),
              identity,
            } as any,
          },
        });
      } catch (identityErr) {
        // Non-critical — identity is nice-to-have, but log for debugging
        console.warn("[Screening Pipeline] Plaid identity fetch failed (non-critical):", identityErr);
      }

      await logEvent(applicationId, "plaid_sync_complete", {
        transactionCount: transactions.length,
        days: transactionDays,
      });
    } else {
      errors.push("No Plaid connection found — skipping bank analysis");
    }
  } catch (error) {
    const msg = `Plaid sync failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    errors.push(msg);
    console.error(`[Screening Pipeline] ${msg}`, error);
    await logEvent(applicationId, "plaid_sync_failed", { error: msg });
  }
  timings.plaidSync = Date.now() - plaidStart;

  // ── Step 3: Document Analysis (parallel) ────────────────────
  const docAnalysisResults: FullAnalysisResult[] = [];
  const docStart = Date.now();
  try {
    const docs = allDocuments.filter((d: any) => d.filePath);

    // Prepare Plaid cross-verification data
    const plaidData = transactions.length > 0
      ? {
          deposits: transactions
            .filter(t => t.amount < 0)
            .map(t => ({ date: t.date, amount: Math.abs(t.amount), name: t.name })),
          employerNames: transactions
            .filter(t => t.amount < 0 && Math.abs(t.amount) > 1000)
            .map(t => t.merchantName || t.name)
            .filter(Boolean) as string[],
          accountBalances,
        }
      : undefined;

    // Run document analyses in parallel
    const DOC_FETCH_TIMEOUT_MS = 30_000; // 30s timeout for fetching document files

    const analysisPromises = docs.map(async (doc: any) => {
      try {
        // Idempotency: skip if analysis already exists for this document (unique documentId)
        const existingAnalysis = await prisma.documentAnalysis.findUnique({
          where: { documentId: doc.id },
        });
        if (existingAnalysis) {
          console.log(`[Screening Pipeline] Document analysis already exists for doc=${doc.id}, skipping`);
          return null;
        }

        // Fetch file from storage URL with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DOC_FETCH_TIMEOUT_MS);
        let response: Response;
        try {
          response = await fetch(doc.filePath!, { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }
        if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());

        const input: DocumentAnalysisInput = {
          documentType: doc.documentType,
          fileBuffer: buffer,
          mimeType: doc.mimeType || "application/pdf",
          fileName: doc.fileName,
          plaidData,
        };

        const result = await analyzeDocument(input);

        // Store analysis result (DocumentAnalysis relates to documentId + applicantId)
        await prisma.documentAnalysis.create({
          data: {
            documentId: doc.id,
            applicantId: doc.applicantId,
            metadataFlags: result.metadata.flags as any,
            metadataRiskLevel: result.metadata.riskLevel,
            extractedData: result.extraction.extractedData as any,
            extractionConfidence: result.extraction.confidence,
            crossVerification: result.crossVerification as any,
            incomeMatchesPlaid: result.crossVerification.incomeMatchesPlaid,
            employerMatchesPlaid: result.crossVerification.employerMatchesPlaid,
            balanceMatchesPlaid: result.crossVerification.balanceMatchesPlaid,
            discrepancies: result.crossVerification.discrepancies as any,
            fraudAssessment: mapFraudAssessment(result.fraudAssessment),
            fraudScore: result.crossVerification.fraudScore,
            aiAnalysisSummary: result.aiSummary,
            aiModelUsed: result.modelUsed,
          },
        });

        return result;
      } catch (error) {
        console.error(`[Screening Pipeline] Doc analysis failed for ${doc.fileName}:`, error);
        return null;
      }
    });

    const results = await Promise.allSettled(analysisPromises);
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        docAnalysisResults.push(result.value);
      }
    }

    await logEvent(applicationId, "document_analysis_complete", {
      analyzed: docAnalysisResults.length,
      total: docs.length,
    });
  } catch (error) {
    const msg = `Document analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    errors.push(msg);
    console.error(`[Screening Pipeline] ${msg}`, error);
  }
  timings.documentAnalysis = Date.now() - docStart;

  // ── Step 4: Financial Wellness Profile ──────────────────────
  let wellnessResult: WellnessResult | null = null;
  const wellnessStart = Date.now();
  try {
    if (transactions.length > 0) {
      const personalInfo = (primaryApplicant.personalInfo as Record<string, any>) || {};
      // Prisma Decimal fields return Decimal objects — use toNumber() for safe conversion
      const monthlyRent = Number(personalInfo.currentRent || 0) ||
                          (application.monthlyRent ? Number(application.monthlyRent) : 0);

      const transactionRows: TransactionRow[] = transactions.map(t => ({
        date: new Date(t.date),
        amount: t.amount,
        vettdreCategory: categorizeTransaction(t),
        merchantName: t.merchantName,
        name: t.name,
        isRecurring: false,
      }));

      wellnessResult = computeWellnessProfile(transactionRows, monthlyRent, accountBalances);

      // Store wellness profile — upsert for idempotency (unique on applicationId)
      const wellnessData = {
        avgMonthlyIncome: wellnessResult.avgMonthlyIncome,
        incomeSources: wellnessResult.incomeSources as any,
        incomeStabilityScore: wellnessResult.incomeStabilityScore,
        incomeTrend: wellnessResult.incomeTrend,
        avgMonthlyExpenses: wellnessResult.avgMonthlyExpenses,
        recurringObligations: wellnessResult.recurringObligations as any,
        estimatedMonthlyDebt: wellnessResult.estimatedMonthlyDebt,
        incomeToRentRatio: wellnessResult.incomeToRentRatio,
        debtToIncomeRatio: wellnessResult.debtToIncomeRatio,
        disposableIncome: wellnessResult.disposableIncome,
        avgBalance30d: wellnessResult.avgBalance30d,
        avgBalance60d: wellnessResult.avgBalance60d,
        avgBalance90d: wellnessResult.avgBalance90d,
        lowestBalance90d: wellnessResult.lowestBalance90d,
        rentPaymentsFound: wellnessResult.rentPaymentsFound,
        rentPaymentsOnTime: wellnessResult.rentPaymentsOnTime,
        rentPaymentConsistency: wellnessResult.rentPaymentConsistency,
        nsfCount90d: wellnessResult.nsfCount90d,
        overdraftCount90d: wellnessResult.overdraftCount90d,
        lateFeeCount90d: wellnessResult.lateFeeCount90d,
        gamblingTransactionCount: wellnessResult.gamblingTransactionCount,
        suspiciousActivityFlags: wellnessResult.suspiciousActivityFlags,
        financialHealthScore: wellnessResult.financialHealthScore,
        healthTier: wellnessResult.healthTier,
        analysisPeriodStart: wellnessResult.analysisPeriodStart,
        analysisPeriodEnd: wellnessResult.analysisPeriodEnd,
      };

      await prisma.financialWellnessProfile.upsert({
        where: { applicationId },
        update: wellnessData,
        create: {
          applicationId,
          applicantId: primaryApplicant.id,
          ...wellnessData,
        },
      });

      await logEvent(applicationId, "wellness_computed", {
        healthScore: wellnessResult.financialHealthScore,
        healthTier: wellnessResult.healthTier,
      });
    }
  } catch (error) {
    const msg = `Wellness computation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    errors.push(msg);
    console.error(`[Screening Pipeline] ${msg}`, error);
  }
  timings.wellness = Date.now() - wellnessStart;

  // ── Step 4.5: Revoke Plaid Item Access ─────────────────────
  // After financial data processing is complete, remove the Plaid item
  // to revoke access to the consumer's bank data per privacy best practices.
  const plaidRevokeStart = Date.now();
  try {
    const plaidConnection = allPlaidConnections[0];
    if (plaidConnection && plaidConnection.accessTokenEncrypted) {
      const accessToken = decryptToken(plaidConnection.accessTokenEncrypted);
      try {
        await removeItem(accessToken);
        console.log(`[Screening Pipeline] Plaid item removed for applicationId=${applicationId}`);
        await logEvent(applicationId, "plaid_item_removed", {});
      } catch (removeError) {
        // Non-fatal: log the error but don't crash the pipeline
        console.warn(`[Screening Pipeline] Failed to remove Plaid item: ${removeError instanceof Error ? removeError.message : "Unknown error"}`);
        await logEvent(applicationId, "plaid_item_removal_failed", {
          error: removeError instanceof Error ? removeError.message : "Unknown error",
        });
      }

      // Delete the encrypted access token from the database for security
      try {
        await prisma.plaidConnection.update({
          where: { id: plaidConnection.id },
          data: {
            accessTokenEncrypted: "", // Clear the token
          },
        });
        console.log(`[Screening Pipeline] Plaid access token cleared for applicationId=${applicationId}`);
      } catch (deleteError) {
        // Non-fatal: log the error but don't crash the pipeline
        console.warn(`[Screening Pipeline] Failed to clear Plaid access token: ${deleteError instanceof Error ? deleteError.message : "Unknown error"}`);
      }
    }
  } catch (error) {
    // Catch-all for the entire revocation step
    console.warn(`[Screening Pipeline] Plaid revocation step error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  timings.plaidRevoke = Date.now() - plaidRevokeStart;

  // ── Step 5: Compute Risk Score ──────────────────────────────
  let riskResult: RiskScoreResult | null = null;
  const scoreStart = Date.now();
  try {
    // Use best credit score from all bureau pulls
    const creditScore = creditReports.length > 0
      ? Math.max(...creditReports.map(r => r.creditScore ?? 0))
      : null;

    const evictionCount = creditReports.reduce(
      (sum, r) => sum + (r.evictionCount || 0), 0
    );
    const hasActiveBankruptcy = creditReports.some(r => r.hasActiveBankruptcy);

    // Worst fraud score across all documents
    const documentFraudScore = docAnalysisResults.length > 0
      ? Math.max(...docAnalysisResults.map(r => r.crossVerification.fraudScore))
      : null;

    // Prisma Decimal → number conversion
    const monthlyRent = application.monthlyRent ? Number(application.monthlyRent) : 0;

    riskResult = computeRiskScore({
      creditScore: creditScore && creditScore > 0 ? creditScore : null,
      financialHealthScore: wellnessResult?.financialHealthScore ?? null,
      monthlyIncome: wellnessResult?.avgMonthlyIncome ?? null,
      monthlyRent,
      documentFraudScore,
      rentPaymentConsistency: wellnessResult?.rentPaymentConsistency ?? null,
      evictionCount,
      hasActiveBankruptcy,
    });

    // Update application with score + recommendation
    // Schema fields: vettdreRiskScore, riskRecommendation, riskFactors (no componentScores)
    await prisma.screeningApplication.update({
      where: { id: applicationId },
      data: {
        vettdreRiskScore: riskResult.score,
        riskRecommendation: riskResult.recommendation,
        riskFactors: riskResult.factors as any,
        status: "complete",
        completedAt: new Date(),
      },
    });

    await logEvent(applicationId, "risk_score_computed", {
      score: riskResult.score,
      recommendation: riskResult.recommendation,
      factors: riskResult.factors,
    });
  } catch (error) {
    const msg = `Risk score computation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    errors.push(msg);
    console.error(`[Screening Pipeline] ${msg}`, error);

    // Still mark as complete even if scoring fails — agent can review manually
    await prisma.screeningApplication.update({
      where: { id: applicationId },
      data: {
        status: "complete",
        completedAt: new Date(),
      },
    });
  }
  timings.riskScore = Date.now() - scoreStart;

  // ── Step 6: Generate PDF Report ─────────────────────────────
  const pdfStart = Date.now();
  try {
    if (riskResult) {
      const personalInfo = (primaryApplicant.personalInfo as Record<string, any>) || {};

      // Build document analysis summaries from DB (re-read to get stored analyses)
      const storedDocs = await prisma.screeningDocument.findMany({
        where: { applicantId: primaryApplicant.id },
        include: { analysis: true },
      });

      const documentAnalyses = storedDocs
        .filter((d: any) => d.analysis)
        .map((d: any) => ({
          fileName: d.fileName,
          documentType: d.documentType || "other",
          fraudAssessment: d.analysis.fraudAssessment || "medium_risk",
          confidence: d.analysis.extractionConfidence ? Number(d.analysis.extractionConfidence) : 0,
          discrepancies: Array.isArray(d.analysis.discrepancies) ? d.analysis.discrepancies : [],
          aiSummary: d.analysis.aiAnalysisSummary || "",
        }));

      const pdfBuffer = generateScreeningPdfBuffer({
        applicationId,
        propertyAddress: application.propertyAddress,
        unitNumber: application.unitNumber || undefined,
        monthlyRent: application.monthlyRent ? Number(application.monthlyRent) : 0,
        tier: (application.screeningTier === "enhanced" ? "enhanced" : "base") as "base" | "enhanced",
        completedAt: new Date(),
        applicantName: `${primaryApplicant.firstName || ""} ${primaryApplicant.lastName || ""}`.trim(),
        applicantEmail: primaryApplicant.email,
        applicantPhone: primaryApplicant.phone || undefined,
        dateOfBirth: personalInfo.dateOfBirth || personalInfo.dob || undefined,
        ssnLast4: ssnLast4,
        currentAddress: personalInfo.currentAddress || undefined,
        employer: personalInfo.employer || undefined,
        monthlyIncome: personalInfo.monthlyIncome ? Number(personalInfo.monthlyIncome) : undefined,
        agentName: application.agent?.fullName || "Agent",
        orgName: application.organization?.name || "Organization",
        riskScore: riskResult,
        creditReports,
        wellness: wellnessResult,
        documentAnalyses,
      });

      // Upload to Supabase Storage using service role (no user context in background pipeline)
      const storagePath = `screening-reports/${applicationId}/report.pdf`;
      const supabase = createSupabaseAdmin(
        (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
        (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
      );

      const { error: uploadError } = await supabase.storage
        .from("screening-reports")
        .upload(storagePath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true, // overwrite on re-run for idempotency
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // Update application with PDF path
      await prisma.screeningApplication.update({
        where: { id: applicationId },
        data: {
          reportPdfPath: storagePath,
          reportGeneratedAt: new Date(),
        },
      });

      await logEvent(applicationId, "report_generated", { storagePath });
    }
  } catch (error) {
    const msg = `PDF report generation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    errors.push(msg);
    console.error(`[Screening Pipeline] ${msg}`, error);
    await logEvent(applicationId, "report_generation_failed", { error: msg });
  }
  timings.pdfReport = Date.now() - pdfStart;

  // ── Step 7: CRM Integration + Notify Agent ─────────────────
  try {
    // 7a. Link or create CRM Contact from primary applicant
    const contactId = await linkOrCreateContact(
      applicationId,
      application.orgId,
      application.agentUserId,
    );

    // 7b. Create Activity timeline entry for screening completion
    const recLabel = riskResult?.recommendation ?? "review_needed";
    await createScreeningActivity(
      application.orgId,
      contactId,
      application.agentUserId,
      `Screening complete: ${recLabel.toUpperCase()} — Score ${riskResult?.score ?? "N/A"}`,
      {
        screeningApplicationId: applicationId,
        riskScore: riskResult?.score ?? null,
        recommendation: recLabel,
        propertyAddress: application.propertyAddress,
      },
    );

    // 7c. Notify agent via email + push
    if (application.agent) {
      await notifyAgentScreeningComplete({
        agentEmail: application.agent.email,
        agentUserId: application.agent.id,
        agentFirstName: application.agent.fullName?.split(" ")[0] || "there",
        applicantName: `${primaryApplicant.firstName} ${primaryApplicant.lastName}`,
        propertyAddress: application.propertyAddress,
        riskScore: riskResult?.score ?? 0,
        recommendation: riskResult?.recommendation ?? (errors.length > 0 ? "review_needed" : "pending"),
        applicationId,
      });
    }

    // 7d. Fire automation trigger
    await dispatchAutomationSafe(application.orgId, "screening_completed" as never, {
      applicationId,
      contactId: contactId ?? null,
      agentUserId: application.agentUserId,
      riskScore: riskResult?.score ?? null,
      recommendation: riskResult?.recommendation ?? null,
      propertyAddress: application.propertyAddress,
    });

    await logEvent(applicationId, "pipeline_complete", {
      totalTime: Date.now() - startTime,
      errors: errors.length,
      contactId,
    });
  } catch (error) {
    console.error("[Screening Pipeline] Integration/notification error:", error);
  }

  timings.total = Date.now() - startTime;

  return {
    applicationId,
    status: errors.length === 0 ? "complete" : "partial",
    riskScore: riskResult?.score ?? null,
    recommendation: riskResult?.recommendation ?? null,
    errors,
    timings,
  };

  } catch (fatalError) {
    // Unexpected crash — ensure application is not stuck in "processing"
    console.error("[Screening Pipeline] Fatal pipeline error:", fatalError);
    errors.push(`Fatal error: ${fatalError instanceof Error ? fatalError.message : "Unknown"}`);
    await failPipeline(applicationId, errors);
    timings.total = Date.now() - startTime;
    return { applicationId, status: "failed", riskScore: null, recommendation: null, errors, timings };
  }
}

// ── Enhanced Tier Charge Handler ──────────────────────────────

/**
 * Attempt to charge the org's card on file for the enhanced tier upgrade.
 * If charge fails, downgrade to base tier and notify agent.
 */
export async function chargeEnhancedFee(applicationId: string): Promise<boolean> {
  const application = await prisma.screeningApplication.findUnique({
    where: { id: applicationId },
    include: { organization: true, agent: true },
  });

  if (!application || application.screeningTier !== "enhanced") return false;

  const org = application.organization;
  if (!org.stripeCustomerId || !org.stripeDefaultPaymentMethod) {
    // No card on file — downgrade
    await downgradeToBase(applicationId, "No payment method on file");
    return false;
  }

  try {
    // Dynamic import to avoid requiring stripe at module load
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2024-06-20" as any,
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: SCREENING_TIERS.enhanced.orgFee,
      currency: "usd",
      customer: org.stripeCustomerId,
      payment_method: org.stripeDefaultPaymentMethod,
      off_session: true,
      confirm: true,
      description: `VettdRE Enhanced Screening — ${application.propertyAddress}`,
      metadata: {
        applicationId,
        orgId: org.id,
        type: "screening_enhanced",
      },
    });

    if (paymentIntent.status === "succeeded") {
      // Record payment using correct ScreeningPayment schema fields
      await prisma.screeningPayment.create({
        data: {
          applicationId,
          organizationId: org.id,
          payerType: "organization",
          paymentType: "enhanced_upgrade",
          amountCents: SCREENING_TIERS.enhanced.orgFee,
          stripePaymentIntentId: paymentIntent.id,
          status: "succeeded",
          paidAt: new Date(),
        },
      });
      return true;
    }

    // Payment requires action or failed
    await downgradeToBase(applicationId, `Payment status: ${paymentIntent.status}`);
    return false;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Payment failed";
    await downgradeToBase(applicationId, msg);
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────

async function downgradeToBase(applicationId: string, reason: string): Promise<void> {
  const application = await prisma.screeningApplication.findUnique({
    where: { id: applicationId },
    include: { agent: true },
  });

  if (!application) return;

  await prisma.screeningApplication.update({
    where: { id: applicationId },
    data: { screeningTier: "base" },
  });

  await logEvent(applicationId, "enhanced_downgraded", { reason });

  // Notify agent about the downgrade
  if (application.agent) {
    const applicant = await prisma.screeningApplicant.findFirst({
      where: { applicationId, role: "main" },
    });

    await notifyAgentEnhancedDowngrade({
      agentEmail: application.agent.email,
      agentFirstName: application.agent.fullName?.split(" ")[0] || "there",
      applicantName: applicant
        ? `${applicant.firstName} ${applicant.lastName}`
        : "Applicant",
      propertyAddress: application.propertyAddress,
      applicationId,
      failureReason: reason,
    });
  }
}

async function failPipeline(applicationId: string, errors: string[]): Promise<void> {
  try {
    await prisma.screeningApplication.update({
      where: { id: applicationId },
      data: { status: "complete", completedAt: new Date() },
    });
    await logEvent(applicationId, "pipeline_failed", { errors });

    // Notify the agent about the failure
    const app = await prisma.screeningApplication.findUnique({
      where: { id: applicationId },
      include: {
        agent: { select: { id: true, email: true, fullName: true } },
        applicants: { where: { role: "main" }, take: 1, select: { firstName: true, lastName: true } },
      },
    });
    if (app?.agent) {
      const mainApplicant = app.applicants[0];
      await notifyAgentScreeningFailed({
        agentEmail: app.agent.email,
        agentUserId: app.agent.id,
        agentFirstName: app.agent.fullName?.split(" ")[0] || "there",
        applicantName: mainApplicant ? `${mainApplicant.firstName} ${mainApplicant.lastName}` : "Unknown Applicant",
        propertyAddress: app.propertyAddress,
        applicationId,
        failureReasons: errors,
      }).catch(err => console.error("[Screening Pipeline] Failure notification error:", err));
    }
  } catch (e) {
    console.error("[Screening Pipeline] Failed to update status on failure:", e);
  }
}

async function logEvent(
  applicationId: string,
  eventType: string,
  eventData: Record<string, any>
): Promise<void> {
  try {
    await prisma.screeningEvent.create({
      data: {
        applicationId,
        eventType,
        eventData: eventData as any,
      },
    });
  } catch (error) {
    console.error(`[Screening Pipeline] Failed to log event ${eventType}:`, error);
  }
}

/**
 * Map Plaid transaction to VettdRE category using name/category heuristics.
 */
function categorizeTransaction(txn: PlaidTransaction): string {
  const name = (txn.name || "").toLowerCase();
  const merchant = (txn.merchantName || "").toLowerCase();
  const cats = txn.category || [];
  const primary = cats[0]?.toLowerCase() || "";

  // Income (negative amounts in Plaid)
  if (txn.amount < 0) {
    if (primary.includes("payroll") || name.includes("payroll") || name.includes("direct dep")) return "income_salary";
    if (name.includes("venmo") || name.includes("zelle") || name.includes("cashapp")) return "transfer_in";
    if (primary.includes("government") || name.includes("irs") || name.includes("ssi")) return "income_government";
    return "income_other";
  }

  // Rent / Mortgage
  if (name.includes("rent") || (primary.includes("rent") && txn.amount > 500)) return "rent_payment";
  if (name.includes("mortgage") || primary.includes("mortgage")) return "mortgage_payment";

  // Debt payments
  if (primary.includes("loan") || name.includes("loan payment") || name.includes("student loan")) return "loan_payment";
  if (name.includes("credit card") || primary.includes("credit card")) return "credit_card_payment";

  // Red flags
  if (name.includes("nsf") || name.includes("insufficient funds")) return "nsf_fee";
  if (name.includes("overdraft")) return "overdraft_fee";
  if (name.includes("late fee") || name.includes("late charge")) return "late_fee";
  if (primary.includes("gambling") || name.includes("draftkings") || name.includes("fanduel") || name.includes("casino")) return "gambling";

  // Bills
  if (primary.includes("utilities") || name.includes("electric") || name.includes("gas bill") || name.includes("water bill")) return "utilities";
  if (primary.includes("insurance")) return "insurance";
  if (primary.includes("subscription") || name.includes("netflix") || name.includes("spotify")) return "subscriptions";

  // Living expenses
  if (primary.includes("food") || primary.includes("groceries")) return "groceries";
  if (primary.includes("restaurants") || primary.includes("dining")) return "dining";
  if (primary.includes("travel") || primary.includes("transportation")) return "transportation";
  if (primary.includes("entertainment")) return "entertainment";

  // Transfers
  if (primary.includes("transfer")) return txn.amount > 0 ? "transfer_out" : "transfer_in";
  if (name.includes("atm")) return "atm_withdrawal";

  return "other";
}

/**
 * Map fraud assessment string to the Prisma enum value.
 */
function mapFraudAssessment(
  assessment: string
): "clean" | "low_risk" | "medium_risk" | "high_risk" | "fraudulent" {
  const valid = ["clean", "low_risk", "medium_risk", "high_risk", "fraudulent"];
  return valid.includes(assessment)
    ? (assessment as any)
    : "medium_risk";
}
