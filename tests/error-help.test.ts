import { describe, expect, it } from "vitest";
import { explainSqlError, suggestName } from "../src/bench-kit/error-help";

const SCHEMA = {
  tables: ["customers", "orders", "order_items", "products"],
  columns: [
    "id", "name", "region", "signup_date",
    "customer_id", "order_date", "status", "total_amount", "shipped_at",
    "product_id", "quantity", "unit_price", "list_price",
  ],
};

describe("suggestName", () => {
  it("finds a close match for a typo", () => {
    expect(suggestName("total_amnt", SCHEMA.columns)).toBe("total_amount");
    expect(suggestName("regon", SCHEMA.columns)).toBe("region");
  });

  it("returns undefined when nothing is close", () => {
    expect(suggestName("zzzzzzz", SCHEMA.columns)).toBeUndefined();
  });

  it("is case-insensitive on the lookup side", () => {
    expect(suggestName("REGON", SCHEMA.columns)).toBe("region");
  });
});

describe("explainSqlError", () => {
  it("explains no-such-column and suggests the nearest real column", () => {
    const hint = explainSqlError(
      "SQLITE_ERROR: sqlite3 result code 1: no such column: total_amnt",
      SCHEMA,
    );
    expect(hint?.title).toMatch(/no column/i);
    expect(hint?.suggestion).toContain("total_amount");
  });

  it("explains no-such-column without inventing suggestions when nothing matches", () => {
    const hint = explainSqlError("no such column: zzz", SCHEMA);
    expect(hint?.title).toMatch(/no column/i);
    expect(hint?.suggestion).toMatch(/spelling/i);
  });

  it("fuzzy-matches only the bare column when a qualifier is present", () => {
    const hint = explainSqlError("no such column: c.regio", SCHEMA);
    expect(hint?.title).toContain("c.regio");
    expect(hint?.suggestion).toContain("region");
  });

  it("flags a wrong alias when the bare column exists", () => {
    const hint = explainSqlError("no such column: c.region", SCHEMA);
    expect(hint?.title).toContain("c.region");
    expect(hint?.suggestion).toMatch(/exists.*wrong table or alias/s);
  });

  it("explains no-such-table with suggestions", () => {
    const hint = explainSqlError("no such table: orderz", SCHEMA);
    expect(hint?.suggestion).toContain("orders");
  });

  it("explains aggregate-in-WHERE as a HAVING move", () => {
    const hint = explainSqlError(
      "misuse of aggregate function SUM()",
      SCHEMA,
    );
    expect(hint?.title).toMatch(/aggregate/i);
    expect(hint?.suggestion).toContain("HAVING");
  });

  it("explains GROUP BY coverage errors", () => {
    const hint = explainSqlError(
      "column customers.name must appear in the GROUP BY clause or be used in an aggregate function",
      SCHEMA,
    );
    expect(hint?.title).toMatch(/group/i);
  });

  it("explains ambiguous column names", () => {
    const hint = explainSqlError("ambiguous column name: id", SCHEMA);
    expect(hint?.suggestion).toMatch(/alias|table/i);
  });

  it("explains constraint failures plainly", () => {
    expect(explainSqlError("UNIQUE constraint failed: orders.id", SCHEMA)?.title).toMatch(/already exists/i);
    expect(explainSqlError("NOT NULL constraint failed: customers.name", SCHEMA)?.title).toMatch(/required/i);
    expect(explainSqlError("FOREIGN KEY constraint failed", SCHEMA)?.title).toMatch(/related row|referenced/i);
  });

  it("explains incomplete input as an unclosed bracket/quote", () => {
    const hint = explainSqlError("incomplete input", SCHEMA);
    expect(hint?.suggestion).toMatch(/parenthes|quote/i);
  });

  it("returns undefined for unrecognized errors so they render verbatim", () => {
    expect(explainSqlError("database disk image is malformed", SCHEMA)).toBeUndefined();
    expect(explainSqlError("", SCHEMA)).toBeUndefined();
  });
});
