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

/** Sanitizes an SVG document; throws if it is not a parseable SVG. */
export function sanitizeSvg(svg: string): string {
  const input = svg.replace(/^﻿/, "").replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, "");
  const tree = parser.parse(input) as Node[];
  const cleaned = cleanNodes(tree);
  const roots = cleaned.filter((n) => Object.keys(n).some((k) => k !== ":@" && k !== "#text"));
  if (roots.length !== 1 || Object.keys(roots[0])[0].toLowerCase().replace(/^.*:/, "") !== "svg") {
    throw new Error("Not an SVG document");
  }
  return builder.build(roots) as string;
}
