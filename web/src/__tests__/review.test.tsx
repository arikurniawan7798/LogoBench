import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReviewTab from "../pages/ReviewTab";
import Home from "../pages/Home";

type Handler = (init: RequestInit | undefined) => { status: number; body: unknown; headers?: Record<string, string> };
type Routes = Record<string, Handler>;

/** Stubs global fetch at the network boundary: "METHOD /path" -> handler. Unknown routes fail the test loudly. */
function mockFetch(routes: Routes) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected fetch: ${key}`);
    const { status, body, headers } = handler(init);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const review = {
  scores: {
    readability: { score: 8, reason: "The wordmark stays legible at small sizes." },
    originality: { score: 5, reason: "The leaf motif is common in this sector." },
    balance: { score: 7, reason: "Weight sits slightly left of center." },
    scalability: { score: 9, reason: "Simple shapes survive a 16px favicon." },
    misinterpretation: { score: 6, reason: "The swoosh could read as a checkmark." },
  },
  personality: {
    presence: "Quiet",
    attitude: "Friendly",
    formality: "Semi-formal",
    style: "Geometric",
    tone: "Warm",
    positioning: "Mid-market",
  },
  summary: "A tidy mark with a familiar motif.",
};

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReviewTab", () => {
  it("renders five scores with reasons and personality", async () => {
    mockFetch({
      "GET /api/projects/p1/review": () => ({ status: 200, body: { result: review, cached: true, createdAt: "2026-11-20T10:00:00.000Z" } }),
    });
    render(<ReviewTab projectId="p1" />);

    const scores = await screen.findByRole("list", { name: /scores/i });
    const items = within(scores).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    for (const [dim, { score, reason }] of Object.entries(review.scores)) {
      const item = within(scores).getByTestId(`score-${dim}`);
      expect(item).toHaveTextContent(`${score}/10`);
      expect(item).toHaveTextContent(reason);
    }
    const personality = screen.getByRole("region", { name: /brand personality/i });
    for (const value of Object.values(review.personality)) {
      expect(within(personality).getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText(review.summary)).toBeInTheDocument();
  });

  it('shows "Re-run" and cached badge', async () => {
    const fetchMock = mockFetch({
      "GET /api/projects/p1/review": () => ({ status: 200, body: { result: review, cached: true, createdAt: "2026-11-20T10:00:00.000Z" } }),
      "POST /api/projects/p1/review": () => ({
        status: 200,
        body: { result: { ...review, summary: "Fresh take." }, cached: false },
      }),
    });
    const user = userEvent.setup();
    render(<ReviewTab projectId="p1" />);

    expect(await screen.findByText(/^cached$/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /re-run/i }));

    expect(await screen.findByText("Fresh take.")).toBeInTheDocument();
    expect(screen.queryByText(/^cached$/i)).not.toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ force: true });
  });

  it("RATE_LIMIT error shows message with retry seconds", async () => {
    mockFetch({
      "GET /api/projects/p1/review": () => ({ status: 404, body: { error: "No review yet for this project. Run a review first." } }),
      "POST /api/projects/p1/review": () => ({
        status: 429,
        headers: { "Retry-After": "42" },
        body: { error: { code: "RATE_LIMIT", message: "Gemini rate limit or quota reached", retryAfterSec: 42 } },
      }),
    });
    const user = userEvent.setup();
    render(<ReviewTab projectId="p1" />);

    await user.click(await screen.findByRole("button", { name: /run review/i }));

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("Gemini rate limit or quota reached");
    expect(banner).toHaveTextContent(/42 seconds/);
    await user.click(within(banner).getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Home", () => {
  it("Home shows empty state when no projects", async () => {
    mockFetch({ "GET /api/projects": () => ({ status: 200, body: [] }) });
    render(<Home />);

    expect(await screen.findByText(/no logos yet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/choose a logo file/i)).toBeInTheDocument();
  });
});
