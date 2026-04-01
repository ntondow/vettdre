// ── POST /api/mobile/scout/screenshot ──────────────────────────
// Process a screenshot/photo of a building to extract the address,
// then resolve it to a building profile.
//
// Body: { image: "base64_encoded_image" }
//
// Uses Claude Vision to extract the address from the image,
// then calls the same building profile fetcher as the web app.

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
    const anthropic = new Anthropic();

    const visionResponse = await anthropic.messages.create({
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
                media_type: "image/jpeg",
                data: image.replace(/^data:image\/\w+;base64,/, ""),
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
If this is a screenshot from a listing site, extract the address shown.
If you cannot determine an address, return {"address": null, "confidence": "none"}.

Respond with ONLY the JSON object, no other text.`,
            },
          ],
        },
      ],
    });

    // Parse Claude's response
    const responseText =
      visionResponse.content[0].type === "text"
        ? visionResponse.content[0].text
        : "";

    let extracted: { address: string | null; borough?: string; confidence: string };
    try {
      extracted = JSON.parse(responseText.trim());
    } catch {
      return NextResponse.json(
        { error: "Could not extract address from image" },
        { status: 422 }
      );
    }

    if (!extracted.address || extracted.confidence === "none") {
      return NextResponse.json(
        {
          error: "Could not identify a building address in this image",
          confidence: extracted.confidence,
        },
        { status: 422 }
      );
    }

    // ── Step 2: Resolve address to BBL via PLUTO ────────────
    const plutoResult = await lookupPlutoByAddress(extracted.address);

    if (!plutoResult) {
      return NextResponse.json(
        {
          error: `No NYC building found for "${extracted.address}"`,
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
    console.error("[mobile/scout/screenshot] POST error:", error);
    return NextResponse.json(
      { error: "Failed to process screenshot" },
      { status: 500 }
    );
  }
}
