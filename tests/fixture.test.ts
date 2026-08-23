import { describe, expect, it } from "vitest";
import { FixtureError, parseFixture } from "../src/bench-kit/fixture";

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
      /"shop" but this file is "ecommerce"/,
    );
  });

  it("rejects unknown kinds with what v1 supports", () => {
    expect(() => parse({ ...VALID, kind: "py-module" })).toThrow(
      /py-module.*sqlite-dataset/,
    );
  });

  it("rejects versions other than 1", () => {
    expect(() => parse({ ...VALID, version: 2 })).toThrow(/version 2.*expected version 1/);
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
