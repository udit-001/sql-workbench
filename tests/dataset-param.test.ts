/**
 * Twin of src/bench-kit/dataset-param.ts.
 *
 * The allowlist here is the whole of the ?dataset= hardening: a rejected
 * value must be exactly a value that resolveDatasetRef would otherwise have
 * fetched verbatim from an anonymous query string.
 */
import { describe, expect, it } from "vitest";
import { resolveDatasetParam } from "../src/bench-kit/dataset-param";

describe("resolveDatasetParam", () => {
  it("returns nothing when no dataset param is present", () => {
    expect(resolveDatasetParam("")).toEqual({ slug: null, rejected: null });
    expect(resolveDatasetParam("?mode=card&sql=SELECT%201")).toEqual({
      slug: null,
      rejected: null,
    });
  });

  it("accepts a bare slug from ?dataset=", () => {
    expect(resolveDatasetParam("?dataset=bookshop")).toEqual({
      slug: "bookshop",
      rejected: null,
    });
    expect(resolveDatasetParam("?dataset=bike-rentals").slug).toBe("bike-rentals");
    expect(resolveDatasetParam("?dataset=sql-101").slug).toBe("sql-101");
  });

  it("accepts ?fixture= as the legacy alias", () => {
    expect(resolveDatasetParam("?fixture=ecommerce").slug).toBe("ecommerce");
  });

  it("prefers ?dataset= when both are present", () => {
    expect(resolveDatasetParam("?dataset=chinook&fixture=bookshop").slug).toBe("chinook");
  });

  it("survives other params around it", () => {
    expect(resolveDatasetParam("?mode=card&dataset=chinook&sql=x").slug).toBe("chinook");
  });

  it("rejects anything that is not a bare slug, and reports it", () => {
    const rejected = [
      "https://evil.example/payload.json",
      "//evil.example/payload.json",
      "/api/lesson-html/x/payload.json",
      "datasets/books.json",
      "../secrets.json",
      "Books",
      "books?x=1",
      "books/../etc",
      "book%20shop",
    ];
    for (const value of rejected) {
      const result = resolveDatasetParam(`?dataset=${encodeURIComponent(value)}`);
      expect(result, value).toEqual({ slug: null, rejected: value });
    }
  });

  it("rejects an empty value rather than treating it as absent", () => {
    expect(resolveDatasetParam("?dataset=")).toEqual({ slug: null, rejected: null });
  });
});
