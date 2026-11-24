import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReviewTab from "../pages/ReviewTab";
import { ToastProvider, useToast } from "../components/toast";
import type { ApiError } from "../api";

type Handler = () => { status: number; body: unknown; headers?: Record<string, string> };

function mockFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected fetch: ${key}`);
    const { status, body, headers } = handler();
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const noReview = () => ({ status: 404, body: { error: "No review yet for this project. Run a review first." } });

/** Raises toasts on demand so the stack can be tested without a page. */
function Raiser() {
  const toast = useToast();
  const err = (n: number): ApiError => ({ code: "SERVER", message: `Failure number ${n}` });
  return (
    <div>
      <button type="button" onClick={() => toast.error(err(1))}>
        raise 1
      </button>
      <button type="button" onClick={() => toast.error(err(2))}>
        raise 2
      </button>
      <button type="button" onClick={() => toast.error(err(3))}>
        raise 3
      </button>
      <button type="button" onClick={() => toast.error(err(4))}>
        raise 4
      </button>
      <button type="button" onClick={() => toast.success("Settings saved.")}>
        succeed
      </button>
    </div>
  );
}

const renderRaiser = () =>
  render(
    <ToastProvider>
      <Raiser />
    </ToastProvider>,
  );

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("error toasts from pages", () => {
  it("a failing review raises an alert toast with title and message; the inline banner stays but is not a second alert", async () => {
    const message = "The model is busy right now. Try again in a minute.";
    mockFetch({
      "GET /api/projects/p1/review": noReview,
      "POST /api/projects/p1/review": () => ({ status: 503, body: { error: { code: "NETWORK", message } } }),
    });
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ReviewTab projectId="p1" />
      </ToastProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /run review/i }));

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("Could not reach the AI provider");
    expect(toast).toHaveTextContent(message);
    expect(within(screen.getByRole("region", { name: /notifications/i })).getByRole("alert")).toBe(toast);
    // The banner is still shown inline, without announcing a second time.
    expect(screen.getAllByText(message)).toHaveLength(2);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("RATE_LIMIT toast shows the retry seconds", async () => {
    mockFetch({
      "GET /api/projects/p1/review": noReview,
      "POST /api/projects/p1/review": () => ({
        status: 429,
        headers: { "Retry-After": "42" },
        body: { error: { code: "RATE_LIMIT", message: "Gemini rate limit or quota reached", retryAfterSec: 42 } },
      }),
    });
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ReviewTab projectId="p1" />
      </ToastProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /run review/i }));

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("Rate limit reached");
    expect(toast).toHaveTextContent(/about 42 seconds/);
  });

  it("NO_KEY toast links to Settings", async () => {
    mockFetch({
      "GET /api/projects/p1/review": noReview,
      "POST /api/projects/p1/review": () => ({ status: 401, body: { error: { code: "NO_KEY", message: "No Gemini API key configured." } } }),
    });
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ReviewTab projectId="p1" />
      </ToastProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /run review/i }));

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("No API key configured");
    expect(within(toast).getByRole("link", { name: "Open Settings for setup steps" })).toHaveAttribute("href", "#/settings");
  });
});

describe("toast stack", () => {
  it("de-duplicates identical consecutive errors with a counter", () => {
    renderRaiser();
    fireEvent.click(screen.getByRole("button", { name: "raise 1" }));
    fireEvent.click(screen.getByRole("button", { name: "raise 1" }));
    fireEvent.click(screen.getByRole("button", { name: "raise 1" }));

    const toasts = screen.getAllByRole("alert");
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toHaveTextContent("Failure number 1");
    expect(toasts[0]).toHaveTextContent(/3 times/);
  });

  it("dismisses a toast with its close button", () => {
    renderRaiser();
    fireEvent.click(screen.getByRole("button", { name: "raise 1" }));
    const toast = screen.getByRole("alert");
    fireEvent.click(within(toast).getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows at most three toasts, dropping the oldest", () => {
    renderRaiser();
    for (const n of [1, 2, 3, 4]) fireEvent.click(screen.getByRole("button", { name: `raise ${n}` }));
    const toasts = screen.getAllByRole("alert");
    expect(toasts).toHaveLength(3);
    expect(screen.queryByText("Failure number 1")).not.toBeInTheDocument();
    expect(screen.getByText("Failure number 4")).toBeInTheDocument();
  });

  it("success toasts are polite status messages", () => {
    renderRaiser();
    fireEvent.click(screen.getByRole("button", { name: "succeed" }));
    expect(within(screen.getByRole("region", { name: /notifications/i })).getByRole("status")).toHaveTextContent("Settings saved.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("auto-dismisses an error after about 10 seconds", () => {
    vi.useFakeTimers();
    renderRaiser();
    fireEvent.click(screen.getByRole("button", { name: "raise 1" }));
    act(() => vi.advanceTimersByTime(9_000));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not auto-dismiss while hovered, and resumes after the pointer leaves", () => {
    vi.useFakeTimers();
    renderRaiser();
    fireEvent.click(screen.getByRole("button", { name: "raise 1" }));
    const toast = screen.getByRole("alert");
    act(() => vi.advanceTimersByTime(5_000));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never auto-dismisses while focus is inside the toast", () => {
    vi.useFakeTimers();
    renderRaiser();
    fireEvent.click(screen.getByRole("button", { name: "raise 1" }));
    const close = within(screen.getByRole("alert")).getByRole("button", { name: /dismiss/i });
    act(() => close.focus());
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => close.blur());
    act(() => vi.advanceTimersByTime(10_500));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
