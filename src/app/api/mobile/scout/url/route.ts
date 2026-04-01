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

export async function POST(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
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

    // ── Step 1: Scrape the URL ──────────────────────────────
    let pageText = "";

    // Try Firecrawl first
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (firecrawlKey) {
      try {
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
        });

        if (scrapeRes.ok) {
          const scrapeData = await scrapeRes.json();
          pageText = scrapeData.data?.markdown || "";
        }
      } catch (err) {
        console.warn("[mobile/scout/url] Firecrawl failed:", err);
      }
    }

    // Fallback: Brave Search for the URL
    if (!pageText) {
      const braveKey = process.env.BRAVE_SEARCH_API_KEY;
      if (braveKey) {
        try {
          const searchRes = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=site:${encodeURIComponent(parsedUrl.hostname)}+${encodeURIComponent(listingUrl)}`,
            { headers: { "X-Subscription-Token": braveKey } }
          );
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const results = searchData.web?.results || [];
            if (results.length > 0) {
              pageText = `Title: ${results[0].title}\nDescription: ${results[0].description}\nURL: ${results[0].url}`;
            }
          }
        } catch (err) {
          console.warn("[mobile/scout/url] Brave search failed:", err);
        }
      }
    }

    if (!pageText) {
      return NextResponse.json(
        { error: "Could not fetch content from URL" },
        { status: 422 }
      );
    }

    // ── Step 2: Extract address with Claude ─────────────────
    const anthropic = new Anthropic();

    const extractResponse = await anthropic.messages.create({
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

Page content:
${pageText.slice(0, 3000)}`,
        },
      ],
    });

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
      extracted = JSON.parse(responseText.trim());
    } catch {
      return NextResponse.json(
        { error: "Could not extract address from URL content" },
        { status: 422 }
      );
    }

    if (!extracted.address || extracted.confidence === "none") {
      return NextResponse.json(
        { error: "No building address found at this URL" },
        { status: 422 }
      );
    }

    // ── Step 3: Resolve to BBL ──────────────────────────────
    const plutoResult = await lookupPlutoByAddress(extracted.address);

    if (!plutoResult) {
      return NextResponse.json(
        {
          error: `No NYC building found for "${extracted.address}"`,
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
        },
      })
    );
  } catch (error: unknown) {
    console.error("[mobile/scout/url] POST error:", error);
    return NextResponse.json(
      { error: "Failed to process URL" },
      { status: 500 }
    );
  }
}
