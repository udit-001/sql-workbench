import { describe, expect, it } from "vitest";
import { themeFromMessage } from "../src/bench-kit/theme";

describe("themeFromMessage", () => {
  it("accepts the Pharos dashboard relay shape", () => {
    expect(themeFromMessage({ type: "theme", theme: "dark" })).toBe("dark");
    expect(themeFromMessage({ type: "theme", theme: "light" })).toBe("light");
  });

  it("rejects everything else — the embed contract allows one message only", () => {
    expect(themeFromMessage({ type: "theme", theme: "system" })).toBeUndefined();
    expect(themeFromMessage({ type: "other", theme: "dark" })).toBeUndefined();
    expect(themeFromMessage({ type: "theme" })).toBeUndefined();
    expect(themeFromMessage("theme")).toBeUndefined();
    expect(themeFromMessage(null)).toBeUndefined();
    expect(themeFromMessage(undefined)).toBeUndefined();
    expect(themeFromMessage(42)).toBeUndefined();
    expect(themeFromMessage({ type: "pharos-open-palette" })).toBeUndefined();
  });
});
