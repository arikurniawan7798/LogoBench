import { logoUrl, urls, type Project } from "../api";
import { href } from "../router";

const SVG_REASON = "Needs an SVG upload. This logo was uploaded as a raster image (PNG, JPG or WebP), so vector and recolored files cannot be made from it.";

type Item = { id: string; label: string; detail: string; needsSvg: boolean };

const PACK: Item[] = [
  { id: "original", label: "Your logo as uploaded", detail: "SVG files are cleaned of scripts and external links.", needsSvg: false },
  {
    id: "recolored",
    label: "Recolored SVG versions",
    detail: "Brand color, white, black, on-dark and on-light versions.",
    needsSvg: true,
  },
  { id: "png", label: "Transparent PNGs", detail: "256, 512 and 1024 px of the main logo.", needsSvg: false },
  {
    id: "png-variants",
    label: "PNGs of the recolored versions",
    detail: "White, black, on-dark and on-light at 256, 512 and 1024 px.",
    needsSvg: true,
  },
  { id: "jpg", label: "JPG on a white background", detail: "1024 px, for places that do not take transparency.", needsSvg: false },
  { id: "favicons", label: "Favicons", detail: "favicon.ico, PNG sizes, apple-touch-icon and Android icons.", needsSvg: false },
];

export default function ExportTab({ project }: { project: Project }) {
  const latest = project.versions[project.versions.length - 1];
  const isSvg = latest?.mime === "image/svg+xml";

  return (
    <div className="export">
      <div className="section-head">
        <div>
          <h2>Export</h2>
          <p className="muted section-note">
            Production files built from the latest logo version and your saved colors. Everything is generated on this machine.
          </p>
        </div>
      </div>

      {!isSvg && (
        <div className="banner banner-info" role="note">
          <div className="banner-body">
            <p className="banner-title-info">Raster logo: some files are not available</p>
            <p>
              Recolored and vector files need an SVG source. Use "Upload new version" at the top of this page to add an SVG version
              of this logo and unlock them; LogoBench does not trace raster images.
            </p>
          </div>
        </div>
      )}

      <section className="card export-card" aria-labelledby="pack-title">
        <h3 id="pack-title">Logo pack</h3>
        <ul className="pack-list">
          {PACK.map((item) => {
            const available = !item.needsSvg || isSvg;
            const labelId = `pack-${item.id}`;
            return (
              <li key={item.id} className={available ? "pack-item" : "pack-item is-off"} aria-labelledby={labelId}>
                <span className={available ? "pill pill-ok" : "pill pill-off"}>{available ? "Included" : "Not included"}</span>
                <span>
                  <span id={labelId} className="pack-label">
                    {item.label}
                  </span>
                  <span className="muted small pack-detail">{available ? item.detail : SVG_REASON}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p>
          <a className="btn btn-primary" href={urls.exportZip(project.id)} download>
            Download logo pack (.zip)
          </a>
        </p>
        <p className="muted small">A README in the pack lists every file and anything that was left out.</p>
      </section>

      <section className="card export-card" aria-labelledby="vector-title">
        <h3 id="vector-title">Vector file</h3>
        {isSvg ? (
          <p>
            <a className="btn" href={logoUrl(project.id, latest?.id)} download={`${safeName(project.name)}.svg`}>
              Download original SVG
            </a>
          </p>
        ) : (
          <>
            <p>
              <button type="button" className="btn" disabled aria-describedby="svg-reason">
                Download original SVG
              </button>
            </p>
            <p id="svg-reason" className="muted small">
              {SVG_REASON}
            </p>
          </>
        )}
      </section>

      <section className="card export-card" aria-labelledby="more-title">
        <h3 id="more-title">More</h3>
        <ul className="link-list">
          <li>
            The one-page brand identity (logo, colors, type, mockups) is built on the{" "}
            <a href={href.project(project.id, "identity")}>Identity</a> tab.
          </li>
          <li>
            The PDF report comes with an <a href={href.project(project.id, "advanced")}>Advanced review</a>.
          </li>
          <li>
            Favicons or a background for any image, without a project: <a href={href.tools()}>Tools</a>.
          </li>
        </ul>
      </section>
    </div>
  );
}

/** File-name-safe version of the project name for the download attribute (the browser sanitizes it again). */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9 _-]+/g, "").trim().slice(0, 60) || "logo";
}
