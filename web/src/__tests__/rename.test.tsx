import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Project from "../pages/Project";
import { ToastProvider } from "../components/toast";
import type { Project as ProjectT } from "../api";

type Reply = { status: number; body: unknown };
type Handler = (init: RequestInit | undefined) => Reply | Promise<Reply>;

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

const p1: ProjectT = {
  id: "p1",
  name: "ledgerly logo",
  createdAt: "2026-11-20T10:00:00.000Z",
  versions: [{ id: "v1", file: "v1.jpg", mime: "image/jpeg", sha256: "x", originalName: "ledgerly-logo.jpg", uploadedAt: "2026-11-20T10:00:00.000Z" }],
};
const specs = [
  { kind: "website", width: 1280, height: 720, label: "Website header" },
  { kind: "mobile", width: 780, height: 1688, label: "Mobile screen (390x844 @2x)" },
  { kind: "appicon", width: 512, height: 512, label: "App icon" },
  { kind: "favicon", width: 600, height: 240, label: "Favicon in a browser tab" },
  { kind: "businesscard", width: 1050, height: 600, label: "Business card (front)" },
];
const noReview = () => ({ status: 404, body: { error: "No review yet" } });

const setup = (tab = "review", extra: Record<string, Handler> = {}) => {
  const fetchMock = mockFetch({
    "GET /api/projects/p1": () => ({ status: 200, body: p1 }),
    "GET /api/projects/p1/review": noReview,
    "GET /api/mockups": () => ({ status: 200, body: specs }),
    ...extra,
  });
  render(
    <ToastProvider>
      <Project id="p1" tab={tab} />
    </ToastProvider>,
  );
  return fetchMock;
};

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Project: rename", () => {
  it("Rename opens a labelled input with the current name; Enter saves, the title updates and a toast confirms", async () => {
    const fetchMock = setup("review", {
      "PATCH /api/projects/p1": (init) => ({ status: 200, body: { ...p1, name: JSON.parse(String(init?.body)).name } }),
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { level: 1, name: "ledgerly logo" });
    await user.click(screen.getByRole("button", { name: /rename/i }));
    const input = screen.getByRole("textbox", { name: /logo name/i });
    expect(input).toHaveValue("ledgerly logo");
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "Ledgerly{Enter}");

    expect(await screen.findByRole("heading", { level: 1, name: "Ledgerly" })).toBeInTheDocument();
    const patches = callsTo(fetchMock, "PATCH", "/api/projects/p1");
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String(patches[0][1]?.body))).toEqual({ name: "Ledgerly" });
    const toastRegion = screen.getByRole("region", { name: /notifications/i });
    expect(await within(toastRegion).findByRole("status")).toHaveTextContent(/renamed to “Ledgerly”/i);
    // focus returns to the Rename button
    await waitFor(() => expect(screen.getByRole("button", { name: /rename/i })).toHaveFocus());
    expect(screen.getByRole("img", { name: /ledgerly logo$/i })).toBeInTheDocument();
  });

  it("Esc cancels without saving and restores focus", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    await screen.findByRole("heading", { level: 1, name: "ledgerly logo" });
    await user.click(screen.getByRole("button", { name: /rename/i }));
    await user.type(screen.getByRole("textbox", { name: /logo name/i }), " changed{Escape}");
    expect(screen.queryByRole("textbox", { name: /logo name/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "ledgerly logo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rename/i })).toHaveFocus();
    expect(callsTo(fetchMock, "PATCH", "/api/projects/p1")).toHaveLength(0);
  });

  it("validates empty and too-long names client-side without a request", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    await screen.findByRole("heading", { level: 1, name: "ledgerly logo" });
    await user.click(screen.getByRole("button", { name: /rename/i }));
    const input = screen.getByRole("textbox", { name: /logo name/i });
    await user.clear(input);
    await user.type(input, "   {Enter}");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/cannot be empty/i);
    await user.clear(input);
    await user.click(input);
    await user.paste("x".repeat(81));
    await user.keyboard("{Enter}");
    expect(input).toHaveAccessibleDescription(/at most 80 characters/i);
    expect(callsTo(fetchMock, "PATCH", "/api/projects/p1")).toHaveLength(0);
  });

  it("a server error shows an error toast and keeps the editor open; double submit sends one request", async () => {
    let release!: (r: Reply) => void;
    const fetchMock = setup("review", { "PATCH /api/projects/p1": () => new Promise<Reply>((r) => (release = r)) });
    const user = userEvent.setup();
    await screen.findByRole("heading", { level: 1, name: "ledgerly logo" });
    await user.click(screen.getByRole("button", { name: /rename/i }));
    const input = screen.getByRole("textbox", { name: /logo name/i });
    await user.clear(input);
    await user.type(input, "Ledgerly{Enter}");
    await user.keyboard("{Enter}");
    const save = screen.getByRole("button", { name: /saving/i });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("aria-busy", "true");
    expect(callsTo(fetchMock, "PATCH", "/api/projects/p1")).toHaveLength(1);
    release({ status: 400, body: { error: "Name cannot contain control characters." } });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/control characters/i);
    expect(screen.getByRole("textbox", { name: /logo name/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "ledgerly logo" })).toBeInTheDocument();
  });

  it("the Mockups tab says which name the mockups use and its Rename link opens the editor", async () => {
    setup("mockups");
    const user = userEvent.setup();
    const note = await screen.findByText(/mockups use the name/i);
    expect(note).toHaveTextContent("Mockups use the name “ledgerly logo”");
    await user.click(within(note).getByRole("button", { name: /rename/i }));
    expect(screen.getByRole("textbox", { name: /logo name/i })).toHaveFocus();
  });

  it("after a rename the mockup images are re-requested (the URL changes)", async () => {
    setup("mockups", {
      "PATCH /api/projects/p1": (init) => ({ status: 200, body: { ...p1, name: JSON.parse(String(init?.body)).name } }),
    });
    const user = userEvent.setup();
    const before = (await screen.findByRole("img", { name: /website header mockup/i })).getAttribute("src");
    await user.click(screen.getAllByRole("button", { name: /^rename/i })[0]);
    const input = screen.getByRole("textbox", { name: /logo name/i });
    await user.clear(input);
    await user.type(input, "Ledgerly{Enter}");
    await screen.findByRole("heading", { level: 1, name: "Ledgerly" });
    await waitFor(() => expect(screen.getByRole("img", { name: /website header mockup/i }).getAttribute("src")).not.toBe(before));
  });
});
