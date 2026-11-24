import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockupsTab from "../pages/MockupsTab";

const specs = [
  { kind: "website", width: 1280, height: 720, label: "Website header" },
  { kind: "mobile", width: 780, height: 1688, label: "Mobile screen (390x844 @2x)" },
  { kind: "appicon", width: 512, height: 512, label: "App icon" },
  { kind: "favicon", width: 600, height: 240, label: "Favicon in a browser tab" },
  { kind: "businesscard", width: 1050, height: 600, label: "Business card (front)" },
];

function stub() {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (url === "/api/mockups") return new Response(JSON.stringify(specs), { status: 200, headers: { "Content-Type": "application/json" } });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderTab = () => render(<MockupsTab projectId="p1" versionId="v1" projectName="Ledgerly" onRename={() => {}} />);

describe("Mockups tab", () => {
  it("renders five equal cards, each with a title, muted dimensions and a Download PNG link", async () => {
    stub();
    renderTab();
    const list = await screen.findByRole("list", { name: /mockups/i });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(5);
    for (const [i, card] of cards.entries()) {
      const s = specs[i];
      expect(within(card).getByRole("heading", { name: s.label })).toBeInTheDocument();
      expect(within(card).getByText(`${s.width}×${s.height} px`)).toHaveClass("muted");
      const dl = within(card).getByRole("link", { name: new RegExp(`download png.*${s.label.replace(/[()@]/g, ".")}`, "i") });
      expect(dl).toHaveAttribute("download", `${s.kind}.png`);
      expect(dl).toHaveClass("btn");
      expect(within(card).getByRole("img", { name: new RegExp(`${s.label.replace(/[()@]/g, ".")} mockup`, "i") })).toBeInTheDocument();
    }
    expect(screen.getByText(/wordmarks lose detail at 16 px/i)).toBeInTheDocument();
  });

  it("shows a loading placeholder until each image loads, and an inline error with Retry when one fails", async () => {
    stub();
    renderTab();
    const img = await screen.findByRole("img", { name: /app icon mockup/i });
    const card = img.closest("li")!;
    expect(card.querySelector(".mockup-preview")).toHaveAttribute("aria-busy", "true");
    fireEvent.load(img);
    expect(card.querySelector(".mockup-preview")).toHaveAttribute("aria-busy", "false");

    const web = screen.getByRole("img", { name: /website header mockup/i });
    const firstSrc = web.getAttribute("src");
    fireEvent.error(web);
    const webCard = screen.getByRole("heading", { name: "Website header" }).closest("li")!;
    expect(within(webCard).getByText(/could not be rendered/i)).toBeInTheDocument();
    await userEvent.setup().click(within(webCard).getByRole("button", { name: /retry/i }));
    const again = within(webCard).getByRole("img", { name: /website header mockup/i });
    expect(again.getAttribute("src")).not.toBe(firstSrc);
  });

  it("clicking a preview opens a larger view in a dialog; Esc closes it and focus returns", async () => {
    stub();
    const user = userEvent.setup();
    renderTab();
    const open = await screen.findByRole("button", { name: /enlarge mobile screen/i });
    await user.click(open);
    const dialog = screen.getByRole("dialog", { name: /mobile screen/i });
    expect(within(dialog).getByRole("img", { name: /mobile screen.*mockup/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /close/i })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(open).toHaveFocus();
  });

  it("Enter on a focused preview opens the dialog too; the Close button closes it", async () => {
    stub();
    const user = userEvent.setup();
    renderTab();
    const open = await screen.findByRole("button", { name: /enlarge app icon/i });
    open.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: /app icon/i });
    await user.click(within(dialog).getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it("Re-render reloads every image and marks itself busy until they settle", async () => {
    stub();
    const user = userEvent.setup();
    renderTab();
    const imgs = await screen.findAllByRole("img", { name: /mockup$/i });
    for (const i of imgs) fireEvent.load(i);
    const btn = screen.getByRole("button", { name: /re-render/i });
    expect(btn).toHaveAttribute("aria-busy", "false");
    const before = imgs[0].getAttribute("src");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent(/rendering/i);
    const fresh = screen.getAllByRole("img", { name: /mockup$/i });
    expect(fresh[0].getAttribute("src")).not.toBe(before);
    for (const i of fresh) fireEvent.load(i);
    expect(btn).toHaveAttribute("aria-busy", "false");
  });
});
