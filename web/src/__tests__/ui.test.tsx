import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, Dialog, Input, Tabs } from "../components/ui";
import { AppShell } from "../components/AppShell";

describe("Button", () => {
  it("while loading it is disabled, aria-busy and named by the loading text; clicks are ignored", async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingText="Saving…" onClick={onClick}>
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Saving…" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("idle: enabled, not busy; disabled blocks clicks", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveAttribute("aria-busy", "false");
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Tabs", () => {
  const items = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Bravo" },
    { id: "c", label: "Charlie" },
  ];
  function Harness() {
    const [active, setActive] = useState("a");
    return <Tabs items={items} active={active} onSelect={setActive} label="Sections" />;
  }

  it("arrows move and wrap, Home/End jump; only the active tab is tabbable", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    const tab = (name: string) => screen.getByRole("tab", { name });
    expect(tab("Alpha")).toHaveAttribute("aria-selected", "true");
    expect(tab("Bravo")).toHaveAttribute("tabindex", "-1");
    expect(tab("Alpha")).toHaveAttribute("aria-controls", "panel-a");

    await user.tab();
    expect(tab("Alpha")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(tab("Bravo")).toHaveFocus();
    expect(tab("Bravo")).toHaveAttribute("aria-selected", "true");
    expect(tab("Bravo")).toHaveAttribute("tabindex", "0");
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(tab("Alpha")).toHaveFocus(); // wrapped
    await user.keyboard("{ArrowLeft}");
    expect(tab("Charlie")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(tab("Alpha")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(tab("Charlie")).toHaveFocus();
  });
});

describe("Dialog", () => {
  it("is a named modal, focuses Close, and Esc or Close calls onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog title="Preview" subtitle="10×10 px" onClose={onClose}>
        <p>Body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: /preview/i });
    expect(dialog).toHaveTextContent("Body");
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(close);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Input field wiring", () => {
  it("links the label, hint and error; aria-invalid only with an error", () => {
    const { rerender } = render(<Input id="n" label="Name" hint="Up to 80 characters." />);
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveAccessibleDescription("Up to 80 characters.");
    expect(input).not.toHaveAttribute("aria-invalid", "true");

    rerender(<Input id="n" label="Name" hint="Up to 80 characters." error="Name cannot be empty." />);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Name cannot be empty. Up to 80 characters.");
  });

  it("a visually hidden label still names the control", () => {
    render(<Input label="Logo name" hideLabel />);
    expect(screen.getByRole("textbox", { name: "Logo name" })).toBeInTheDocument();
  });
});

describe("AppShell", () => {
  it("has the main nav with the current page marked", () => {
    render(
      <AppShell route={{ page: "compare" }}>
        <p>content</p>
      </AppShell>,
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toHaveTextContent("content");
  });

  it("mobile drawer: the menu button opens a modal menu, Esc closes it and focus returns to the button", async () => {
    const user = userEvent.setup();
    render(
      <AppShell route={{ page: "home" }}>
        <p>content</p>
      </AppShell>,
    );
    const menu = screen.getByRole("button", { name: "Open menu" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(menu);
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(drawer).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(menu).toHaveFocus();
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("the drawer's Close button closes it and returns focus; Tab stays inside while open", async () => {
    const user = userEvent.setup();
    render(
      <AppShell route={{ page: "home" }}>
        <p>content</p>
      </AppShell>,
    );
    const menu = screen.getByRole("button", { name: "Open menu" });
    await user.click(menu);
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    for (let i = 0; i < 15; i++) {
      await user.tab();
      expect(drawer).toContainElement(document.activeElement as HTMLElement);
    }
    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(menu).toHaveFocus();
  });
});
