#!/usr/bin/env node
/**
 * generate-assets.js
 * ------------------
 * Generates all required PNG app assets from SVG sources using sharp.
 *
 * Required sizes:
 *   icon.png          — 1024x1024 (iOS App Store + Expo)
 *   adaptive-icon.png — 1024x1024 (Android foreground, has safe zone padding)
 *   splash.png        — 1284x2778 (iPhone 14 Pro Max resolution)
 *   notification-icon.png — 96x96 (Android notification, monochrome)
 *   favicon.png       — 48x48 (web fallback)
 *
 * Usage:
 *   cd mobile
 *   npm run generate-assets
 *
 * Prerequisites:
 *   npm install --save-dev sharp
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const ASSETS_DIR = path.resolve(__dirname, "../src/assets");

async function generateIcon() {
  const svgPath = path.join(ASSETS_DIR, "icon.svg");
  if (!fs.existsSync(svgPath)) {
    console.log("  ⚠ icon.svg not found, generating from scratch...");
    generateIconFallback();
    return;
  }

  const svg = fs.readFileSync(svgPath);

  // Main app icon — 1024x1024
  await sharp(svg).resize(1024, 1024).png().toFile(path.join(ASSETS_DIR, "icon.png"));
  console.log("  ✓ icon.png (1024x1024)");

  // Favicon
  await sharp(svg).resize(48, 48).png().toFile(path.join(ASSETS_DIR, "favicon.png"));
  console.log("  ✓ favicon.png (48x48)");
}

async function generateAdaptiveIcon() {
  // Android adaptive icons need the foreground image centered within a safe zone.
  // The safe zone is the inner 66% (rounded) of the canvas.
  // So we render the icon at ~676px centered on a 1024x1024 transparent canvas.
  const svgPath = path.join(ASSETS_DIR, "icon.svg");
  if (!fs.existsSync(svgPath)) return;

  const svg = fs.readFileSync(svgPath);

  // Render icon at smaller size
  const inner = await sharp(svg).resize(676, 676).png().toBuffer();

  // Composite onto transparent 1024x1024 canvas
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: inner, left: 174, top: 174 }])
    .png()
    .toFile(path.join(ASSETS_DIR, "adaptive-icon.png"));

  console.log("  ✓ adaptive-icon.png (1024x1024, safe zone padded)");
}

async function generateSplash() {
  // Splash: brand color background with centered icon
  const width = 1284;
  const height = 2778;
  const iconSize = 280;

  const svgPath = path.join(ASSETS_DIR, "icon.svg");
  if (!fs.existsSync(svgPath)) return;

  const svg = fs.readFileSync(svgPath);
  const icon = await sharp(svg).resize(iconSize, iconSize).png().toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 30, g: 64, b: 175, alpha: 255 }, // #1E40AF
    },
  })
    .composite([
      {
        input: icon,
        left: Math.round((width - iconSize) / 2),
        top: Math.round((height - iconSize) / 2) - 100, // Slightly above center
      },
    ])
    .png()
    .toFile(path.join(ASSETS_DIR, "splash.png"));

  console.log("  ✓ splash.png (1284x2778)");
}

async function generateNotificationIcon() {
  // Android notification icons must be monochrome (white on transparent).
  // We'll create a simple V shape.
  const size = 96;
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">
      <path d="M 24 20 L 48 76 L 72 20 L 62 20 L 48 58 L 34 20 Z" fill="white"/>
    </svg>
  `);

  await sharp(svg).resize(size, size).png().toFile(path.join(ASSETS_DIR, "notification-icon.png"));
  console.log("  ✓ notification-icon.png (96x96, monochrome)");
}

async function main() {
  console.log("\n🎨 Generating VettdRE mobile assets...\n");

  // Ensure assets directory exists
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  await generateIcon();
  await generateAdaptiveIcon();
  await generateSplash();
  await generateNotificationIcon();

  console.log("\n✅ All assets generated in src/assets/\n");
}

main().catch((err) => {
  console.error("Asset generation failed:", err);
  process.exit(1);
});
