/**
 * CRS Credit Provider Implementation
 *
 * Wraps the existing crs.ts API client behind the CreditProvider interface.
 * Delegates all calls to the existing functions — no logic duplication.
 */

import type { CreditProvider } from "./credit-provider";
import { pullSingleBureau, pullTriBureau } from "./crs";

export const crsProvider: CreditProvider = {
  name: "crs",
  pullSingleBureau,
  pullTriBureau,
};
