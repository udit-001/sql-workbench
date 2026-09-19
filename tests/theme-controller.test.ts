import { afterEach, describe, expect, it } from "vitest";
import { persistSharedTheme, sharedResolvedTheme } from "../src/bench-kit/theme-controller";

/* persistSharedTheme / sharedResolvedTheme touch document, localStorage and
   window.matchMedia. Stub those globals node-style — no DOM environment —
   and test the helpers through their interface only. */
const store = new Map<string, string>();
const html = { dataset: {} as Record<string, string | undefined> };
let osDark = false;

globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
} as Storage;
(globalThis as { document: unknown }).document = { documentElement: html };
(globalThis as { window: unknown }).window = {
  matchMedia: () => ({ matches: osDark }),
};

afterEach(() => {
  store.clear();
  delete html.dataset.theme;
  osDark = false;
});

describe("persistSharedTheme", () => {
  it("mirrors the mode on the document element and the shared key", () => {
    persistSharedTheme("dark");
    expect(html.dataset.theme).toBe("dark");
    expect(store.get("pharos_theme")).toBe("dark");
  });
});

describe("sharedResolvedTheme", () => {
  it("prefers the shared key's explicit mode over document and OS", () => {
    html.dataset.theme = "light";
    store.set("pharos_theme", "dark");
    expect(sharedResolvedTheme()).toBe("dark");
  });

  it("falls back to the document element over the OS", () => {
    html.dataset.theme = "light";
    osDark = true;
    expect(sharedResolvedTheme()).toBe("light");
  });

  it("falls back to the OS preference", () => {
    osDark = true;
    expect(sharedResolvedTheme()).toBe("dark");
  });
});

describe("standalone toggle roundtrip", () => {
  it("resolves, flips, persists — the next read sees the flip", () => {
    html.dataset.theme = "light"; // what the FOUC guard resolved
    persistSharedTheme(sharedResolvedTheme() === "dark" ? "light" : "dark");
    expect(sharedResolvedTheme()).toBe("dark");
  });
});
