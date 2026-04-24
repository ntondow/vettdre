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
  // ACRIS party types: type 1 = grantee (buyer), type 2 = grantor (seller)
  const buyers = parties.filter((p: any) => String(p.type) === "1").map((p: any) => p.name).filter(Boolean);
  const sellers = parties.filter((p: any) => String(p.type) === "2").map((p: any) => p.name).filter(Boolean);

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
  // ACRIS party types: type 1 = grantee (buyer), type 2 = grantor (seller)
  return {
    buyers: (metadata._parties || []).filter((p: any) => String(p.type) === "1").map((p: any) => p.name),
    sellers: (metadata._parties || []).filter((p: any) => String(p.type) === "2").map((p: any) => p.name),
  };
}

// ── Test fixtures ────────────────────────────────────────────

const DEED_METADATA = {
  document_id: "2015081800233001",
  doc_type: "DEED",
  doc_amount: "680000",
  good_through_date: "2015-08-31",
  _parties: [
    { name: "ESTATE OF ANNA I. SILVA", type: "1" },        // grantee = buyer
    { name: "MARTA TERESA MOTTA", type: "1" },             // grantee = buyer
    { name: "ISLAM, MOHAMMAD S", type: "2" },               // grantor = seller
    { name: "ISLAM, RUFISA", type: "2" },                   // grantor = seller
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

test("DEED: type-1 parties map to buyerName (grantee/buyer)", () => {
  const deeds = buildDeedHistory(DEED_METADATA);
  assert(deeds.length === 1, "produces one deed record");
  assert(deeds[0].buyerName === "ESTATE OF ANNA I. SILVA", `buyerName should be type-1 party, got "${deeds[0].buyerName}"`);
});

test("DEED: type-2 parties map to sellerName (grantor/seller)", () => {
  const deeds = buildDeedHistory(DEED_METADATA);
  assert(deeds[0].sellerName === "ISLAM, MOHAMMAD S", `sellerName should be type-2 party, got "${deeds[0].sellerName}"`);
});

test("DEED: extractRawFields maps type-1 to buyers, type-2 to sellers", () => {
  const fields = extractSaleRawFields(DEED_METADATA);
  assert(fields.buyers.includes("ESTATE OF ANNA I. SILVA"), `buyers should include type-1 party`);
  assert(fields.buyers.includes("MARTA TERESA MOTTA"), `buyers should include all type-1 parties`);
  assert(fields.sellers.includes("ISLAM, MOHAMMAD S"), `sellers should include type-2 party`);
  assert(fields.sellers.includes("ISLAM, RUFISA"), `sellers should include all type-2 parties`);
  assert(!fields.buyers.includes("ISLAM, MOHAMMAD S"), `buyers must NOT include type-2 party`);
  assert(!fields.sellers.includes("ESTATE OF ANNA I. SILVA"), `sellers must NOT include type-1 party`);
});

test("MORTGAGE: type-1 = borrower (mortgagor), type-2 = lender (mortgagee)", () => {
  const deeds = buildDeedHistory(MORTGAGE_METADATA);
  assert(deeds[0].buyerName === "MANHATTAN HOLDINGS LLC", `buyerName (borrower) should be type-1, got "${deeds[0].buyerName}"`);
  assert(deeds[0].sellerName === "SIGNATURE BANK", `sellerName (lender) should be type-2, got "${deeds[0].sellerName}"`);
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
