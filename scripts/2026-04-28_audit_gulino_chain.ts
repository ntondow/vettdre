// 2026-04-28_audit_gulino_chain.ts
//
// Slice 0b: read-only audit of the Gulino DealSubmission → Invoice → Payment
// chain. Resolves the Gulino org by slug, fetches every DealSubmission, and
// records per-row whether a Transaction, Invoice, and Payment(s) exist.
//
// READ-ONLY: no INSERT/UPDATE/DELETE. Re-runs are free. Outputs a markdown
// table + CSV under docs/handoff/ (gitignored).
//
// Usage:
//   npx tsx scripts/2026-04-28_audit_gulino_chain.ts

import fs from "node:fs";
import path from "node:path";
import prisma from "../src/lib/prisma";

const GULINO_SLUG = "gulino-group";
const HANDOFF_DIR = path.resolve(__dirname, "..", "docs", "handoff");
const MD_PATH = path.join(HANDOFF_DIR, "gulino-chain-audit.md");
const CSV_PATH = path.join(HANDOFF_DIR, "gulino-chain-audit.csv");

type Row = {
  dsId: string;
  createdAt: Date;
  closingDate: Date | null;
  status: string;
  agentEmail: string;
  agentName: string;
  property: string;
  totalCommission: string;
  agentSplitPct: string;
  agentPayout: string;
  processingFeePct: string | null;
  processingFeeAmt: string | null;
  txExists: boolean;
  txStage: string | null;
  invExists: boolean;
  invNumber: string | null;
  invStatus: string | null;
  invAgentPayout: string | null;
  invProcessingFeeAmt: string | null;
  paidDate: Date | null;
  paymentCount: number;
  paymentTotal: string;
  paymentMethods: string;
};

function fmtMoney(d: unknown): string {
  if (d === null || d === undefined) return "";
  return Number(d).toFixed(2);
}

