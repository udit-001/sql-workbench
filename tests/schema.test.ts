import { describe, expect, it } from "vitest";
import { loadSchema } from "../src/bench-kit/schema";
import { FakeEngine, errorOutcome, okOutcome } from "../src/bench-kit/fake-engine";
import type { Outcome } from "../src/bench-kit/engine";

/** Canned introspection replies mimicking a real seeded SQLite database. */
function seededEngine(tables: Record<string, { columns: [string, string][]; rows: number }>) {
  return new FakeEngine((sql): Outcome => {
    if (sql.includes("sqlite_master")) {
      const names = Object.keys(tables).sort();
      return okOutcome({
        columns: ["name"],
        rows: names.map((n) => [n]),
        ms: 1,
      });
    }
    const tableMatch = /table_info\("([^"]+)"\)/.exec(sql);
    if (tableMatch?.[1]) {
      const table = tables[tableMatch[1]];
      if (!table) return errorOutcome(`no such table: ${tableMatch[1]}`);
      return okOutcome({
        columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
        rows: table.columns.map(([name, type], i) => [i, name, type, 0, null, i === 0 ? 1 : 0]),
        ms: 1,
      });
    }
    const countMatch = /COUNT\(\*\) FROM "([^"]+)"/.exec(sql);
    if (countMatch?.[1]) {
      const table = tables[countMatch[1]];
      if (!table) return errorOutcome(`no such table: ${countMatch[1]}`);
      return okOutcome({ columns: ["COUNT(*)"], rows: [[table.rows]], ms: 1 });
    }
    return errorOutcome(`unexpected sql in test: ${sql}`);
  });
}

describe("loadSchema", () => {
  it("lists tables alphabetically with columns and live row counts", async () => {
    const engine = seededEngine({
      orders: { columns: [["id", "INTEGER"], ["total_amount", "REAL"]], rows: 8 },
      customers: { columns: [["id", "INTEGER"], ["region", "TEXT"]], rows: 5 },
    });

    const schema = await loadSchema(engine);

    expect(schema.map((t) => t.name)).toEqual(["customers", "orders"]);
    expect(schema[0]).toEqual({
      name: "customers",
      rowCount: 5,
      columns: [
        { name: "id", type: "INTEGER" },
        { name: "region", type: "TEXT" },
      ],
    });
    // introspection went through the public Engine seam only
    expect(engine.calls.some((c) => c.includes("sqlite_master"))).toBe(true);
  });

  it("returns an empty list for an empty database without throwing", async () => {
    const schema = await loadSchema(seededEngine({}));
    expect(schema).toEqual([]);
  });

  it("propagates an engine failure instead of rendering a partial panel", async () => {
    const broken = new FakeEngine(() => errorOutcome("database disk image is malformed"));
    await expect(loadSchema(broken)).rejects.toThrow("database disk image is malformed");
  });
});
