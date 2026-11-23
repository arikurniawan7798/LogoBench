import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "../src/svg.js";

describe("sanitizeSvg", () => {
  it("removes <script>, on* attributes, javascript: hrefs and external href/xlink:href", () => {
    const out = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">
        <script>alert(1)</script>
        <a href="javascript:alert(1)"><rect onclick="x()" width="5" height="5"/></a>
        <image href="http://evil.com/a.png"/>
        <image xlink:href="https://evil.com/a.png"/>
        <use href="//evil.com/a.svg#x"/>
        <foreignObject><div>hi</div></foreignObject>
      </svg>`,
    );
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/onload|onclick/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/evil\.com/);
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).toContain("<rect");
  });
  it("keeps fills, paths, viewBox and internal hrefs", () => {
    const out = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><path d="M0 0L10 10" fill="#ff0000"/><circle r="2" fill="url(#g)"/><use href="#g"/></svg>`,
    );
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain('d="M0 0L10 10"');
    expect(out).toContain('fill="#ff0000"');
    expect(out).toContain('href="#g"');
  });

  it("strips aliased-prefix href/src (xlink namespace under another prefix) unless same-document", () => {
    const out = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:q="http://www.w3.org/1999/xlink"><image q:href="http://evil.com/a.png"/><a q:href="data:text/html,x"><rect width="1" height="1"/></a><use q:href="#ok"/></svg>`,
    );
    expect(out).not.toMatch(/evil\.com/);
    expect(out).not.toMatch(/data:/);
    expect(out).toContain('q:href="#ok"');
  });
  it("neutralises CSS-escaped @import and url() in <style> and style attributes", () => {
    const out = sanitizeSvg(
      String.raw`<svg xmlns="http://www.w3.org/2000/svg"><style>@\69mport "http://evil/x.css"; .a{fill:u\72l(http://evil/b)}</style><rect style="fill:u\72l(http://evil/a)" width="1" height="1"/><rect style="fill:url(#g)" width="1" height="1"/></svg>`,
    );
    expect(out).not.toMatch(/evil/);
    expect(out).not.toMatch(/import/i);
    expect(out).toContain("url(#g)");
  });
  it("drops handler, listener and feImage elements", () => {
    const out = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><handler>x</handler><listener/><filter><feImage href="#a"/></filter><rect width="1" height="1"/></svg>`,
    );
    expect(out).not.toMatch(/handler|listener|feImage/i);
  });
});
