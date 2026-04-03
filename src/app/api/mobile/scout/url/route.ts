// ── POST /api/mobile/scout/url ─────────────────────────────────
// Extract building info from a pasted listing URL.
// Uses Firecrawl (primary) or Brave Search (fallback) to scrape the page,
// then Claude to extract the address, and finally fetches the building profile.
//
// Body: { url: "https://streeteasy.com/..." }

import { NextRequest, NextResponse } from "next/server";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";
import { lookupPlutoByAddress } from "@/lib/pluto-lookup";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

// ── Try to extract address directly from URL patterns ────────
// Many listing sites encode the address in the URL slug itself.
function extractAddressFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    // StreetEasy: /building/123-main-street-brooklyn or /rental/123-main-street
    if (hostname.includes("streeteasy.com")) {
      const match = path.match(/\/(building|rental|sale)\/(\d+[\w-]+)/);
      if (match) {
        // Convert slug: "123-main-street-brooklyn" → "123 main street brooklyn"
        const slug = match[2].replace(/-/g, " ");
        // Remove trailing neighborhood/borough words that aren't part of address
        return slug.replace(/\s+(new york|ny|nyc)$/i, "").trim();
      }
    }

    // Zillow: /homedetails/123-Main-St-Brooklyn-NY-11201/12345_zpid/
    if (hostname.includes("zillow.com")) {
      const match = path.match(/\/homedetails\/([\w-]+?)\/\d+_zpid/);
      if (match) {
        return match[1].replace(/-/g, " ").replace(/\s+(ny|new york)\s+\d{5}$/i, "").trim();
      }
    }

    // Apartments.com: /123-main-st-brooklyn-ny/
    if (hostname.includes("apartments.com")) {
      const match = path.match(/^\/([\w-]+-ny)\/?/);
      if (match) {
        return match[1].replace(/-/g, " ").replace(/\s+ny$/i, "").trim();
      }
    }

    // Realtor.com: /realestateandhomes-detail/123-Main-St_Brooklyn_NY_11201
    if (hostname.includes("realtor.com")) {
      const match = path.match(/\/realestateandhomes-detail\/([\w-]+)/);
      if (match) {
        return match[1].replace(/[_-]/g, " ").replace(/\s+(ny|new york)\s+\d{5}$/i, "").trim();
      }
    }
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body — expected JSON with { url }" },
        { status: 400 }
      );
    }

    const { url: listingUrl } = body;

    if (!listingUrl || typeof listingUrl !== "string") {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    // Validate URL protocol
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(listingUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return NextResponse.json(
          { error: "URL must use http or https protocol" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // ── Quick path: try extracting address from URL slug ────
    const urlAddress = extractAddressFromUrl(listingUrl);
    if (urlAddress) {
      console.log("[mobile/scout/url] URL slug address:", urlAddress);
      const plutoResult = await lookupPlutoByAddress(urlAddress);
      if (plutoResult) {
        console.log("[mobile/scout/url] Fast path — resolved from URL slug");
        const { fetchBuildingProfile } = await import(
          "@/app/(dashboard)/market-intel/building-profile-actions"
        );
        const profile = await fetchBuildingProfile(
          plutoResult.borocode,
          plutoResult.block,
          plutoResult.lot
        );
        return NextResponse.json(
          serialize({
            ...profile,
            _extraction: {
              sourceUrl: listingUrl,
              extractedAddress: urlAddress,
              confidence: "high",
              method: "url_slug",
            },
          })
        );
      }
    }

    // ── Step 1: Scrape the URL ──────────────────────────────
    let pageText = "";

    // Try Firecrawl first
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (firecrawlKey) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${firecrawlKey}`,
          },
          body: JSON.stringify({
            url: listingUrl,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (scrapeRes.ok) {
          const scrapeData = await scrapeRes.json();
          pageText = scrapeData.data?.markdown || "";
        }
      } catch (err: any) {
        console.warn("[mobile/scout/url] Firecrawl failed:", err?.message);
      }
    }

    // Fallback: Brave Search for the URL
    if (!pageText) {
      const braveKey = process.env.BRAVE_SEARCH_API_KEY;
      if (braveKey) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const searchRes = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(listingUrl)}`,
            {
              headers: { "X-Subscription-Token": braveKey },
              signal: controller.signal,
            }
          );
          clearTimeout(timeout);
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const results = searchData.web?.results || [];
            if (results.length > 0) {
              // Combine multiple results for more context
              pageText = results
                .slice(0, 3)
                .map((r: any) => `Title: ${r.title}\nDescription: ${r.description}`)
                .join("\n\n");
            }
          }
        } catch (err: any) {
          console.warn("[mobile/scout/url] Brave search failed:", err?.message);
        }
      }
    }

    if (!pageText) {
      return NextResponse.json(
        { error: "Could not fetch content from this URL. Try copying the address and using address search instead." },
        { status: 422 }
      );
    }

    // ── Step 2: Extract address with Claude ─────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    let extractResponse;
    try {
      extractResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Extract the NYC building address from this listing page content. Return ONLY a JSON object:
- "address": street address (number + street name, no city/state/zip)
- "borough": NYC borough if identifiable
- "bedrooms": number of bedrooms if shown
- "rent": monthly rent if shown
- "confidence": "high", "medium", or "low"

If no address found, return {"address": null, "confidence": "none"}.

Source URL: ${listingUrl}

Page content:
${pageText.slice(0, 3000)}`,
          },
        ],
      });
    } catch (aiErr: any) {
      console.error("[mobile/scout/url] Claude extract error:", aiErr?.message);
      return NextResponse.json(
        { error: "AI extraction temporarily unavailable. Try copying the address and using address search." },
        { status: 503 }
      );
    }

    const responseText =
      extractResponse.content[0].type === "text"
        ? extractResponse.content[0].text
        : "";

    let extracted: {
      address: string | null;
      borough?: string;
      bedrooms?: number;
      rent?: number;
      confidence: string;
    };
    try {
      const cleaned = responseText.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      console.warn("[mobile/scout/url] Could not parse Claude response:", responseText);
      return NextResponse.json(
        { error: "Could not extract address from this URL. Try copying the address and using address search." },
        { status: 422 }
      );
    }

    if (!extracted.address || extracted.confidence === "none") {
      return NextResponse.json(
        { error: "No building address found at this URL. Try copying the address and using address search instead." },
        { status: 422 }
      );
    }

    // ── Step 3: Resolve to BBL ──────────────────────────────
    const plutoResult = await lookupPlutoByAddress(extracted.address);

    if (!plutoResult) {
      return NextResponse.json(
        {
          error: `Found "${extracted.address}" but no NYC building match. Try entering the address manually.`,
          extractedAddress: extracted.address,
        },
        { status: 404 }
      );
    }

    // ── Step 4: Fetch full building profile ─────────────────
    const { fetchBuildingProfile } = await import(
      "@/app/(dashboard)/market-intel/building-profile-actions"
    );

    const profile = await fetchBuildingProfile(
      plutoResult.borocode,
      plutoResult.block,
      plutoResult.lot
    );

    return NextResponse.json(
      serialize({
        ...profile,
        _extraction: {
          sourceUrl: listingUrl,
          extractedAddress: extracted.address,
          extractedBorough: extracted.borough,
          extractedBedrooms: extracted.bedrooms,
          extractedRent: extracted.rent,
          confidence: extracted.confidence,
          method: "scrape_ai",
        },
      })
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[mobile/scout/url] POST error:", errMsg, error);
    return NextResponse.json(
      { error: `Failed to process URL: ${errMsg.slice(0, 100)}` },
      { status: 500 }
    );
  }
}
