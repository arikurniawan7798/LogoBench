import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ColorsTab from "../pages/ColorsTab";
import ExportTab from "../pages/ExportTab";
import IdentityTab from "../pages/IdentityTab";
import ComparePage from "../pages/ComparePage";
import FormsPage from "../pages/FormsPage";
import type { Project } from "../api";

type Reply = { status: number; body: unknown; headers?: Record<string, string> } | Response;
type Handler = (init: RequestInit | undefined) => Reply;
type Routes = Record<string, Handler>;

/** Stubs global fetch at the network boundary: "METHOD /path" -> handler. Unknown routes fail the test loudly. */
function mockFetch(routes: Routes) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected fetch: ${key}`);
    const reply = handler(init);
    if (reply instanceof Response) return reply;
    const { status, body, headers } = reply;
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const callsTo = (fn: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fn.mock.calls.filter(([u, init]) => u === url && (init?.method ?? "GET").toUpperCase() === method);

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const swatch = (hex: string, rgb: [number, number, number], cmyk: [number, number, number, number], name?: string) => ({
  hex,
  rgb,
  cmyk,
  cmykApproximate: true as const,
  ...(name ? { name } : {}),
});

const palette = {
  main: swatch("#2B4C7E", [43, 76, 126], [66, 40, 0, 51], "Harbor Blue"),
  support: [swatch("#E0A030", [224, 160, 48], [0, 29, 79, 12])],
  neutral: [swatch("#16191D", [22, 25, 29], [24, 14, 0, 89]), swatch("#F3F5F8", [243, 245, 248], [2, 1, 0, 3])],
  note: "CMYK values are approximate, not print-accurate.",
};

describe("ColorsTab", () => {
  it('ColorsTab shows HEX/RGB/CMYK with "approximate" label and lets user edit a role', async () => {
    const fetchMock = mockFetch({
      "GET /api/projects/p1/colors": () => ({ status: 200, body: palette }),
      "PUT /api/projects/p1/colors": (init) => {
        const sent = JSON.parse(String(init?.body));
        return { status: 200, body: { ...sent, note: palette.note } };
      },
    });
    const user = userEvent.setup();
    render(<ColorsTab projectId="p1" />);

    const main = await screen.findByRole("article", { name: /main/i });
    expect(within(main).getByText("#2B4C7E")).toBeInTheDocument();
    expect(within(main).getByText("43, 76, 126")).toBeInTheDocument();
    expect(within(main).getByText("66, 40, 0, 51")).toBeInTheDocument();
    expect(within(main).getByText("Harbor Blue")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: /support 1/i })).toHaveTextContent("#E0A030");
    expect(screen.getByRole("article", { name: /neutral 2/i })).toHaveTextContent("#F3F5F8");
    expect(screen.getByText(/approximate, not print-accurate/i)).toBeInTheDocument();

    await user.click(within(main).getByRole("button", { name: /edit main/i }));
    const input = within(main).getByLabelText(/main hex/i);
    await user.clear(input);
    await user.type(input, "#12");
    await user.click(within(main).getByRole("button", { name: /save/i }));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/#RRGGBB/);
    expect(callsTo(fetchMock, "PUT", "/api/projects/p1/colors")).toHaveLength(0);

    await user.clear(input);
    await user.type(input, "#c0392b");
    await user.click(within(main).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(within(main).getByText("192, 57, 43")).toBeInTheDocument());
    expect(within(main).getByText("#C0392B")).toBeInTheDocument();
    expect(within(main).getByText("0, 70, 78, 25")).toBeInTheDocument();
    const puts = callsTo(fetchMock, "PUT", "/api/projects/p1/colors");
    expect(puts).toHaveLength(1);
    const body = JSON.parse(String(puts[0][1]?.body));
    expect(body.main).toEqual({ ...swatch("#C0392B", [192, 57, 43], [0, 70, 78, 25]), name: "Harbor Blue" });
    expect(body.support).toEqual(palette.support);
    expect(body.neutral).toEqual(palette.neutral);
    expect(body).not.toHaveProperty("note");
  });
});

const project = (mime: string, file = mime === "image/svg+xml" ? "logo.svg" : "logo.png"): Project => ({
  id: "p1",
  name: "Harbor",
  createdAt: "2026-11-20T10:00:00.000Z",
  versions: [{ id: "v1", file, mime, sha256: "x", originalName: file, uploadedAt: "2026-11-20T10:00:00.000Z" }],
});

describe("ExportTab", () => {
  it("ExportTab disables SVG options with reason for PNG projects", () => {
    mockFetch({});
    render(<ExportTab project={project("image/png")} />);

    const svgButton = screen.getByRole("button", { name: /download original svg/i });
    expect(svgButton).toBeDisabled();
    expect(svgButton).toHaveAccessibleDescription(/needs an svg/i);

    const recolored = screen.getByRole("listitem", { name: /recolored svg versions/i });
    expect(recolored).toHaveTextContent(/not included/i);
    expect(recolored).toHaveTextContent(/needs an svg/i);
    expect(screen.getByRole("listitem", { name: /transparent png/i })).toHaveTextContent(/included/i);

    const pack = screen.getByRole("link", { name: /download logo pack/i });
    expect(pack).toHaveAttribute("href", "/api/projects/p1/export.zip");
  });

  it("enables SVG options for SVG projects", () => {
    mockFetch({});
    render(<ExportTab project={project("image/svg+xml")} />);

    expect(screen.queryByRole("button", { name: /download original svg/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download original svg/i })).toHaveAttribute("href", "/api/projects/p1/logo?v=v1");
    expect(screen.getByRole("listitem", { name: /recolored svg versions/i })).not.toHaveTextContent(/not included/i);
  });
});

/** A streamed body that delivers `chunks` as separate reads. */
function streamResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

describe("IdentityTab", () => {
  it("IdentityTab shows per-step status from SSE events including a failed step", async () => {
    const colorsError = { code: "RATE_LIMIT", message: "Gemini rate limit or quota reached" };
    const colorsNote = "AI colors unavailable; used the colors extracted from the logo.";
    const results = [
      { step: "review", status: "ok" },
      { step: "colors", status: "failed", error: colorsError, note: colorsNote },
      { step: "type", status: "ok" },
      { step: "mockups", status: "ok" },
      { step: "identity", status: "ok" },
    ];
    const events = [
      { type: "start", step: "review" },
      { type: "end", step: "review", status: "ok" },
      { type: "start", step: "colors" },
      { type: "end", step: "colors", status: "failed", error: colorsError, note: colorsNote },
      { type: "start", step: "type" },
      { type: "end", step: "type", status: "ok" },
      { type: "start", step: "mockups" },
      { type: "end", step: "mockups", status: "ok" },
      { type: "start", step: "identity" },
      { type: "end", step: "identity", status: "ok" },
      { type: "done", results },
    ];
    const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
    // Split mid-JSON, between the two newlines of a frame terminator, and inside "data:".
    const cut1 = text.indexOf('"failed"') + 3;
    const cut2 = text.indexOf("\n\n", text.indexOf('"type"', cut1)) + 1;
    const cut3 = text.lastIndexOf("data:") + 2;
    const chunks = [text.slice(0, cut1), text.slice(cut1, cut2), text.slice(cut2, cut3), text.slice(cut3)];
    expect(chunks.join("")).toBe(text);

    mockFetch({ "POST /api/projects/p1/create-identity": () => streamResponse(chunks) });
    const user = userEvent.setup();
    render(<IdentityTab projectId="p1" />);

    await user.click(screen.getByRole("button", { name: /create identity/i }));

    const link = await screen.findByRole("link", { name: /download identity/i });
    expect(link).toHaveAttribute("href", "/api/projects/p1/identity.zip");

    const steps = screen.getByRole("list", { name: /steps/i });
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    const colors = within(steps).getByRole("listitem", { name: /colors/i });
    expect(colors).toHaveTextContent(/failed/i);
    expect(colors).toHaveTextContent(colorsError.message);
    expect(colors).toHaveTextContent(colorsNote);
    for (const name of [/review/i, /type/i, /mockups/i, /identity page/i]) {
      expect(within(steps).getByRole("listitem", { name })).toHaveTextContent(/done/i);
    }
    expect(screen.getByRole("status")).toHaveTextContent(/4 of 5 steps done/i);
    expect(screen.getByRole("button", { name: /create identity/i })).toBeEnabled();
  });

  it("aborts the running stream when the tab unmounts", async () => {
    const enc = new TextEncoder();
    let signal: AbortSignal | undefined;
    const fetchMock = mockFetch({
      "POST /api/projects/p1/create-identity": (init) => {
        signal = init?.signal ?? undefined;
        // Never closes on its own: only the abort ends it.
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "start", step: "review" })}\n\n`));
            signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
          },
        });
        return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      },
    });
    const user = userEvent.setup();
    const { unmount } = render(<IdentityTab projectId="p1" />);

    await user.click(screen.getByRole("button", { name: /create identity/i }));
    expect(await screen.findByText(/running step 1 of 5/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();

    unmount();
    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the server's 409 message when a run is already in progress", async () => {
    mockFetch({
      "POST /api/projects/p1/create-identity": () => ({
        status: 409,
        body: { error: "Create identity is already running for this project." },
      }),
    });
    const user = userEvent.setup();
    render(<IdentityTab projectId="p1" />);

    await user.click(screen.getByRole("button", { name: /create identity/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Create identity is already running for this project.");
    expect(screen.queryByRole("link", { name: /download identity/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create identity/i })).toBeEnabled();
  });
});

const projects: Project[] = ["Alpha", "Bravo", "Charlie", "Delta"].map((name, i) => ({
  id: `p${i + 1}`,
  name,
  createdAt: `2026-11-2${i}T10:00:00.000Z`,
  versions: [{ id: `v${i + 1}`, file: "logo.png", mime: "image/png", sha256: "x", originalName: "logo.png", uploadedAt: "2026-11-20T10:00:00.000Z" }],
}));

const scores = (n: number) => ({
  readability: { score: n, reason: "Reads well." },
  originality: { score: n, reason: "Distinct." },
  balance: { score: n, reason: "Even." },
  scalability: { score: n, reason: "Holds up small." },
  misinterpretation: { score: n, reason: "Hard to misread." },
});

describe("ComparePage", () => {
  it("ComparePage blocks submit with <2 or >3 images", async () => {
    const fetchMock = mockFetch({
      "GET /api/projects": () => ({ status: 200, body: projects }),
      "GET /api/compares": () => ({ status: 200, body: [] }),
      "POST /api/compares": (init) => {
        const sent = JSON.parse(String(init?.body));
        return {
          status: 201,
          body: {
            id: "c1",
            createdAt: "2026-11-23T10:00:00.000Z",
            brief: sent.brief ?? "",
            items: sent.items.map((i: { projectId: string }) => ({ projectId: i.projectId, versionId: "v" })),
            result: {
              scores: { p1: scores(6), p3: scores(8) },
              recommendation: { winnerProjectId: "p3", reason: "Charlie reads best at small sizes." },
              notes: ["Alpha leans on a common motif."],
              totals: { p1: 30, p3: 40 },
              promptVersion: "compare-v1",
            },
          },
        };
      },
    });
    const user = userEvent.setup();
    render(<ComparePage />);

    const submit = await screen.findByRole("button", { name: /^compare/i });
    await user.click(screen.getByRole("checkbox", { name: "Alpha" }));
    await user.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent(/choose 2 or 3 logos/i);

    for (const name of ["Bravo", "Charlie", "Delta"]) await user.click(screen.getByRole("checkbox", { name }));
    await user.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent(/choose 2 or 3 logos/i);
    expect(callsTo(fetchMock, "POST", "/api/compares")).toHaveLength(0);

    await user.click(screen.getByRole("checkbox", { name: "Bravo" }));
    await user.click(screen.getByRole("checkbox", { name: "Delta" }));
    await user.type(screen.getByLabelText(/brief/i), "Coastal cafe, warm and modern");
    await user.click(submit);

    expect(await screen.findByText("Charlie reads best at small sizes.")).toBeInTheDocument();
    const posts = callsTo(fetchMock, "POST", "/api/compares");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
      items: [{ projectId: "p1" }, { projectId: "p3" }],
      brief: "Coastal cafe, warm and modern",
    });
    expect(screen.getByRole("heading", { name: /recommended: charlie/i })).toBeInTheDocument();
  });
});

