import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Settings from "../pages/Settings";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Settings copy", () => {
  it("hints where to find a current Gemini model and qualifies the Ollama privacy claim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ provider: "gemini", geminiModel: "g", ollamaModel: "o", ollamaUrl: "http://127.0.0.1:11434", hasGeminiKey: false }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<Settings />);
    const model = await screen.findByLabelText(/^model name/i, { selector: "#gemini-model" });
    expect(model).toHaveAccessibleDescription(/model not found.*ai\.google\.dev.*free-tier vision model/i);
    expect(screen.getByText(/as long as the ollama url points to this machine/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing leaves it$/i)).not.toBeInTheDocument();
  });
});
