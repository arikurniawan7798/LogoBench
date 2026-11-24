import PDFDocument from "pdfkit";
import sharp from "sharp";
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

export { FOOTER_TEXT };

// ---------------------------------------------------------------------------------------------------------------
// Pagination: pure keep-together rules, shared by the renderer and the unit tests.

export interface Area {
  top: number;
  bottom: number;
}
export interface PlanBlock {
  h: number;
  /** Space after the block (dropped when the next block starts a page). */
  gap?: number;
  /** Keep this block on the same page as the next one (headings). */
  keepWithNext?: boolean;
}

/**
 * Where a block of height `h` goes when the cursor is at `y`: on this page if it (plus `keep`, the height that must
 * follow it on the same page) fits, otherwise at the top of a new page. A block already at the top of a page is
 * never moved, so an oversize block cannot produce endless blank pages.
 */
export function nextSlot(y: number, h: number, keep: number, area: Area): { newPage: boolean; y: number } {
  if (y > area.top + 0.5 && y + h + keep > area.bottom) return { newPage: true, y: area.top };
  return { newPage: false, y };
}

/** Plans a list of unsplittable blocks onto pages (0-based page index and top y of each block). */
export function planBlocks(blocks: PlanBlock[], area: Area): { page: number; y: number }[] {
  const out: { page: number; y: number }[] = [];
  let page = 0;
  let y = area.top;
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    const keep = b.keepWithNext && next ? (b.gap ?? 0) + next.h : 0;
    const slot = nextSlot(y, b.h, keep, area);
    if (slot.newPage) page++;
    y = slot.y;
    out.push({ page, y });
    y += b.h + (b.gap ?? 0);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Look: the web app's palette (warm paper, ink, oxidized-copper teal). Body ink on white is ~17:1, captions ~7:1.

const INK = "#1a1a1a";
const BODY = "#2e3136";
const MUTED = "#565a62";
const ACCENT = "#0f6b5e";
const ACCENT_SOFT = "#dcebe6";
const PAPER = "#f5f3ee";
const LINE = "#d6d1c6";
const CARD = "#faf9f6";
const CARD_LINE = "#e2ddd2";
const TRACK = "#e6e2d8";
const WHITE = "#ffffff";
// Score bands and priorities: white text on these is >= 4.5:1; the numeral or label is always shown as well.
const GOOD = "#1d7a43";
const FAIR = "#a36100";
const WEAK = "#9b2c1f";
const band = (score: number) => (score >= 8 ? GOOD : score >= 5 ? FAIR : WEAK);
const PRIORITY_COLOR = { high: WEAK, medium: FAIR, low: GOOD } as const;
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

const LABELS: Record<keyof AdvancedReview["scores"], string> = {
  readability: "Readability",
  originality: "Originality",
  balance: "Balance",
  scalability: "Scalability",
  misinterpretation: "Misinterpretation safety",
};
const PERSONALITY: (keyof AdvancedReview["personality"])[] = ["presence", "attitude", "formality", "style", "tone", "positioning"];

const R = "Helvetica";
const B = "Helvetica-Bold";
const I = "Helvetica-Oblique";
/** pdfkit puts the top of the line box at y; Helvetica's ascender is 718/1000 em. */
const ASC = 0.718;

type Doc = InstanceType<typeof PDFDocument>;
interface TextStyle {
  font: string;
  size: number;
  color: string;
  lineGap?: number;
  characterSpacing?: number;
}

/** Card background for the logo: the logo's own flat light backdrop (so a JPEG's off-white box disappears), else white. */
async function logoBackdrop(png: Buffer): Promise<string> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => {
    const o = (y * info.width + x) * 4;
    return [data[o], data[o + 1], data[o + 2], data[o + 3]];
  };
  const w = info.width - 1;
  const h = info.height - 1;
  const corners = [px(0, 0), px(w, 0), px(0, h), px(w, h)];
  if (corners.some((c) => c[3] < 250)) return WHITE;
  const avg = [0, 1, 2].map((k) => Math.round(corners.reduce((s, c) => s + c[k], 0) / 4));
  const flat = corners.every((c) => [0, 1, 2].every((k) => Math.abs(c[k] - avg[k]) <= 6));
  if (!flat || Math.min(...avg) < 225) return WHITE;
  return `#${avg.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export async function buildReportPdf(
  project: Project,
  review: AdvancedReview,
  logo: { mime: string; bytes: Buffer },
  opts: { createdAt?: string; compress?: boolean } = {},
): Promise<Buffer> {
  // pdfkit embeds only PNG/JPEG: normalize every logo (SVG, WebP, ...) to PNG.
  const png = await rasterizeToPng(logo.bytes, logo.mime, { maxSize: 800 });
  const meta = await sharp(png).metadata();
  const backdrop = await logoBackdrop(png);

  const M = { top: 48, bottom: 64, left: 48, right: 48 };
  const doc: Doc = new PDFDocument({
    size: "A4",
    margins: M,
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

  const W = doc.page.width;
  const H = doc.page.height;
  const left = M.left;
  const width = W - M.left - M.right;
  const area: Area = { top: M.top, bottom: H - M.bottom - 1 };
  const pageH = area.bottom - area.top;
  let y = area.top;

  const style = (s: TextStyle) => doc.font(s.font).fontSize(s.size).fillColor(s.color);
  const measure = (t: string, w: number, s: TextStyle) => {
    style(s);
    return doc.heightOfString(t, { width: w, lineGap: s.lineGap ?? 0, characterSpacing: s.characterSpacing });
  };
  const write = (t: string, x: number, top: number, w: number, s: TextStyle, extra: PDFKit.Mixins.TextOptions = {}) => {
    style(s).text(t, x, top, { width: w, lineGap: s.lineGap ?? 0, characterSpacing: s.characterSpacing, ...extra });
  };
  const lineH = (s: TextStyle) => measure("Ag", 1000, s);

  /** Reserve `h` (plus `keep` that must follow on the same page); returns the y to draw at. */
  const reserve = (h: number, keep = 0) => {
    const slot = nextSlot(y, h, keep, area);
    if (slot.newPage) doc.addPage();
    y = slot.y;
    return y;
  };
  /** An unsplittable block; one that could never fit a page is handed to `fallback` (which flows text instead). */
  const block = (h: number, draw: (top: number) => void, gap: number, fallback?: () => void) => {
    if (h > pageH && fallback) {
      fallback();
      y += gap;
      return;
    }
    draw(reserve(h));
    y += h + gap;
  };

  /** Text that may run across pages: kept whole when short, otherwise split on word boundaries to fill each page. */
  const flow = (text: string, x: number, w: number, s: TextStyle, gap = 0) => {
    let rest = text;
    const minLines = lineH(s) * 3;
    while (rest.length > 0) {
      const full = measure(rest, w, s);
      const avail = area.bottom - y;
      if (full <= avail) {
        write(rest, x, y, w, s);
        y += full;
        break;
      }
      if (y > area.top + 0.5 && (full <= pageH * 0.4 || avail < minLines)) {
        doc.addPage();
        y = area.top;
        continue;
      }
      const tokens = rest.split(/(?<=\s)/);
      let lo = 1;
      let hi = tokens.length - 1;
      let best = 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (measure(tokens.slice(0, mid).join("").trimEnd(), w, s) <= avail) {
          best = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      const head = tokens.slice(0, best).join("").trimEnd();
      write(head, x, y, w, s);
      rest = tokens.slice(best).join("").trimStart();
      doc.addPage();
      y = area.top;
    }
    y += gap;
  };

  // Type scale
  const H2: TextStyle = { font: B, size: 13, color: INK };
  const P: TextStyle = { font: R, size: 10.5, color: INK, lineGap: 3 };
  const SMALL: TextStyle = { font: R, size: 9.5, color: BODY, lineGap: 2 };
  const CAPTION: TextStyle = { font: R, size: 8.5, color: MUTED };
  const LABEL: TextStyle = { font: B, size: 7.5, color: MUTED, characterSpacing: 0.8 };
  const EMPTY: TextStyle = { font: I, size: 10, color: MUTED };

  const SECTION_GAP = 14;
  const HEAD_H = 16;
  const HEAD_GAP = 8;
  /** Section heading with an accent tab and an optional right-hand caption; kept with `keep` of what follows. */
  const heading = (title: string, keep: number, caption?: string) => {
    if (y > area.top + 0.5) y += SECTION_GAP; // dropped again if the heading moves to a new page
    const top = reserve(HEAD_H, HEAD_GAP + keep);
    doc.rect(left, top + 1, 3, 12).fill(ACCENT);
    write(title, left + 10, top, width - 10, H2, { lineBreak: false });
    if (caption) write(caption, left, top + 3.5, width, CAPTION, { align: "right", lineBreak: false });
    y = top + HEAD_H + HEAD_GAP;
  };
  const emptyNote = (t: string) => {
    const h = lineH(EMPTY);
    write(t, left, reserve(h), width, EMPTY);
    y += h;
  };

  // ------------------------------------------------------------------------------------------------- Header band
  const created = opts.createdAt && !Number.isNaN(Date.parse(opts.createdAt)) ? new Date(opts.createdAt).toISOString().slice(0, 10) : null;
  const name = pdfSafe(project.name);
  const pad = 12;
  const iw = meta.width ?? 1;
  const ih = meta.height ?? 1;
  const scale = Math.min(200 / iw, 80 / ih);
  const lw = Math.max(1, iw * scale);
  const lh = Math.max(1, ih * scale);
  const cardW = Math.max(lw + pad * 2, 120);
  const cardH = lh + pad * 2;
  const textW = width - cardW - 28;
  const NAME: TextStyle = { font: B, size: 26, color: INK, lineGap: 1 };
  const SUB: TextStyle = { font: B, size: 11.5, color: ACCENT, characterSpacing: 0.2 };
  const nameH = measure(name, textW, NAME);
  const textH = nameH + 6 + lineH(SUB) + (created ? 6 + lineH(CAPTION) : 0);
  const bandTop = 30;
  const inner = Math.max(textH, cardH);
  const bandH = bandTop + inner + 24;

  doc.rect(0, 0, W, bandH).fill(PAPER);
  doc.rect(0, 0, W, 5).fill(ACCENT);
  doc.moveTo(0, bandH).lineTo(W, bandH).lineWidth(0.75).strokeColor(LINE).stroke();
  let ty = bandTop + (inner - textH) / 2;
  write(name, left, ty, textW, NAME);
  ty += nameH + 6;
  write("Logo review report", left, ty, textW, SUB, { lineBreak: false });
  ty += lineH(SUB) + 6;
  // Date comes from the stored review so the PDF is deterministic and accurate for old reviews.
  if (created) write(`Review generated ${created}`, left, ty, textW, CAPTION, { lineBreak: false });
  const cardX = left + width - cardW;
  const cardY = bandTop + (inner - cardH) / 2;
  doc.roundedRect(cardX, cardY, cardW, cardH, 10).lineWidth(0.75).fillAndStroke(backdrop, LINE);
  doc.image(png, cardX + (cardW - lw) / 2, cardY + pad, { width: lw, height: lh });
  y = bandH + 6;

  // ------------------------------------------------------------------------------------------------- Summary
  const summary = pdfSafe(review.summary).trim();
  heading("Summary", Math.min(measure(summary || " ", width, P), lineH(P) * 3));
  if (summary) flow(summary, left, width, P);
  else emptyNote("No summary.");

  // ------------------------------------------------------------------------------------------------- Scores
  const COL_GAP = 12;
  const colW = (width - COL_GAP) / 2;
  const CP = 11; // card padding
  const NUM: TextStyle = { font: B, size: 20, color: INK };
  const OF: TextStyle = { font: R, size: 9, color: MUTED };
  const DIM: TextStyle = { font: B, size: 10.5, color: INK };
  const scoreHead = 38; // numeral row + bar
  const scoreCard = (key: keyof typeof LABELS) => {
    const d = review.scores[key];
    const reason = pdfSafe(d.reason).trim();
    const tw = colW - CP * 2;
    const h = CP + scoreHead + measure(reason, tw, SMALL) + CP;
    const draw = (x: number, top: number, rowH: number, withReason = true) => {
      doc.roundedRect(x, top, colW, rowH, 8).lineWidth(0.75).fillAndStroke(CARD, CARD_LINE);
      const base = top + CP + 16;
      const right = x + colW - CP;
      style(OF);
      const ofW = doc.widthOfString("/10");
      write("/10", right - ofW, base - ASC * OF.size, ofW + 2, OF, { lineBreak: false });
      style(NUM);
      const nW = doc.widthOfString(String(d.score));
      write(String(d.score), right - ofW - 2 - nW, base - ASC * NUM.size, nW + 2, NUM, { lineBreak: false });
      write(LABELS[key], x + CP, base - ASC * DIM.size, tw - nW - ofW - 10, DIM, { lineBreak: false, ellipsis: true });
      const barY = base + 8;
      doc.roundedRect(x + CP, barY, tw, 7, 3.5).fill(TRACK);
      doc.roundedRect(x + CP, barY, Math.max(7, (tw * d.score) / 10), 7, 3.5).fill(band(d.score));
      if (withReason) write(reason, x + CP, top + CP + scoreHead, tw, SMALL);
    };
    // Fallback for an absurdly long reason: the score card head, then the reason flows across pages.
    const fallback = () => {
      const top = reserve(CP + scoreHead, lineH(SMALL) * 3);
      draw(left, top, CP + scoreHead, false);
      y = top + CP + scoreHead + 4;
      flow(reason, left + CP, width - CP * 2, SMALL);
    };
    return { h, draw, fallback };
  };
  const legend = () => {
    const tw = colW - CP * 2;
    const note = "Higher is better on every scale. For misinterpretation safety, a higher score means less risk of the logo being misread.";
    const rows: [string, string][] = [
      [GOOD, "8-10  Strong"],
      [FAIR, "5-7  Mixed"],
      [WEAK, "1-4  Needs work"],
    ];
    const h = CP + 14 + rows.length * 14 + 4 + measure(note, tw, CAPTION) + CP;
    const draw = (x: number, top: number, rowH: number) => {
      doc.roundedRect(x, top, colW, rowH, 8).lineWidth(0.75).dash(2.5, { space: 2 }).fillAndStroke(WHITE, LINE).undash();
      write("Reading the scores", x + CP, top + CP, tw, { font: B, size: 10, color: INK }, { lineBreak: false });
      rows.forEach(([c, t], i) => {
        const ry = top + CP + 16 + i * 14;
        doc.roundedRect(x + CP, ry + 2, 18, 6, 3).fill(c);
        write(t, x + CP + 26, ry, tw - 26, { font: R, size: 9, color: BODY }, { lineBreak: false });
      });
      write(note, x + CP, top + CP + 16 + rows.length * 14 + 4, tw, CAPTION);
    };
    return { h, draw };
  };
  const cards = (Object.keys(LABELS) as (keyof typeof LABELS)[]).map(scoreCard);
  const cells: { h: number; draw: (x: number, top: number, rowH: number) => void; fallback?: () => void }[] = [...cards, legend()];
  const scoreRows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 2) scoreRows.push(cells.slice(i, i + 2));
  const ROW_GAP = 7;
  heading("Scores", Math.max(...scoreRows[0].map((c) => c.h)), "out of 10");
  for (const row of scoreRows) {
    const rowH = Math.max(...row.map((c) => c.h));
    block(
      rowH,
      (top) => row.forEach((c, i) => c.draw(left + i * (colW + COL_GAP), top, rowH)),
      ROW_GAP,
      () => row.forEach((c) => (c.fallback ? c.fallback() : block(c.h, (top) => c.draw(left, top, c.h), ROW_GAP))),
    );
  }
  y -= ROW_GAP;

  // ------------------------------------------------------------------------------------------------- Personality
  const CHIP_GAP = 10;
  const chipW = (width - CHIP_GAP * 2) / 3;
  const CHIP_P = 9;
  const VALUE: TextStyle = { font: B, size: 9.5, color: INK, lineGap: 1.5 };
  const chips = PERSONALITY.map((k) => {
    const value = pdfSafe(review.personality[k]).trim() || "-";
    const h = CHIP_P + 9 + 4 + measure(value, chipW - CHIP_P * 2, VALUE) + CHIP_P;
    return { k, value, h };
  });
  const chipRows = [chips.slice(0, 3), chips.slice(3, 6)];
  const chipRowHs = chipRows.map((row) => Math.max(...row.map((c) => c.h)));
  const grid = chipRowHs[0] + 8 + chipRowHs[1];
  // Keep the whole 3x2 grid together unless a value is so long that the grid is a big chunk of a page.
  heading("Personality", grid <= pageH / 3 ? grid : chipRowHs[0]);
  for (const row of chipRows) {
    const rowH = Math.max(...row.map((c) => c.h));
    block(
      rowH,
      (top) =>
        row.forEach((c, i) => {
          const x = left + i * (chipW + CHIP_GAP);
          doc.roundedRect(x, top, chipW, rowH, 7).fill(PAPER);
          write(c.k.toUpperCase(), x + CHIP_P, top + CHIP_P, chipW - CHIP_P * 2, LABEL, { lineBreak: false });
          write(c.value, x + CHIP_P, top + CHIP_P + 13, chipW - CHIP_P * 2, VALUE);
        }),
      8,
      () =>
        row.forEach((c) => {
          write(c.k.toUpperCase(), left, reserve(12, lineH(VALUE) * 3), width, LABEL, { lineBreak: false });
          y += 12;
          flow(c.value, left, width, VALUE, 8);
        }),
    );
  }
  y -= 8;

  // ------------------------------------------------------------------------------------------------- Fixes
  // The model returns fixes in no particular order (the prompt asks for none), so list them by priority, high first;
  // the sort is stable, so the model's order is kept within each priority.
  const fixes = review.fixes
    .map((f, i) => ({ ...f, i }))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.i - b.i);
  const FP = 12;
  const NUM_COL = 30;
  const fw = width - FP * 2 - NUM_COL;
  const TITLE: TextStyle = { font: B, size: 10.5, color: INK, lineGap: 2 };
  const DETAIL: TextStyle = { font: R, size: 10, color: BODY, lineGap: 2.5 };
  const PILL: TextStyle = { font: B, size: 7.5, color: WHITE, characterSpacing: 0.7 };
  const pillW = (t: string) => {
    style(PILL);
    return doc.widthOfString(t, { characterSpacing: PILL.characterSpacing }) + 14;
  };
  const fixCards = fixes.map((f, n) => {
    const label = f.priority.toUpperCase();
    const pw = pillW(label);
    const title = pdfSafe(f.issue).trim();
    const detail = pdfSafe(f.fix).trim();
    const titleW = fw - pw - 10;
    const titleH = Math.max(measure(title, titleW, TITLE), 16);
    const detailH = measure(detail, fw, DETAIL);
    const h = FP + titleH + 5 + detailH + FP;
    const head = (top: number, boxH: number, boxed: boolean) => {
      if (boxed) doc.roundedRect(left, top, width, boxH, 8).lineWidth(0.75).fillAndStroke(CARD, CARD_LINE);
      const cx = left + FP + 10;
      const cy = top + FP + 8;
      doc.circle(cx, cy, 10).fill(ACCENT_SOFT);
      const num = String(n + 1);
      style({ font: B, size: 10, color: ACCENT });
      const nw = doc.widthOfString(num);
      write(num, cx - nw / 2, cy - 5.5, nw + 2, { font: B, size: 10, color: ACCENT }, { lineBreak: false });
      const px = left + width - FP - pw;
      doc.roundedRect(px, top + FP, pw, 15, 7.5).fill(PRIORITY_COLOR[f.priority]);
      write(label, px, top + FP + 4.2, pw, PILL, { align: "center", lineBreak: false });
      write(title, left + FP + NUM_COL, top + FP + 1, titleW, TITLE);
    };
    const draw = (top: number) => {
      head(top, h, true);
      write(detail, left + FP + NUM_COL, top + FP + titleH + 5, fw, DETAIL);
    };
    const fallback = () => {
      const hh = FP + titleH + 5;
      const top = reserve(hh, lineH(DETAIL) * 3);
      head(top, hh, false);
      y = top + hh;
      flow(detail, left + FP + NUM_COL, fw, DETAIL);
    };
    return { h, draw, fallback };
  });
  heading("Recommended fixes", fixCards[0]?.h ?? lineH(EMPTY), fixCards.length ? "highest priority first" : undefined);
  if (fixCards.length === 0) emptyNote("No fixes suggested.");
  fixCards.forEach((c) => block(c.h, c.draw, 8, c.fallback));
  if (fixCards.length) y -= 8;

  // ------------------------------------------------------------------------------------------------- Checklist
  const ITEM: TextStyle = { font: R, size: 10, color: INK, lineGap: 1.5 };
  const BOX = 10;
  const checkbox = (x: number, top: number, checked: boolean) => {
    if (checked) {
      doc.roundedRect(x, top, BOX, BOX, 2).fill(ACCENT);
      doc
        .moveTo(x + 2.4, top + 5.2)
        .lineTo(x + 4.3, top + 7.3)
        .lineTo(x + 7.8, top + 2.9)
        .lineWidth(1.5)
        .lineCap("round")
        .lineJoin("round")
        .strokeColor(WHITE)
        .stroke();
    } else {
      doc.roundedRect(x + 0.5, top + 0.5, BOX - 1, BOX - 1, 2).lineWidth(1).fillAndStroke(WHITE, MUTED);
    }
  };
  const list = review.checklist.map((c) => ({ text: pdfSafe(c.item).trim(), done: c.done }));
  const twoCols = list.length >= 4;
  const itemW = (twoCols ? colW : width) - 17;
  const half = twoCols ? Math.ceil(list.length / 2) : list.length;
  const checkRows = Array.from({ length: half }, (_, r) => (twoCols ? [list[r], list[r + half]] : [list[r]]).filter(Boolean));
  const checkRowH = (row: typeof list) => Math.max(...row.map((c) => measure(c.text, itemW, ITEM)));
  const doneCount = list.filter((c) => c.done).length;
  heading("Checklist", checkRows[0] ? checkRowH(checkRows[0]) : lineH(EMPTY), list.length ? `${doneCount} of ${list.length} done` : undefined);
  if (list.length === 0) emptyNote("No checklist items.");
  for (const row of checkRows) {
    const rowH = checkRowH(row);
    block(
      rowH,
      (top) =>
        row.forEach((c, i) => {
          const x = left + i * (colW + COL_GAP);
          checkbox(x, top + 1, c.done);
          write(c.text, x + 17, top, itemW, ITEM);
        }),
      7,
      () =>
        row.forEach((c) => {
          checkbox(left, reserve(lineH(ITEM) * 3) + 1, c.done);
          flow(c.text, left + 17, width - 17, ITEM, 7);
        }),
    );
  }
  if (list.length) y -= 7;

  // ------------------------------------------------------------------------------------------------- Presentation ideas
  const ideas = review.presentationIdeas.map((t) => pdfSafe(t).trim());
  const IDEA: TextStyle = { font: R, size: 10, color: INK, lineGap: 2.5 };
  const BUL = 14;
  heading("Presentation ideas", ideas[0] ? measure(ideas[0], width - BUL, IDEA) : lineH(EMPTY));
  if (ideas.length === 0) emptyNote("No presentation ideas.");
  for (const idea of ideas) {
    const h = measure(idea, width - BUL, IDEA);
    const dot = (top: number) => doc.circle(left + 3.5, top + 5.5, 2.2).fill(ACCENT);
    block(
      h,
      (top) => {
        dot(top);
        write(idea, left + BUL, top, width - BUL, IDEA);
      },
      6,
      () => {
        dot(reserve(lineH(IDEA) * 3));
        flow(idea, left + BUL, width - BUL, IDEA, 6);
      },
    );
  }

  // ------------------------------------------------------------------------------------------------- Footer
  // On every page; the bottom margin is zeroed so writing there never spawns a page.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const m = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = H - 40;
    doc.moveTo(left, fy - 8).lineTo(left + width, fy - 8).lineWidth(0.5).strokeColor(LINE).stroke();
    write(FOOTER_TEXT, left, fy, width - 90, CAPTION, { lineBreak: false });
    write(`Page ${i + 1} of ${range.count}`, left + width - 90, fy, 90, CAPTION, { align: "right", lineBreak: false });
    doc.page.margins.bottom = m;
  }

  doc.end();
  return done;
}
