import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeSwitch from "../components/ThemeSwitch";
import { THEME_KEY, loadTheme } from "../theme";

const root = () => document.documentElement;

beforeEach(() => {
  window.localStorage.clear();
  root().removeAttribute("data-theme");
});
afterEach(() => {
  window.localStorage.clear();
  root().removeAttribute("data-theme");
});

describe("ThemeSwitch", () => {
  it("defaults to Auto: nothing forced, nothing saved", () => {
    render(<ThemeSwitch />);
    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
    expect(root().hasAttribute("data-theme")).toBe(false);
  });

  it("Light forces the light palette and remembers it", async () => {
    render(<ThemeSwitch />);
    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(root()).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "false");
  });

  it("Dark forces dark; Auto clears the override and the saved choice", async () => {
    render(<ThemeSwitch />);
    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(root()).toHaveAttribute("data-theme", "dark");
    await userEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(root().hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("starts from the saved choice and ignores junk in storage", () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    render(<ThemeSwitch />);
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    window.localStorage.setItem(THEME_KEY, "<script>");
    expect(loadTheme()).toBe("system");
  });
});
