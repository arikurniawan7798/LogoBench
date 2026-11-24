import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { BusyPanel, GlobalProgress, Spinner } from "../components/loading";
import { api } from "../api";

const SLOW = /still working.*free-tier models can be slow or busy.*retries automatically/i;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Spinner", () => {
  it("is decorative with an optional screen-reader label", () => {
    const { container } = render(<Spinner label="Saving" />);
    expect(container.querySelector(".spinner")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Saving")).toHaveClass("sr-only");
  });
});

describe("BusyPanel", () => {
  it("shows the message and an elapsed-seconds counter, then a gentle note after 15 s", () => {
    vi.useFakeTimers();
    const { rerender } = render(<BusyPanel active message="Asking the model to review your logo…" />);
    expect(screen.getByText("Asking the model to review your logo…")).toBeInTheDocument();
    expect(screen.getByText(/0 s elapsed/)).toBeInTheDocument();
    expect(screen.queryByText(SLOW)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByText(/3 s elapsed/)).toBeInTheDocument();
    expect(screen.queryByText(SLOW)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByText(/15 s elapsed/)).toBeInTheDocument();
    expect(screen.getByText(SLOW)).toBeInTheDocument();

    // The message and the note sit in a polite live region; the ticking counter does not.
    const live = screen.getByText("Asking the model to review your logo…").closest("[aria-live]");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toContainElement(screen.getByText(SLOW));
    expect(live).not.toContainElement(screen.getByText(/15 s elapsed/));

    rerender(<BusyPanel active={false} message="Asking the model to review your logo…" />);
    expect(screen.queryByText(/elapsed/)).not.toBeInTheDocument();

    // Restarting counts from zero again.
    rerender(<BusyPanel active message="Asking the model to review your logo…" />);
    expect(screen.getByText(/0 s elapsed/)).toBeInTheDocument();
    expect(screen.queryByText(SLOW)).not.toBeInTheDocument();
  });
});

describe("GlobalProgress", () => {
  function pendingFetch() {
    const releases: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            releases.push(() => resolve(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
          }),
      ),
    );
    return releases;
  }

  it("appears only after the debounce and disappears when requests finish", async () => {
    vi.useFakeTimers();
    const releases = pendingFetch();
    render(<GlobalProgress />);

    let a!: Promise<unknown>;
    let b!: Promise<unknown>;
    act(() => {
      a = api.listProjects();
      b = api.listForms();
    });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    await act(async () => {
      releases[0]();
      await a;
    });
    expect(screen.getByRole("progressbar")).toBeInTheDocument(); // one request still in flight

    await act(async () => {
      releases[1]();
      await b;
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("never flashes for a quick request", async () => {
    vi.useFakeTimers();
    const releases = pendingFetch();
    render(<GlobalProgress />);

    let p!: Promise<unknown>;
    act(() => {
      p = api.listProjects();
    });
    act(() => vi.advanceTimersByTime(100));
    await act(async () => {
      releases[0]();
      await p;
    });
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
