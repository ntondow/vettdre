// ── POST /api/mobile/scout/screenshot ──────────────────────────
// Process a screenshot/photo of a building to extract the address,
// then resolve it to a building profile.
//
// Body: { image: "base64_encoded_image" }

import { NextRequest, NextResponse } from "next/server";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";
import { lookupPlutoByAddress } from "@/lib/pluto-lookup";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body — expected JSON with { image: base64 }" },
        { status: 400 }
      );
    }

    const { image } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "image (base64) is required" },
        { status: 400 }
      );
    }

    // Cap image size to ~10MB (base64 adds ~33% overhead)
    const MAX_IMAGE_SIZE = 13_400_000;
    if (image.length > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: "Image too large (max 10MB)" },
        { status: 413 }
      );
    }

    // ── Step 1: Use Claude Vision to extract address ────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[mobile/scout/screenshot] ANTHROPIC_API_KEY not set");
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    let visionResponse;
    try {
      // Strip data URI prefix if present
      const imageData = image.replace(/^data:image\/\w+;base64,/, "");

      // Detect media type from prefix or default to jpeg
      let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
      if (image.startsWith("data:image/png")) mediaType = "image/png";
      else if (image.startsWith("data:image/webp")) mediaType = "image/webp";
      else if (image.startsWith("data:image/gif")) mediaType = "image/gif";

      visionResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageData,
                },
              },
              {
                type: "text",
                text: `You are a NYC real estate expert. Look at this image and extract the building address.

Return ONLY a JSON object with these fields:
- "address": the street address (number + street name, no city/state)
- "borough": the NYC borough if identifiable (Manhattan, Brooklyn, Bronx, Queens, Staten Island)
- "confidence": "high", "medium", or "low"

If you can see a street sign, building number, or any identifying text, use that.
If this is a screenshot from a listing site (StreetEasy, Zillow, Apartments.com, etc.), extract the address shown.
If you cannot determine an address, return {"address": null, "confidence": "none"}.

Respond with ONLY the JSON object, no other text.`,
              },
            ],
          },
        ],
      });
    } catch (aiErr: any) {
      console.error("[mobile/scout/screenshot] Claude Vision error:", aiErr?.message || aiErr);
      // Return a more helpful error
      if (aiErr?.status === 400) {
        return NextResponse.json(
          { error: "Could not process this image. Try a clearer photo or use address search instead." },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: "AI image analysis temporarily unavailable. Try address search instead." },
        { status: 503 }
      );
    }

    // Parse Claude's response
    const responseText =
      visionResponse.content[0].type === "text"
        ? visionResponse.content[0].text
        : "";

    let extracted: { address: string | null; borough?: string; confidence: string };
    try {
      // Handle Claude sometimes wrapping JSON in markdown code blocks
      const cleaned = responseText.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      console.warn("[mobile/scout/screenshot] Could not parse Claude response:", responseText);
      return NextResponse.json(
        { error: "Could not extract address from image. Try a clearer screenshot or use address search." },
        { status: 422 }
      );
    }

    if (!extracted.address || extracted.confidence === "none") {
      return NextResponse.json(
        {
          error: "Could not identify a building address in this image. Try a clearer photo showing the address or building number.",
          confidence: extracted.confidence,
        },
        { status: 422 }
      );
    }

    // ── Step 2: Resolve address to BBL via PLUTO ────────────
    let plutoResult;
    try {
      plutoResult = await lookupPlutoByAddress(extracted.address);
    } catch (lookupErr: any) {
      console.error("[mobile/scout/screenshot] PLUTO lookup error:", lookupErr?.message);
      return NextResponse.json(
        { error: `Found address "${extracted.address}" but could not look it up. Try entering the address manually.` },
        { status: 422 }
      );
    }

    if (!plutoResult) {
      return NextResponse.json(
        {
          error: `No NYC building found for "${extracted.address}". The address may be outside NYC or incorrectly read.`,
          extractedAddress: extracted.address,
          confidence: extracted.confidence,
        },
        { status: 404 }
      );
    }

    // ── Step 3: Fetch full building profile ─────────────────
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
          extractedAddress: extracted.address,
          extractedBorough: extracted.borough,
          confidence: extracted.confidence,
        },
      })
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[mobile/scout/screenshot] POST error:", errMsg, error);
    return NextResponse.json(
      { error: `Failed to process screenshot: ${errMsg.slice(0, 100)}` },
      { status: 500 }
    );
  }
}
