import { describe, expect, it, vi, afterEach } from "vitest";
import { FixtureError, parseFixture, resolveDatasetRef, fetchDataset } from "../src/bench-kit/fixture";

const VALID = {
  id: "ecommerce",
  kind: "sqlite-dataset",
  version: 1,
  title: "E-commerce sample",
  reset: { sql: "CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);" },
};

function parse(raw: unknown, requestedId = "ecommerce") {
  return parseFixture(raw, requestedId);
}

describe("parseFixture", () => {
  it("accepts a valid fixture and normalises optional fields", () => {
    const fixture = parse({ ...VALID });
    expect(fixture).toEqual({
      id: "ecommerce",
      kind: "sqlite-dataset",
      title: "E-commerce sample",
      sql: VALID.reset.sql,
    });
  });

  it("keeps the description when present", () => {
    const fixture = parse({ ...VALID, description: "Join practice data" });
    expect(fixture.description).toBe("Join practice data");
  });

  it("rejects non-objects with a plain-language reason", () => {
    expect(() => parse("nope")).toThrow(FixtureError);
    expect(() => parse("nope")).toThrow(/not a JSON object/i);
    expect(() => parse(null)).toThrow(FixtureError);
    expect(() => parse([VALID])).toThrow(FixtureError);
  });

  it("rejects an id that is not a slug", () => {
    expect(() => parse({ ...VALID, id: "E-Commerce!" })).toThrow(
      /lowercase letters, digits.*hyphens/i,
    );
  });

  it("rejects when file id differs from the requested ?fixture= value", () => {
    expect(() => parse({ ...VALID }, "shop")).toThrow(
      /Asked for the "shop" dataset, but the fixture says "ecommerce"/,
    );
  });

  it("rejects unknown kinds with what v1 supports", () => {
    expect(() => parse({ ...VALID, kind: "py-module" })).toThrow(
      /py-module.*sqlite-dataset/,
    );
  });

  it("rejects versions other than 1", () => {
    expect(() => parse({ ...VALID, version: 2 })).toThrow(/This fixture is version 2 — this bench loads version 1 only/);
  });

  it("requires a title", () => {
    expect(() => parse({ ...VALID, title: 42 })).toThrow(/title/);
  });

  it("requires reset.sql to be non-empty SQL text", () => {
    expect(() => parse({ ...VALID, reset: {} })).toThrow(/reset\.sql/);
    expect(() => parse({ ...VALID, reset: { sql: "   " } })).toThrow(/reset\.sql/);
    expect(() => parse({ ...VALID, reset: { sql: 5 } })).toThrow(/reset\.sql/);
  });

  it("rejects base64-encoded seeds — sqlite-dataset seeds must stay readable", () => {
    const encoded = { ...VALID, encoding: "base64" };
    expect(() => parse(encoded)).toThrow(/base64.*readable|readable.*base64/i);
  });
});

describe("dataset references", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves a bare slug to the fixtures-relative URL", () => {
    expect(resolveDatasetRef("books")).toEqual({
      url: "fixtures/books.json",
      id: "books",
    });
  });

  it("resolves a host-owned path to the verbatim URL, stem from the last segment", () => {
    expect(resolveDatasetRef("/api/workspaces/name/sql-basics/datasets/books")).toEqual({
      url: "/api/workspaces/name/sql-basics/datasets/books",
      id: "books",
    });
    expect(
      resolveDatasetRef("https://example.com/datasets/books.json?v=abc"),
    ).toEqual({ url: "https://example.com/datasets/books.json?v=abc", id: "books" });
  });

  it("fetches a host-owned location verbatim and parses with the derived stem", async () => {
    const spy = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(VALID), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const fixture = await fetchDataset("/datasets/ecommerce");
    expect(spy).toHaveBeenCalledWith("/datasets/ecommerce");
    expect(fixture.id).toBe("ecommerce");
  });

  it("reports the looked-at URL on a host 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 404 })),
    );
    await expect(fetchDataset("/datasets/books")).rejects.toThrow(
      "The dataset \"books\" didn't load — nothing was served at /datasets/books. Check that the dataset is installed there, then reload the page.",
    );
  });

  it("keeps the fixture-relative 404 wording for bare slugs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 404 })),
    );
    await expect(fetchDataset("books")).rejects.toThrow(
      "The dataset \"books\" didn't load — nothing was served at fixtures/books.json. Check that the dataset is installed there, then reload the page.",
    );
  });
});
