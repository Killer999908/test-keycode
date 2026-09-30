/**
 * Seed demo marketplace listings — idempotent.
 *
 * Usage:
 *   npm run seed:marketplace            # insert missing demo listings, never overwrite existing slugs
 *   npm run seed:marketplace -- --force # overwrite demo listings with the fresh demo content
 *
 * Connects with the same URI logic as server.js:
 *   MONGODB_URI env var, falling back to mongodb://127.0.0.1:27017/keycode
 */
import "dotenv/config";
import mongoose from "mongoose";

const FORCE = process.argv.includes("--force");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/keycode";

const marketplaceListingSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "" },
    category: { type: String, default: "general" },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD" },
    image: { type: String, default: "" },
    tags: [{ type: String }],
    stock: { type: Number, default: -1 }, // -1 = unlimited
    status: { type: String, enum: ["draft", "active", "archived"], default: "active" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

const DEMO_LISTINGS = [
  {
    slug: "starter-web-template",
    title: "Nebula — Starter Web Template",
    description:
      "Production-ready Next.js + Tailwind starter with auth, billing hooks, SEO metadata, and a dark glass design system. Deploy to Vercel in one click.",
    category: "web",
    price: 0,
    tags: ["nextjs", "tailwind", "template", "free"],
    stock: -1
  },
  {
    slug: "agency-landing-kit",
    title: "Agency Landing Kit",
    description:
      "Six conversion-tuned landing page layouts with motion presets, A/B-ready hero variants, and copy slots mapped for AI generation.",
    category: "web",
    price: 29,
    tags: ["landing", "marketing", "motion"],
    stock: -1
  },
  {
    slug: "game-asset-pack-neon",
    title: "Neon Arcade — 2D Game Asset Pack",
    description:
      "240 sprites, 12 tilesets, chiptune SFX set, and parallax backgrounds. Ships as PNG + Aseprite sources with CC0 runtime license.",
    category: "game",
    price: 19,
    tags: ["sprites", "tilemap", "sfx", "cc0"],
    stock: -1
  },
  {
    slug: "cad-mech-parts-library",
    title: "Mechanical Parts Library Vol. 1",
    description:
      "80 parametric CAD models — brackets, gears, housings, fasteners — as STEP + STL with fusion sources. Print-tested geometries included.",
    category: "cad",
    price: 39,
    tags: ["step", "stl", "parametric", "3d-print"],
    stock: -1
  },
  {
    slug: "pcb-reference-designs",
    title: "PCB Reference Designs (ESP32 + RP2040)",
    description:
      "Five fabrication-ready 2/4-layer reference boards with Gerbers, BOM, and pick-and-place files. DRC-clean against JLCPCM and PCBWay rules.",
    category: "pcb",
    price: 49,
    tags: ["esp32", "rp2040", "gerber", "hardware"],
    stock: 100
  },
  {
    slug: "ai-agent-starter-pack",
    title: "AI Agent Starter Pack",
    description:
      "Drop-in ReAct agent scaffold: tool dispatch, memory adapters, token budgeting, and an SSE streaming UI — the same stack powering this OS.",
    category: "ai",
    price: 59,
    tags: ["agents", "react-loop", "tools", "sse"],
    stock: -1
  },
  {
    slug: "design-token-system",
    title: "Design Token System — Dark Studio",
    description:
      "Complete Figma + CSS variable token set: color ramps, spacing, radii, motion curves, and glass surface recipes. MIT licensed.",
    category: "design",
    price: 0,
    tags: ["figma", "tokens", "design-system", "free"],
    stock: -1
  },
  {
    slug: "deploy-pipeline-blueprints",
    title: "Deploy Pipeline Blueprints",
    description:
      "Copy-paste CI/CD blueprints for Railway, Fly.io, and Cloudflare — health checks, rollbacks, and preview environments wired in.",
    category: "devops",
    price: 15,
    tags: ["ci-cd", "railway", "docker"],
    stock: -1
  }
];

async function main() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const MarketplaceListing =
    mongoose.models.MarketplaceListing || mongoose.model("MarketplaceListing", marketplaceListingSchema);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const doc of DEMO_LISTINGS) {
    const existing = await MarketplaceListing.findOne({ slug: doc.slug }).lean();
    if (!existing) {
      await MarketplaceListing.create({ ...doc, status: "active" });
      created++;
    } else if (FORCE) {
      await MarketplaceListing.updateOne(
        { slug: doc.slug },
        { $set: { ...doc, status: "active", updatedAt: new Date() } }
      );
      updated++;
    } else {
      skipped++;
    }
  }

  const total = await MarketplaceListing.countDocuments({ status: "active" });
  console.log(
    `marketplace seed done — created: ${created}, updated: ${updated}, skipped: ${skipped}, active listings: ${total}`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("seed failed:", err.message);
  process.exit(1);
});
