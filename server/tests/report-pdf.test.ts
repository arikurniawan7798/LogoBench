import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { buildReportPdf, FOOTER_TEXT, pdfSafe, planBlocks } from "../src/report/pdf.js";
import type { AdvancedReview } from "../src/review/schema.js";

// A realistic review (the shape and length of a real Gemini answer).
const sample = (over: Partial<AdvancedReview> = {}): AdvancedReview => ({
  scores: {
    readability: { score: 9, reason: "The brand name 'Ledgerly' is rendered in a clean, bold sans-serif typeface that is effortless to read against the light background." },
    originality: { score: 5, reason: "Combining stacked documents, a stylized letter 'L', and an upward growth arrow relies on very common financial and accounting visual metaphors." },
    balance: { score: 8, reason: "The proportions between the icon mark and the wordmark are well-proportioned, creating a balanced horizontal lockup." },
    scalability: { score: 7, reason: "The overall logo shape holds up well, but the small horizontal detail lines on the top document layer may blur or disappear at very small sizes." },
    misinterpretation: { score: 9, reason: "The icon clearly suggests document management and positive financial growth, leaving little room for unintended interpretations." },
  },
  personality: {
    presence: "Professional and prominent",
    attitude: "Optimistic and constructive",
    formality: "Corporate semi-formal",
    style: "Clean modern flat vector",
    tone: "Trustworthy and modern",
    positioning: "Financial management software and accounting services",
  },
  summary:
    "The logo effectively communicates accounting and financial growth by incorporating layered document sheets, an 'L' shape motif, and an upward trend arrow alongside a clean sans-serif wordmark. While the visual concept uses familiar industry tropes, the execution is polished, legible, and visually balanced.",
  fixes: [
    { issue: "Thin text lines on the top document icon will lose definition at favicon scale.", fix: "Create a simplified icon variation that removes the thin internal horizontal lines for small display sizes.", priority: "medium" },
    { issue: "Complex color layering and gradients in the mark make solid single-color reproduction difficult.", fix: "Develop a dedicated monochrome vector version with clear negative space cutouts between the overlapping document shapes.", priority: "high" },
    { issue: "Color split between 'Ledger' (dark blue) and 'ly' (teal) slightly fragments the wordmark.", fix: "Test rendering the full wordmark in dark blue while keeping the teal accents restricted to the icon mark.", priority: "low" },
  ],
  checklist: [
    { item: "Brand name 'Ledgerly' is fully legible", done: true },
    { item: "Upward growth arrow integrated into icon mark", done: true },
    { item: "High contrast between text and background", done: true },
    { item: "Simplified favicon version without micro-lines included", done: false },
    { item: "Monochrome single-color execution validated", done: false },
    { item: "Dark mode background version provided", done: false },
  ],
  presentationIdeas: [
    "Display the logo on a dark-mode mobile app dashboard screen for financial tracking.",
    "Show side-by-side scale tests ranging from a 16x16 web favicon to a large corporate banner.",
    "Present monochrome applications such as embossed paper documents or single-color invoice headers.",
    "Show subtle micro-animations of the upward growth arrow animating into place for app loading screens.",
  ],
  ...over,
});

const project = (name = "Ledgerly") => ({ id: "x", name, createdAt: "2026-11-24T00:00:00.000Z", versions: [] });
const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;
// Uncompressed build: decode the hex-encoded text of each page's content stream (only streams with text objects,
// so binary image data can never be mistaken for text).
const pageTexts = (pdf: Buffer): string[] =>
  [...pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)]
    .filter((m) => /\bBT\b[\s\S]*\bET\b/.test(m[1]))
    .map((m) => [...m[1].matchAll(/<([0-9a-fA-F]+)>/g)].map((h) => Buffer.from(h[1], "hex").toString("latin1")).join(""))
    .filter((t) => t.length > 0);
const body = (t: string) => t.replace(FOOTER_TEXT, "").replace(/Page \d+ of \d+/, "").trim();
const HEADINGS = ["Summary", "Scores", "Personality", "Recommended fixes", "Checklist", "Presentation ideas"];

let logo: { bytes: Buffer; mime: string };
beforeAll(async () => {
  // An off-white JPEG "photo" of a logo, like most real uploads.
  const bytes = await sharp({ create: { width: 600, height: 240, channels: 3, background: { r: 243, g: 245, b: 244 } } })
    .composite([{ input: await sharp({ create: { width: 300, height: 90, channels: 3, background: { r: 15, g: 107, b: 94 } } }).png().toBuffer(), top: 75, left: 150 }])
    .jpeg()
    .toBuffer();
  logo = { bytes, mime: "image/jpeg" };
});

describe("pdfSafe", () => {
  it("keeps Latin-1 and typographic punctuation, replaces other glyphs with ?, drops control characters", () => {
    expect(pdfSafe("Café – “ok” … •")).toBe("Café – “ok” … •");
    expect(pdfSafe("日本 😀")).toBe("?? ?");
    expect(pdfSafe("a\tb\r\nc\u0007d\u0085e")).toBe("a b\ncde");
  });
});

