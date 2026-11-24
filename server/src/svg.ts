import { XMLParser, XMLBuilder } from "fast-xml-parser";

const ATTR = "@_";
const DROP_TAGS = new Set(["script", "foreignobject", "iframe", "object", "embed", "audio", "video", "canvas", "set", "animate", "animatetransform", "animatemotion", "handler", "listener", "feimage"]);
const HREF_LOCAL_NAMES = new Set(["href", "src"]);

type Node = Record<string, any>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: ATTR,
  processEntities: false,
  htmlEntities: false,
  allowBooleanAttributes: false,
  trimValues: false,
  cdataPropName: "#cdata",
  commentPropName: "#comment",
});
const builder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: ATTR,
  processEntities: false,
  suppressEmptyNode: true,
  format: false,
});

function decodeCssEscapes(css: string): string {
  return css.replace(/\\([0-9a-fA-F]{1,6})[ \t\r\n\f]?|\\([^\r\n\f])/g, (_m, hex?: string, ch?: string) => {
    if (ch !== undefined) return ch;
    const cp = parseInt(hex!, 16);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
  });
}

function cleanCss(raw: string): string {
  const css = decodeCssEscapes(raw);
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, "none")
    .replace(/expression\s*\(/gi, "(")
    .replace(/javascript:/gi, "");
}

function cleanAttrs(attrs: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!attrs) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    const name = k.slice(ATTR.length).toLowerCase();
    const val = String(v);
    if (name.startsWith("on")) continue;
    // only same-document references are allowed
    // match on the LOCAL name so aliased xlink prefixes (q:href) are covered too
    if (HREF_LOCAL_NAMES.has(name.replace(/^.*:/, "")) && !/^\s*#/.test(val)) continue;
    if (/^javascript:/i.test(val.replace(/[\u0000- ]/g, ""))) continue;
    out[k] = name === "style" ? cleanCss(val) : val;
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cleanNodes(nodes: Node[], inStyle = false): Node[] {
  const out: Node[] = [];
  for (const node of nodes) {
    const key = Object.keys(node).find((k) => k !== ":@")!;
    if (key === "#comment") continue;
    if (key === "#text") {
      out.push(inStyle ? { "#text": cleanCss(node[key]) } : node);
      continue;
    }
    if (key === "#cdata") {
      const raw = (node[key] as Node[]).map((t) => t["#text"] ?? "").join("");
      out.push({ "#text": esc(inStyle ? cleanCss(raw) : raw) });
      continue;
    }
    if (key.startsWith("?") || key.startsWith("!")) continue;
    const local = key.toLowerCase().replace(/^.*:/, "");
    if (DROP_TAGS.has(local)) continue;
    const next: Node = { [key]: cleanNodes(node[key], local === "style") };
    const attrs = cleanAttrs(node[":@"]);
    if (attrs && Object.keys(attrs).length) next[":@"] = attrs;
    out.push(next);
  }
  return out;
}

/** Thrown for a DOCTYPE we refuse to expand (external/parameter/recursive/oversized entities). Message is client-safe. */
export class SvgDtdError extends Error {
  constructor(detail: string) {
    super(`This SVG's DOCTYPE uses ${detail}, which LogoBench does not expand. Re-export with File > Export > SVG (or "Export As" SVG) and upload again.`);
    this.name = "SvgDtdError";
  }
}

const MAX_ENTITIES = 64;
const MAX_ENTITY_VALUE = 2048;
const MAX_EXPANSION_BYTES = 1024 * 1024;

type Prolog = { rootStart: number; doctype?: { start: number; end: number; subset: string } };

/** Index just past a quoted string / comment / PI starting at i, or -1 if unterminated. */
function skipUntil(s: string, i: number, close: string): number {
  const j = s.indexOf(close, i);
  return j < 0 ? -1 : j + close.length;
}

/** End of the DOCTYPE starting at `start` ("<!DOCTYPE"), honouring quotes and an internal subset (with comments/PIs). */
function scanDoctype(s: string, start: number): { end: number; subset: string } | null {
  let i = start + "<!DOCTYPE".length;
  let subsetStart = -1;
  let subsetEnd = -1;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") {
      i = skipUntil(s, i + 1, c);
    } else if (subsetStart >= 0 && subsetEnd < 0 && s.startsWith("<!--", i)) {
      i = skipUntil(s, i + 4, "-->");
    } else if (subsetStart >= 0 && subsetEnd < 0 && s.startsWith("<?", i)) {
      i = skipUntil(s, i + 2, "?>");
    } else {
      if (c === "[" && subsetStart < 0) subsetStart = i + 1;
      else if (c === "]" && subsetStart >= 0 && subsetEnd < 0) subsetEnd = i;
      else if (c === ">" && (subsetStart < 0 || subsetEnd >= 0)) {
        return { end: i + 1, subset: subsetStart >= 0 ? s.slice(subsetStart, subsetEnd) : "" };
      }
      i++;
    }
    if (i < 0) return null;
  }
  return null;
}

