/**
 * Plaid Integration for Tenant Screening
 *
 * Handles Link token generation, public token exchange, and transaction sync.
 * Uses Plaid sandbox in development, production keys in production.
 */

import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

// ── Plaid Client Singleton ────────────────────────────────────

let _plaidClient: PlaidApi | null = null;

function getPlaidClient(): PlaidApi {
  if (!_plaidClient) {
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    const env = (process.env.PLAID_ENV || "sandbox") as keyof typeof PlaidEnvironments;

    if (!clientId || !secret) {
      throw new Error("PLAID_CLIENT_ID and PLAID_SECRET are required");
    }

    const configuration = new Configuration({
      basePath: PlaidEnvironments[env] || PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    });

    _plaidClient = new PlaidApi(configuration);
  }
  return _plaidClient;
}

// ── Link Token ────────────────────────────────────────────────

export interface CreateLinkTokenParams {
  applicantId: string;     // Used as Plaid client_user_id
  applicantName: string;
  redirectUri?: string;
}

/**
 * Create a Plaid Link token for the applicant wizard.
 * Products: transactions + identity for bank verification.
 */
export async function createLinkToken(params: CreateLinkTokenParams): Promise<{ linkToken: string }> {
  const client = getPlaidClient();

  const response = await client.linkTokenCreate({
    user: {
      client_user_id: params.applicantId,
    },
    client_name: "VettdRE Screening",
    products: [Products.Transactions, Products.Identity],
    country_codes: [CountryCode.Us],
    language: "en",
    webhook: process.env.PLAID_WEBHOOK_URL || undefined,
    redirect_uri: params.redirectUri,
  });

  return { linkToken: response.data.link_token };
}

// ── Token Exchange ────────────────────────────────────────────

export interface ExchangeResult {
  accessToken: string;
  itemId: string;
  institutionName: string | null;
  institutionId: string | null;
  accounts: Array<{
    accountId: string;
    name: string;
    type: string;
    subtype: string | null;
    mask: string | null;
    balanceCurrent: number | null;
    balanceAvailable: number | null;
  }>;
}

/**
 * Exchange a public_token (from Plaid Link) for an access_token.
 * The access_token must be encrypted before storing in the database.
 */
export async function exchangePublicToken(publicToken: string): Promise<ExchangeResult> {
  const client = getPlaidClient();

  // Exchange token
  const exchangeResponse = await client.itemPublicTokenExchange({
    public_token: publicToken,
  });

  const accessToken = exchangeResponse.data.access_token;
  const itemId = exchangeResponse.data.item_id;

  // Get account info
  const accountsResponse = await client.accountsGet({
    access_token: accessToken,
  });

  const item = accountsResponse.data.item;
  const accounts = accountsResponse.data.accounts.map(a => ({
    accountId: a.account_id,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    mask: a.mask,
    balanceCurrent: a.balances.current,
    balanceAvailable: a.balances.available,
  }));

  // Get institution name
  let institutionName: string | null = null;
  let institutionId: string | null = item.institution_id ?? null;
  if (institutionId) {
    try {
      const instResponse = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      institutionName = instResponse.data.institution.name;
    } catch {
      // Non-critical — institution name is nice-to-have
    }
  }

  return {
    accessToken,
    itemId,
    institutionName,
    institutionId,
    accounts,
  };
}

// ── Transaction Sync ──────────────────────────────────────────

export interface PlaidTransaction {
  transactionId: string;
  date: string;             // YYYY-MM-DD
  amount: number;           // Positive = expense, negative = income
  name: string;
  merchantName: string | null;
  category: string[];
  primaryCategory: string | null;
}

export interface TransactionSyncResult {
  transactions: PlaidTransaction[];
  totalCount: number;
}

/**
 * Sync transactions from Plaid.
 * @param accessToken - Plaid access token (decrypted)
 * @param days - Number of days of history to fetch (90 for base, 365 for enhanced)
 */
export async function syncTransactions(
  accessToken: string,
  days: number = 90
): Promise<TransactionSyncResult> {
  const client = getPlaidClient();

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

  const allTransactions: PlaidTransaction[] = [];
  let hasMore = true;
  let offset = 0;
  const count = 500; // Max per page

  while (hasMore) {
    const response = await client.transactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        count,
        offset,
      },
    });

    const txns = response.data.transactions.map(t => ({
      transactionId: t.transaction_id,
      date: t.date,
      amount: t.amount,
      name: t.name,
      merchantName: t.merchant_name || null,
      category: t.category || [],
      primaryCategory: t.category?.[0] || null,
    }));

    allTransactions.push(...txns);
    offset += txns.length;
    hasMore = allTransactions.length < response.data.total_transactions;
  }

  return {
    transactions: allTransactions,
    totalCount: allTransactions.length,
  };
}

// ── Identity Verification ─────────────────────────────────────

export interface IdentityResult {
  names: string[];
  emails: string[];
  phones: string[];
  addresses: string[];
}

/**
 * Get identity data from Plaid to cross-verify applicant info.
 */
export async function getIdentity(accessToken: string): Promise<IdentityResult> {
  const client = getPlaidClient();

  const response = await client.identityGet({
    access_token: accessToken,
  });

  const owners = response.data.accounts.flatMap(a => a.owners || []);

  return {
    names: owners.flatMap(o => o.names || []),
    emails: owners.flatMap(o => (o.emails || []).map(e => e.data)),
    phones: owners.flatMap(o => (o.phone_numbers || []).map(p => p.data)),
    addresses: owners.flatMap(o =>
      (o.addresses || []).map(a => {
        const addr = a.data;
        return [addr.street, addr.city, addr.region, addr.postal_code].filter(Boolean).join(", ");
      })
    ),
  };
}

// ── Item Removal (Data Revocation) ────────────────────────────

/**
 * Remove a Plaid item, revoking access to the consumer's bank data.
 * Call this after financial analysis is complete to clean up access tokens.
 * @param accessToken - Plaid access token (decrypted)
 * @throws if the API call fails
 */
export async function removeItem(accessToken: string): Promise<void> {
  const client = getPlaidClient();

  await client.itemRemove({
    access_token: accessToken,
  });
}