function fmtPct(d: unknown): string | null {
  if (d === null || d === undefined) return null;
  return Number(d).toFixed(2);
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  console.log(`[1/5] Resolving Gulino org by slug='${GULINO_SLUG}'...`);
  const org = await prisma.organization.findUnique({
    where: { slug: GULINO_SLUG },
    select: { id: true, name: true, slug: true, createdAt: true },
  });
  if (!org) {
    console.error(`FAIL: org with slug='${GULINO_SLUG}' not found.`);
    process.exit(1);
  }
  console.log(`      → ${org.name} (${org.id})`);

  console.log("[2/5] Fetching DealSubmissions for Gulino...");
  const submissions = await prisma.dealSubmission.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "asc" },
    include: {
      transaction: { select: { id: true, stage: true } },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          agentPayout: true,
          processingFeeAmt: true,
          paidDate: true,
          payments: {
            select: {
              id: true,
              amount: true,
              paymentMethod: true,
              paymentDate: true,
            },
            orderBy: { paymentDate: "asc" },
          },
        },
      },
    },
  });
  console.log(`      → ${submissions.length} submissions`);

  console.log("[3/5] Computing per-row chain state...");
  const rows: Row[] = submissions.map((ds) => {
    const inv = ds.invoice;
    const payments = inv?.payments ?? [];
    const paymentTotal = payments.reduce(
      (acc, p) => acc + Number(p.amount),
      0,
    );
    return {
      dsId: ds.id,
      createdAt: ds.createdAt,
      closingDate: ds.closingDate,
      status: ds.status,
      agentEmail: ds.agentEmail,
      agentName: `${ds.agentFirstName} ${ds.agentLastName}`.trim(),
      property: ds.propertyAddress,
      totalCommission: fmtMoney(ds.totalCommission),
      agentSplitPct: fmtMoney(ds.agentSplitPct),
      agentPayout: fmtMoney(ds.agentPayout),
      processingFeePct: fmtPct(ds.processingFeePct),
      processingFeeAmt: ds.processingFeeAmt ? fmtMoney(ds.processingFeeAmt) : null,
      txExists: !!ds.transaction,
      txStage: ds.transaction?.stage ?? null,
      invExists: !!inv,
      invNumber: inv?.invoiceNumber ?? null,
      invStatus: inv?.status ?? null,
      invAgentPayout: inv ? fmtMoney(inv.agentPayout) : null,
      invProcessingFeeAmt: inv?.processingFeeAmt ? fmtMoney(inv.processingFeeAmt) : null,
      paidDate: inv?.paidDate ?? null,
      paymentCount: payments.length,
      paymentTotal: paymentTotal.toFixed(2),
      paymentMethods: payments.map((p) => p.paymentMethod).join(";"),
    };
  });

  // Summary tallies.
  const totals = {
    rows: rows.length,
    statusBreakdown: {} as Record<string, number>,
    txMissing: 0,
    invMissing: 0,
    payMissing: 0,
    fullChain: 0,
    sumCommission: 0,
    sumAgentPayoutDS: 0,
    sumPaymentsTotal: 0,
  };
  for (const r of rows) {
    totals.statusBreakdown[r.status] = (totals.statusBreakdown[r.status] ?? 0) + 1;
    if (!r.txExists) totals.txMissing += 1;
    if (!r.invExists) totals.invMissing += 1;
    if (r.paymentCount === 0) totals.payMissing += 1;
    if (r.txExists && r.invExists && r.paymentCount > 0) totals.fullChain += 1;
    totals.sumCommission += Number(r.totalCommission);
    totals.sumAgentPayoutDS += Number(r.agentPayout);
    totals.sumPaymentsTotal += Number(r.paymentTotal);
  }

  console.log("[4/5] Writing outputs to docs/handoff/...");
  fs.mkdirSync(HANDOFF_DIR, { recursive: true });

  // --- Markdown ---
  const md: string[] = [];
  md.push(`# Gulino Chain Audit (Slice 0b read-only)`);
  md.push("");
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push(`Org: **${org.name}** \`${org.id}\` (slug \`${org.slug}\`)`);
  md.push("");
  md.push(`## Summary`);
  md.push("");
  md.push(`- Total DealSubmissions: **${totals.rows}**`);
  md.push(
    `- Status breakdown: ${Object.entries(totals.statusBreakdown)
      .map(([k, v]) => `\`${k}\`=${v}`)
      .join(", ")}`,
  );
  md.push(`- Transactions missing: **${totals.txMissing}**`);
  md.push(`- Invoices missing: **${totals.invMissing}**`);
  md.push(`- Payments missing: **${totals.payMissing}**`);
  md.push(`- Full DS→TX→INV→PAY chain present: **${totals.fullChain}**`);
  md.push(
    `- Σ totalCommission (DS): \`$${totals.sumCommission.toFixed(2)}\``,
  );
  md.push(
    `- Σ agentPayout (DS, snapshot): \`$${totals.sumAgentPayoutDS.toFixed(2)}\``,
  );
  md.push(
    `- Σ payments recorded: \`$${totals.sumPaymentsTotal.toFixed(2)}\``,
  );
  md.push("");
  md.push(`## Per-row state`);
  md.push("");
  md.push(
    "| # | DS id (8) | Created | Closing | Status | Agent | Property | Commission | Split% | DS payout | TX | Invoice | Inv status | Inv payout | Paid date | Pmt# | Σ Pmts |",
  );
  md.push(
    "|---|-----------|---------|---------|--------|-------|----------|------------|--------|-----------|----|---------|------------|------------|-----------|------|--------|",
  );
  rows.forEach((r, i) => {
    md.push(
      "| " +
        [
          String(i + 1),
          `\`${r.dsId.slice(0, 8)}\``,
          fmtDate(r.createdAt),
          fmtDate(r.closingDate),
          r.status,
          r.agentName,
          r.property,
          r.totalCommission,
          r.agentSplitPct,
          r.agentPayout,
          r.txExists ? `✓ ${r.txStage ?? ""}` : "✗",
          r.invExists ? `✓ ${r.invNumber ?? ""}` : "✗",
          r.invStatus ?? "",
          r.invAgentPayout ?? "",
          fmtDate(r.paidDate),
          String(r.paymentCount),
          r.paymentTotal,
        ].join(" | ") +
        " |",
    );
  });
  md.push("");
  md.push(`## Notes`);
  md.push("");
  md.push(
    `- This audit reads from production Supabase via DATABASE_URL. No mutations.`,
  );
  md.push(
    `- DS \`agentPayout\` is the snapshot at submission time. Invoice \`agentPayout\` is the canonical net-of-fee figure used by Reports/Leaderboard.`,
  );
  md.push(
    `- "Pmt#" / "Σ Pmts" reflect rows in the \`payments\` table linked to the invoice.`,
  );
  fs.writeFileSync(MD_PATH, md.join("\n") + "\n");

  // --- CSV ---
  const csvHeader = [
    "row",
    "ds_id",
    "ds_created_at",
    "ds_closing_date",
    "ds_status",
    "agent_name",
    "agent_email",
    "property_address",
    "ds_total_commission",
    "ds_agent_split_pct",
    "ds_agent_payout",
    "ds_processing_fee_pct",
    "ds_processing_fee_amt",
    "tx_exists",
    "tx_stage",
    "inv_exists",
    "inv_number",
    "inv_status",
    "inv_agent_payout",
    "inv_processing_fee_amt",
    "inv_paid_date",
    "payment_count",
    "payment_sum",
    "payment_methods",
  ];
  const csvLines = [csvHeader.join(",")];
  rows.forEach((r, i) => {
    csvLines.push(
      [
        String(i + 1),
        r.dsId,
        r.createdAt.toISOString(),
        r.closingDate ? r.closingDate.toISOString() : "",
        r.status,
        r.agentName,
        r.agentEmail,
        r.property,
        r.totalCommission,
        r.agentSplitPct,
        r.agentPayout,
        r.processingFeePct ?? "",
        r.processingFeeAmt ?? "",
        String(r.txExists),
        r.txStage ?? "",
        String(r.invExists),
        r.invNumber ?? "",
        r.invStatus ?? "",
        r.invAgentPayout ?? "",
        r.invProcessingFeeAmt ?? "",
        r.paidDate ? r.paidDate.toISOString() : "",
        String(r.paymentCount),
        r.paymentTotal,
        r.paymentMethods,
      ]
        .map(csvEscape)
        .join(","),
    );
  });
  fs.writeFileSync(CSV_PATH, csvLines.join("\n") + "\n");

  console.log(`      → ${MD_PATH}`);
  console.log(`      → ${CSV_PATH}`);

  console.log("[5/5] Summary");
  console.log(`      Org:                       ${org.name} (${org.id})`);
  console.log(`      DealSubmissions:           ${totals.rows}`);
  console.log(
    `      Status breakdown:          ${Object.entries(totals.statusBreakdown)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}`,
  );
  console.log(`      Transactions missing:      ${totals.txMissing}`);
  console.log(`      Invoices missing:          ${totals.invMissing}`);
  console.log(`      Payments missing:          ${totals.payMissing}`);
  console.log(`      Full chain:                ${totals.fullChain}`);
  console.log(
    `      Σ DS commission:           $${totals.sumCommission.toFixed(2)}`,
  );
  console.log(
    `      Σ DS agentPayout snapshot: $${totals.sumAgentPayoutDS.toFixed(2)}`,
  );
  console.log(
    `      Σ payments recorded:       $${totals.sumPaymentsTotal.toFixed(2)}`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAIL:", e);
  await prisma.$disconnect();
  process.exit(1);
});
