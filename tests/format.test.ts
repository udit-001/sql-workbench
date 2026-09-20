import { describe, expect, it } from "vitest";
import { formatCount } from "../src/bench-kit/format";

/**
 * The convention (SQLWB-7): counts are formatted en-US everywhere —
 * deterministic for agent feeds, screenshots, and exported practice logs,
 * regardless of the reader's machine. These tests pin that contract.
 */
describe("formatCount", () => {
  it.each([
    [0, "0"],
    [1, "1"],
    [999, "999"],
    [1000, "1,000"],
    [1234567, "1,234,567"],
    [-42, "-42"],
  ])("formats %i as %s (en-US, locale-independent)", (input, expected) => {
    expect(formatCount(input)).toBe(expected);
  });
});
