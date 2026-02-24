"use server";

// ============================================================
// Fannie Mae Loan Lookup Server Actions
// Thin wrappers — types imported directly from fannie-mae.ts
// ============================================================

import { lookupLoan, lookupLoanByAddress } from "./fannie-mae";

export async function getFannieLoanByAddress(
  street: string,
  city: string,
  state: string,
  zip: string,
) {
  return lookupLoanByAddress(street, city, state, zip);
}

export async function getFannieLoan(address: string) {
  return lookupLoan(address);
}