/**
 * Walks the XML prolog (BOM, whitespace, XML declaration/PIs, comments, one DOCTYPE with any internal subset)
 * and returns where the root element starts. Returns null if the prolog is malformed or unterminated.
 */
export function scanProlog(s: string): Prolog | null {
  const out: Prolog = { rootStart: 0 };
  let i = s.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s.startsWith("<?", i)) i = skipUntil(s, i + 2, "?>");
    else if (s.startsWith("<!--", i)) i = skipUntil(s, i + 4, "-->");
    else if (!out.doctype && s.slice(i, i + 9).toUpperCase() === "<!DOCTYPE") {
      const dt = scanDoctype(s, i);
      if (!dt) return null;
      out.doctype = { start: i, end: dt.end, subset: dt.subset };
      i = dt.end;
    } else break;
    if (i < 0) return null;
  }
  out.rootStart = i;
  return out;
}

/**
 * Collects the internal-subset general entities that are plain strings (no '&', '<' or '%' in the value, so no
 * recursion and no markup). Anything else that declares an entity (SYSTEM/PUBLIC external entities, parameter
 * entities, values referencing other entities) refuses the whole document: we never resolve or fetch it.
 */
function simpleEntities(subset: string): Map<string, string> {
  const body = subset.replace(/<!--[\s\S]*?-->/g, "");
  const declared = (body.match(/<!ENTITY\s/g) ?? []).length;
  if (/%[A-Za-z_][\w.:-]*;/.test(body.replace(/"[^"]*"|'[^']*'/g, ""))) throw new SvgDtdError("parameter entity references");
  const map = new Map<string, string>();
  const re = /<!ENTITY\s+([A-Za-z_][\w.:-]*)\s+(?:"([^"]*)"|'([^']*)')\s*>/g;
  for (const m of body.matchAll(re)) {
    const value = m[2] ?? m[3] ?? "";
    if (/[&<%]/.test(value)) throw new SvgDtdError("entities that reference other entities or markup");
    if (value.length > MAX_ENTITY_VALUE) throw new SvgDtdError("an oversized entity");
    map.set(m[1], value);
  }
  if (map.size !== declared) throw new SvgDtdError("external or parameter entities");
  if (map.size > MAX_ENTITIES) throw new SvgDtdError("too many entities");
  return map;
}

/** Removes the DOCTYPE and expands its simple string entities (Illustrator's `xmlns="&ns_svg;"`) in the rest. */
function stripDoctype(svg: string): string {
  const prolog = scanProlog(svg);
  if (!prolog?.doctype) return svg;
  const { start, end, subset } = prolog.doctype;
  const entities = simpleEntities(subset);
  let rest = svg.slice(end);
  if (entities.size) {
    let grown = 0;
    rest = rest.replace(/&([A-Za-z_][\w.:-]*);/g, (ref, name: string) => {
      const value = entities.get(name);
      if (value === undefined) return ref;
      grown += value.length;
      if (grown > MAX_EXPANSION_BYTES) throw new SvgDtdError("entity expansions over 1 MB");
      return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/>/g, "&gt;");
    });
  }
  return svg.slice(0, start) + rest;
}

/** Sanitizes an SVG document; throws if it is not a parseable SVG (SvgDtdError for a DOCTYPE we refuse). */
export function sanitizeSvg(svg: string): string {
  const input = stripDoctype(svg.replace(/^﻿/, ""));
  const tree = parser.parse(input) as Node[];
  const cleaned = cleanNodes(tree);
  const roots = cleaned.filter((n) => Object.keys(n).some((k) => k !== ":@" && k !== "#text"));
  if (roots.length !== 1 || Object.keys(roots[0])[0].toLowerCase().replace(/^.*:/, "") !== "svg") {
    throw new Error("Not an SVG document");
  }
  return builder.build(roots) as string;
}
