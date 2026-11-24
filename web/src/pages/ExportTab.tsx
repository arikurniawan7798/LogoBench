import { logoUrl, urls, type Project } from "../api";
import { href } from "../router";
import { Badge, Button, ButtonLink, Callout, Card, CardHeader, cn, IconCheck, IconDownload, IconFile, IconLock, PageHeader } from "../components/ui";

const SVG_REASON = "Needs an SVG upload. This logo was uploaded as a raster image (PNG, JPG or WebP), so vector and recolored files cannot be made from it.";

type Item = { id: string; label: string; detail: string; needsSvg: boolean };

const PACK: Item[] = [
  {
    id: "original",
    label: "Your logo file",
    detail: "SVG logos are the cleaned SVG (scripts and external links removed); PNG, JPG and WebP files are included unchanged.",
    needsSvg: false,
  },
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
    <div className="flex flex-col gap-6">
      <PageHeader
        level={2}
        title="Export"
        description={
          <p>Production files built from the latest logo version and your saved colors. Everything is generated on this machine.</p>
        }
      />

      {!isSvg && (
        <Callout tone="warn" role="note" title="Raster logo: some files are not available">
          <p className="text-fg-muted">
            Recolored and vector files need an SVG source. Use "Upload new version" at the top of this page to add an SVG version of
            this logo and unlock them; LogoBench does not trace raster images.
          </p>
        </Callout>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card as="section" aria-labelledby="pack-title">
          <CardHeader
            id="pack-title"
            title="Logo pack"
            icon={<IconFile className="size-4" />}
            description="A README in the pack lists every file and anything that was left out."
          />
          <ul className="flex flex-col divide-y divide-line">
            {PACK.map((item) => {
              const available = !item.needsSvg || isSvg;
              const labelId = `pack-${item.id}`;
              return (
                <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0" aria-labelledby={labelId}>
                  <span
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                      available ? "bg-success-soft text-success" : "bg-muted-bg text-fg-subtle",
                    )}
                    aria-hidden="true"
                  >
                    {available ? <IconCheck className="size-4" /> : <IconLock className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span id={labelId} className={cn("text-sm font-medium", available ? "text-fg" : "text-fg-muted")}>
                        {item.label}
                      </span>
                      <Badge tone={available ? "success" : "neutral"}>{available ? "Included" : "Not included"}</Badge>
                    </span>
                    <span className="mt-0.5 block text-[0.8125rem] leading-5 text-fg-muted">{available ? item.detail : SVG_REASON}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 border-t border-line pt-5">
            <ButtonLink variant="primary" href={urls.exportZip(project.id)} download icon={<IconDownload className="size-4" />}>
              Download logo pack (.zip)
            </ButtonLink>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card as="section" aria-labelledby="vector-title">
            <CardHeader id="vector-title" title="Vector file" description="The cleaned SVG on its own." />
            {isSvg ? (
              <ButtonLink variant="download" href={logoUrl(project.id, latest?.id)} download={`${safeName(project.name)}.svg`}>
                Download cleaned SVG
              </ButtonLink>
            ) : (
              <div className="flex flex-col gap-2">
                <Button disabled aria-describedby="svg-reason" icon={<IconDownload className="size-4" />} className="self-start">
                  Download cleaned SVG
                </Button>
                <p id="svg-reason" className="text-[0.8125rem] leading-5 text-fg-muted">
                  {SVG_REASON}
                </p>
              </div>
            )}
          </Card>

          <Card as="section" aria-labelledby="more-title">
            <CardHeader id="more-title" title="More" />
            <ul className="flex flex-col gap-2.5 text-sm leading-6 text-fg-muted">
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
          </Card>
        </div>
      </div>
    </div>
  );
}

/** File-name-safe version of the project name for the download attribute (the browser sanitizes it again). */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9 _-]+/g, "").trim().slice(0, 60) || "logo";
}
