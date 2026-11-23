import PDFDocument from "pdfkit";
import { rasterizeToPng } from "../image/raster.js";
import type { Project } from "../projects.js";
import type { AdvancedReview } from "../review/schema.js";
import { FOOTER_TEXT } from "../framing.js";

// Built-in Helvetica only (WinAnsi): nothing is bundled. Glyphs outside Latin-1 plus a few typographic
// punctuation marks are replaced with "?" so non-Latin model text can never crash or garble the build.
const EXTRA_OK = new Set([0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x2026]);
export function pdfSafe(s: string): string {
  let out = "";
  for (const ch of String(s).replace(/\r\n?/g, "\n")) {
    const c = ch.codePointAt(0)!;
    if (c === 10 || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA_OK.has(c)) out += ch;
    else if (c === 9) out += " ";
    else if (c >= 0x20 && !(c >= 0x7f && c < 0xa0)) out += "?";
  }
  return out;
}

const INK = "#1a1a1a";
const MUTED = "#666666";
const ACCENT = "#2b4acb";
const LABELS: Record<string, string> = {
  readability: "Readability",
  originality: "Originality",
  balance: "Balance",
  scalability: "Scalability",
  misinterpretation: "Misinterpretation safety",
};
const PRIORITY_COLOR = { high: "#b3261e", medium: "#a15c00", low: "#2e7d32" } as const;

export { FOOTER_TEXT };

export async function buildReportPdf(
  project: Project,
  review: AdvancedReview,
  logo: { mime: string; bytes: Buffer },
  opts: { createdAt?: string; compress?: boolean } = {},
): Promise<Buffer> {
  // pdfkit embeds only PNG/JPEG: normalize every logo (SVG, WebP, ...) to PNG.
  const png = await rasterizeToPng(logo.bytes, logo.mime, { maxSize: 800 });

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 64, left: 56, right: 56 },
    bufferPages: true,
    compress: opts.compress ?? true,
    info: { Title: pdfSafe(`Logo review - ${project.name}`) },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };
  const heading = (t: string) => {
    ensure(60);
    doc.moveDown(0.8).font("Helvetica-Bold").fontSize(15).fillColor(ACCENT).text(t, left, doc.y, { width });
    doc.moveDown(0.3).font("Helvetica").fontSize(10.5).fillColor(INK);
  };
  const para = (t: string, opts: { color?: string; indent?: number } = {}) => {
    const indent = opts.indent ?? 0;
    doc.font("Helvetica").fontSize(10.5).fillColor(opts.color ?? INK).text(pdfSafe(t), left + indent, doc.y, { width: width - indent });
  };

  // Cover / summary
  doc.font("Helvetica-Bold").fontSize(24).fillColor(INK).text("Logo Review Report", left, doc.y, { width });
  doc.moveDown(0.2).font("Helvetica").fontSize(13).fillColor(MUTED).text(pdfSafe(project.name), left, doc.y, { width });
  // Date comes from the stored review so the PDF is deterministic and accurate for old reviews.
  const created = opts.createdAt && !Number.isNaN(Date.parse(opts.createdAt)) ? new Date(opts.createdAt).toISOString().slice(0, 10) : null;
  if (created) doc.moveDown(0.2).fontSize(9).text(`Review generated ${created}`, left, doc.y, { width });
  doc.moveDown(1);
  const imgBox = 220;
  const imgTop = doc.y;
  doc.image(png, left + (width - imgBox) / 2, imgTop, { fit: [imgBox, imgBox], align: "center", valign: "center" });
  doc.y = imgTop + imgBox + 16;

  heading("Scores");
  for (const [key, label] of Object.entries(LABELS)) {
    const d = review.scores[key as keyof typeof review.scores];
    ensure(40);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(label, left, y, { width: 170, lineBreak: false });
    doc.text(`${d.score} / 10`, left + 175, y, { width: 50, lineBreak: false });
    doc.rect(left + 235, y + 2, 200, 8).fill("#e3e6ef");
    doc.rect(left + 235, y + 2, 20 * d.score, 8).fill(ACCENT);
    doc.y = y + 16;
    para(d.reason, { color: MUTED });
    doc.moveDown(0.4);
  }

  heading("Personality");
  for (const [k, v] of Object.entries(review.personality)) para(`${k[0].toUpperCase()}${k.slice(1)}: ${v}`);

  heading("Summary");
  para(review.summary);

  // Fixes
  doc.addPage();
  heading("Recommended fixes");
  if (review.fixes.length === 0) para("No fixes suggested.", { color: MUTED });
  review.fixes.forEach((f, i) => {
    ensure(70);
    doc.moveDown(0.4).font("Helvetica-Bold").fontSize(11).fillColor(PRIORITY_COLOR[f.priority]).text(`${i + 1}. [${f.priority.toUpperCase()}] `, left, doc.y, { continued: true, width });
    doc.fillColor(INK).text(pdfSafe(f.issue), { width });
    para(f.fix, { indent: 14 });
  });

  // Checklist
  heading("Checklist");
  if (review.checklist.length === 0) para("No checklist items.", { color: MUTED });
  for (const c of review.checklist) {
    ensure(24);
    para(`${c.done ? "[x]" : "[ ]"}  ${c.item}`);
    doc.moveDown(0.2);
  }

  // Presentation ideas
  heading("Presentation ideas");
  if (review.presentationIdeas.length === 0) para("No presentation ideas.", { color: MUTED });
  for (const idea of review.presentationIdeas) {
    ensure(24);
    para(`•  ${idea}`);
    doc.moveDown(0.2);
  }

  // Footer on every page; bottom margin is zeroed so writing there never spawns a page.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const m = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
      `${FOOTER_TEXT}   Page ${i + 1} of ${range.count}`,
      left,
      doc.page.height - 40,
      { width, align: "center", lineBreak: false },
    );
    doc.page.margins.bottom = m;
  }

  doc.end();
  return done;
}
