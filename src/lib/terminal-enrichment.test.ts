/**
 * Regression tests for terminal enrichment — ACRIS party type mapping.
 * Run: npx tsx src/lib/terminal-enrichment.test.ts
 *
 * These tests exercise the extractRawFields and ownership_chain builder
 * via the exported enrichTerminalEvent function, but since that function
 * makes external API calls we test the mapping logic in isolation instead.
 */

// We can't call enrichTerminalEvent directly (it hits external APIs),
// so we extract and test the mapping logic that was buggy.

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function test(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ── Reproduce the mapping logic from terminal-enrichment.ts ──

/** Ownership chain builder — mirrors lines 322-337 of terminal-enrichment.ts */
function buildDeedHistory(metadata: any) {
  const parties = metadata._parties || [];
  // ACRIS party types: type 1 = grantor (seller), type 2 = grantee (buyer)
  // Verified 2026-04-25 against live Socrata 636b-3b5g doc 2015081800233001
  const buyers = parties.filter((p: any) => String(p.type) === "2").map((p: any) => p.name).filter(Boolean);
  const sellers = parties.filter((p: any) => String(p.type) === "1").map((p: any) => p.name).filter(Boolean);

  return metadata.document_id
    ? [{
        documentId: metadata.document_id,
        docType: metadata.doc_type || "",
        recordedDate: metadata.good_through_date || metadata.recorded_datetime || "",
        amount: metadata.doc_amount ? parseFloat(metadata.doc_amount) : null,
        buyerName: buyers[0] || null,
        sellerName: sellers[0] || null,
      }]
    : [];
}

/** extractRawFields for SALE_RECORDED — mirrors lines 376-385 of terminal-enrichment.ts */
function extractSaleRawFields(metadata: any) {
  // ACRIS party types: type 1 = grantor (seller), type 2 = grantee (buyer)
  return {
    buyers: (metadata._parties || []).filter((p: any) => String(p.type) === "2").map((p: any) => p.name),
    sellers: (metadata._parties || []).filter((p: any) => String(p.type) === "1").map((p: any) => p.name),
  };
}

// ── Test fixtures ────────────────────────────────────────────

const DEED_METADATA = {
  document_id: "2015081800233001",
  doc_type: "DEED",
  doc_amount: "680000",
  good_through_date: "2015-08-31",
  _parties: [
    { name: "ESTATE OF ANNA I. SILVA", type: "1" },        // grantor = seller
    { name: "MARTA TERESA MOTTA", type: "1" },             // grantor = seller
    { name: "ISLAM, MOHAMMAD S", type: "2" },               // grantee = buyer
    { name: "ISLAM, RUFISA", type: "2" },                   // grantee = buyer
  ],
};

const MORTGAGE_METADATA = {
  document_id: "2026041300100001",
  doc_type: "MTGE",
  doc_amount: "8500000",
  good_through_date: "2026-04-13",
  _parties: [
    { name: "MANHATTAN HOLDINGS LLC", type: "1" },          // mortgagor = borrower
    { name: "SIGNATURE BANK", type: "2" },                  // mortgagee = lender
  ],
};

// ── Tests ────────────────────────────────────────────────────

test("DEED: type-2 parties (grantee) map to buyerName", () => {
  const deeds = buildDeedHistory(DEED_METADATA);
  assert(deeds.length === 1, "produces one deed record");
  assert(deeds[0].buyerName === "ISLAM, MOHAMMAD S", `buyerName should be type-2 (grantee), got "${deeds[0].buyerName}"`);
});

test("DEED: type-1 parties (grantor) map to sellerName", () => {
  const deeds = buildDeedHistory(DEED_METADATA);
  assert(deeds[0].sellerName === "ESTATE OF ANNA I. SILVA", `sellerName should be type-1 (grantor), got "${deeds[0].sellerName}"`);
});

test("DEED: extractRawFields maps type-2 to buyers, type-1 to sellers", () => {
  const fields = extractSaleRawFields(DEED_METADATA);
  assert(fields.buyers.includes("ISLAM, MOHAMMAD S"), `buyers should include type-2 (grantee) party`);
  assert(fields.buyers.includes("ISLAM, RUFISA"), `buyers should include all type-2 parties`);
  assert(fields.sellers.includes("ESTATE OF ANNA I. SILVA"), `sellers should include type-1 (grantor) party`);
  assert(fields.sellers.includes("MARTA TERESA MOTTA"), `sellers should include all type-1 parties`);
  assert(!fields.buyers.includes("ESTATE OF ANNA I. SILVA"), `buyers must NOT include type-1 (grantor) party`);
  assert(!fields.sellers.includes("ISLAM, MOHAMMAD S"), `sellers must NOT include type-2 (grantee) party`);
});

test("MORTGAGE: type-1 = grantor/borrower, type-2 = grantee/lender", () => {
  // In a mortgage, grantor (type 1) = borrower, grantee (type 2) = lender
  // Our buildDeedHistory maps type 2 → buyerName, type 1 → sellerName
  // For mortgages: buyerName field = lender (type 2), sellerName field = borrower (type 1)
  const deeds = buildDeedHistory(MORTGAGE_METADATA);
  assert(deeds[0].buyerName === "SIGNATURE BANK", `buyerName (grantee/lender) should be type-2, got "${deeds[0].buyerName}"`);
  assert(deeds[0].sellerName === "MANHATTAN HOLDINGS LLC", `sellerName (grantor/borrower) should be type-1, got "${deeds[0].sellerName}"`);
});

test("No document_id produces empty deedHistory", () => {
  const deeds = buildDeedHistory({ _parties: [{ name: "TEST", type: "1" }] });
  assert(deeds.length === 0, "no deed record without document_id");
});

test("Empty parties produce null buyer/seller", () => {
  const deeds = buildDeedHistory({ document_id: "test", _parties: [] });
  assert(deeds[0].buyerName === null, "null buyerName with no parties");
  assert(deeds[0].sellerName === null, "null sellerName with no parties");
});

test("Amount parsed correctly", () => {
  const deeds = buildDeedHistory(DEED_METADATA);
  assert(deeds[0].amount === 680000, `amount should be 680000, got ${deeds[0].amount}`);
});

// ── Summary ──────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