describe("planBlocks (keep-together pagination)", () => {
  const area = { top: 50, bottom: 750 };
  it("places blocks one after another on the same page while they fit", () => {
    expect(planBlocks([{ h: 100 }, { h: 200 }], area)).toEqual([
      { page: 0, y: 50 },
      { page: 0, y: 150 },
    ]);
  });

  it("moves a block that does not fit to the next page instead of splitting it", () => {
    expect(planBlocks([{ h: 600 }, { h: 200 }], area)).toEqual([
      { page: 0, y: 50 },
      { page: 1, y: 50 },
    ]);
  });

  it("never leaves a keep-with-next heading as the last thing on a page", () => {
    const plan = planBlocks([{ h: 640 }, { h: 30, keepWithNext: true }, { h: 80 }], area);
    expect(plan[1]).toEqual({ page: 1, y: 50 });
    expect(plan[2]).toEqual({ page: 1, y: 80 });
  });

  it("honours the gap after each block and does not push an oversize block off a fresh page", () => {
    expect(planBlocks([{ h: 100, gap: 20 }, { h: 900 }, { h: 10 }], area)).toEqual([
      { page: 0, y: 50 },
      { page: 1, y: 50 },
      { page: 2, y: 50 },
    ]);
  });
});

describe("report layout", () => {
  it("fits the sample review on at most 2 pages with the project name, headings and a footer on every page", async () => {
    const pdf = await buildReportPdf(project(), sample(), logo, { createdAt: "2026-11-24T03:31:14.692Z", compress: false });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pages(pdf)).toBeLessThanOrEqual(2);
    const texts = pageTexts(pdf);
    expect(texts).toHaveLength(pages(pdf));
    const all = texts.join("");
    expect(all).toContain("Ledgerly");
    expect(all).toContain("Logo review report");
    expect(all).toContain("2026-11-24");
    for (const h of HEADINGS) expect(all).toContain(h);
    texts.forEach((t, i) => {
      expect(t).toContain(FOOTER_TEXT);
      expect(t).toContain(`Page ${i + 1} of ${texts.length}`);
    });
  });

  it("the summary sits on page 1 under the header, not on a page of its own", async () => {
    const texts = pageTexts(await buildReportPdf(project(), sample(), logo, { compress: false }));
    expect(texts[0]).toContain("Summary");
    expect(texts[0]).toContain("The logo effectively communicates");
  });

  it("shows priorities as labels (no bracket tags), high first, and checklist without [x] text", async () => {
    const all = pageTexts(await buildReportPdf(project(), sample(), logo, { compress: false })).join("");
    expect(all).not.toMatch(/\[(HIGH|MEDIUM|LOW|x| )\]/);
    expect(all.indexOf("HIGH")).toBeGreaterThan(-1);
    expect(all.indexOf("HIGH")).toBeLessThan(all.indexOf("MEDIUM"));
    expect(all.indexOf("MEDIUM")).toBeLessThan(all.indexOf("LOW"));
    expect(all.indexOf("Complex color layering")).toBeLessThan(all.indexOf("Thin text lines"));
  });

  it("grows past 2 pages for 12 long fixes, with no heading stranded at the bottom of a page", async () => {
    const title = "The secondary mark ".repeat(10).trim(); // ~40 words
    const fixes = Array.from({ length: 12 }, (_, i) => ({
      issue: `${title} ${i + 1}`,
      fix: "Redraw the counters with more open apertures and test at 16, 24 and 32 pixels before delivery. ".repeat(3).trim(),
      priority: (["low", "medium", "high"] as const)[i % 3],
    }));
    const checklist = Array.from({ length: 15 }, (_, i) => ({ item: `Checklist item number ${i + 1} that is fairly descriptive`, done: i % 2 === 0 }));
    const pdf = await buildReportPdf(project(), sample({ fixes, checklist }), logo, { compress: false });
    expect(pages(pdf)).toBeGreaterThan(2);
    const texts = pageTexts(pdf);
    expect(texts).toHaveLength(pages(pdf));
    for (const t of texts) {
      expect(t).toContain(FOOTER_TEXT);
      const b = body(t);
      expect(b.length).toBeGreaterThan(20);
      for (const h of HEADINGS) expect(b.endsWith(h)).toBe(false);
    }
  });

  it("handles a missing-glyph name and empty sections", async () => {
    const pdf = await buildReportPdf(project("日本語 ロゴ"), sample({ fixes: [], checklist: [], presentationIdeas: [] }), logo, { compress: false });
    expect(pages(pdf)).toBeLessThanOrEqual(2);
    const texts = pageTexts(pdf);
    expect(texts[0]).toContain("??? ??");
    expect(texts.join("")).toContain("No fixes suggested.");
  });
});
