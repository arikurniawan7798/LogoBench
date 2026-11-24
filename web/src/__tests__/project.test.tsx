import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Project from "../pages/Project";
import type { Project as ProjectT } from "../api";

type Reply = { status: number; body: unknown };
type Handler = (init: RequestInit | undefined) => Reply | Promise<Reply>;

/** Stubs fetch: "METHOD /path" -> handler (may be async). Unknown routes fail the test loudly. */
function mockFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected fetch: ${key}`);
    const { status, body } = await handler(init);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const callsTo = (fn: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fn.mock.calls.filter(([u, init]) => u === url && (init?.method ?? "GET").toUpperCase() === method);

const version = (id: string, name: string, mime = "image/png") => ({
  id,
  file: `${id}.png`,
  mime,
  sha256: id,
  originalName: name,
  uploadedAt: "2026-11-20T10:00:00.000Z",
});
const v1: ProjectT = { id: "p1", name: "Acme", createdAt: "2026-11-20T10:00:00.000Z", versions: [version("v1", "acme.png")] };
const v2: ProjectT = { ...v1, versions: [...v1.versions, version("v2", "acme.svg", "image/svg+xml")] };
const noReview = () => ({ status: 404, body: { error: "No review yet" } });

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Project: upload new version", () => {
  it("uploads to /versions, cache-busts the logo URL and refreshes the tabs for the new version", async () => {
    const fetchMock = mockFetch({
      "GET /api/projects/p1": () => ({ status: 200, body: v1 }),
      "GET /api/projects/p1/review": noReview,
      "POST /api/projects/p1/versions": () => ({ status: 201, body: v2 }),
    });
    const user = userEvent.setup();
    render(<Project id="p1" tab="review" />);
    const img = await screen.findByRole("img", { name: /acme logo/i });
    expect(img).toHaveAttribute("src", "/api/projects/p1/logo?v=v1");
    await waitFor(() => expect(callsTo(fetchMock, "GET", "/api/projects/p1/review")).toHaveLength(1));

    const file = new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "acme.svg", { type: "image/svg+xml" });
    await user.upload(screen.getByLabelText(/upload new version/i), file);

    await waitFor(() => expect(screen.getByRole("img", { name: /acme logo/i })).toHaveAttribute("src", "/api/projects/p1/logo?v=v2"));
    const posts = callsTo(fetchMock, "POST", "/api/projects/p1/versions");
    expect(posts).toHaveLength(1);
    const body = posts[0][1]?.body as FormData;
    expect((body.get("logo") as File).name).toBe("acme.svg");
    expect(screen.getByText(/2 versions/)).toBeInTheDocument();
    // The active tab is re-keyed by version, so it reloads instead of showing the old version's data.
    await waitFor(() => expect(callsTo(fetchMock, "GET", "/api/projects/p1/review")).toHaveLength(2));
  });

  it("shows the server's 415 message in the error banner and keeps the current version", async () => {
    mockFetch({
      "GET /api/projects/p1": () => ({ status: 200, body: v1 }),
      "GET /api/projects/p1/review": noReview,
      "POST /api/projects/p1/versions": () => ({ status: 415, body: { error: "Unsupported file type; use SVG, PNG, JPG or WebP" } }),
    });
    const user = userEvent.setup();
    render(<Project id="p1" tab="review" />);
    await screen.findByRole("img", { name: /acme logo/i });

    await user.upload(screen.getByLabelText(/upload new version/i), new File(["nope"], "fake.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported file type; use SVG, PNG, JPG or WebP");
    expect(screen.getByRole("img", { name: /acme logo/i })).toHaveAttribute("src", "/api/projects/p1/logo?v=v1");
    expect(screen.getByLabelText(/upload new version/i)).toBeEnabled();
  });

  it("rejects a wrong file type client-side without uploading", async () => {
    const fetchMock = mockFetch({
      "GET /api/projects/p1": () => ({ status: 200, body: v1 }),
      "GET /api/projects/p1/review": noReview,
    });
    const user = userEvent.setup({ applyAccept: false });
    render(<Project id="p1" tab="review" />);
    await screen.findByRole("img", { name: /acme logo/i });

    await user.upload(screen.getByLabelText(/upload new version/i), new File(["GIF89a"], "anim.gif", { type: "image/gif" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not an SVG, PNG, JPG or WebP/i);
    expect(callsTo(fetchMock, "POST", "/api/projects/p1/versions")).toHaveLength(0);
  });

  it("blocks a second upload while one is in flight", async () => {
    let release!: (r: Reply) => void;
    const fetchMock = mockFetch({
      "GET /api/projects/p1": () => ({ status: 200, body: v1 }),
      "GET /api/projects/p1/review": noReview,
      "POST /api/projects/p1/versions": () => new Promise<Reply>((r) => (release = r)),
    });
    const user = userEvent.setup();
    render(<Project id="p1" tab="review" />);
    await screen.findByRole("img", { name: /acme logo/i });

    const input = screen.getByLabelText(/upload new version/i);
    await user.upload(input, new File(["a"], "a.png", { type: "image/png" }));
    expect(await screen.findByText(/uploading/i)).toBeInTheDocument();
    expect(input).toBeDisabled();
    await user.upload(input, new File(["b"], "b.png", { type: "image/png" }));
    expect(callsTo(fetchMock, "POST", "/api/projects/p1/versions")).toHaveLength(1);

    release({ status: 201, body: v2 });
    await waitFor(() => expect(screen.getByRole("img", { name: /acme logo/i })).toHaveAttribute("src", "/api/projects/p1/logo?v=v2"));
    expect(input).toBeEnabled();
  });
});