describe("FormsPage", () => {
  it("FormsPage can add a question and save a template", async () => {
    const fetchMock = mockFetch({
      "GET /api/forms": () => ({ status: 200, body: [] }),
      "POST /api/forms": (init) => {
        const sent = JSON.parse(String(init?.body));
        return {
          status: 201,
          body: {
            id: "f1",
            title: sent.title,
            questions: sent.questions.map((q: object, i: number) => ({ id: `q${i + 1}`, ...q })),
            createdAt: "2026-11-23T10:00:00.000Z",
          },
        };
      },
    });
    const user = userEvent.setup();
    render(<FormsPage />);

    await user.click(await screen.findByRole("button", { name: /new template/i }));
    await user.type(screen.getByLabelText(/template title/i), "Client intake");
    await user.click(screen.getByRole("button", { name: /add question/i }));
    await user.type(screen.getByLabelText(/^question 1$/i), "Who are your customers?");
    await user.click(screen.getByRole("button", { name: /add question/i }));
    await user.type(screen.getByLabelText(/^question 2$/i), "Preferred style?");
    await user.selectOptions(screen.getByLabelText(/question 2 answer type/i), "choice");
    await user.type(screen.getByLabelText(/question 2 options/i), "Classic\nPlayful");
    await user.click(screen.getByRole("button", { name: /save template/i }));

    const list = await screen.findByRole("list", { name: /templates/i });
    expect(within(list).getByText("Client intake")).toBeInTheDocument();
    expect(within(list).getByText(/2 questions/i)).toBeInTheDocument();
    const posts = callsTo(fetchMock, "POST", "/api/forms");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
      title: "Client intake",
      questions: [
        { text: "Who are your customers?", type: "text" },
        { text: "Preferred style?", type: "choice", options: ["Classic", "Playful"] },
      ],
    });
  });
});
