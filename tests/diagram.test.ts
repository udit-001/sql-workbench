import { describe, expect, it } from "vitest";
import { layoutTables, loadRelations, type Relation, type SchemaTable } from "../src/bench-kit/schema";
import { FakeEngine, errorOutcome, okOutcome } from "../src/bench-kit/fake-engine";
import type { Outcome } from "../src/bench-kit/engine";

describe("loadRelations", () => {
  it("parses PRAGMA foreign_key_list rows into relations", async () => {
    const engine = new FakeEngine((sql) => {
      if (sql.includes("sqlite_master")) {
        return okOutcome({ columns: ["name"], rows: [["orders"]], ms: 1 });
      }
      expect(sql).toContain('PRAGMA foreign_key_list("orders")');
      // row shape: [id, seq, table, from, to, on_update, on_delete, match]
      return okOutcome({
        columns: ["id", "seq", "table", "from", "to", "on_update", "on_delete", "match"],
        rows: [[0, 0, "customers", "customer_id", "id", "NO ACTION", "NO ACTION", "NONE"]],
        ms: 1,
      });
    });

    const relations = await loadRelations(engine);
    expect(relations).toEqual([
      { from: { table: "orders", column: "customer_id" }, to: { table: "customers", column: "id" } },
    ]);
  });

  it("maps an implicit reference (null target column) to an empty string", async () => {
    const engine = new FakeEngine(() =>
      okOutcome({
        columns: ["id", "seq", "table", "from", "to"],
        rows: [[0, 0, "customers", "customer_id", null]],
        ms: 1,
      }),
    );
    const relations = await loadRelations(engine);
    expect(relations[0]?.to.column).toBe("");
  });

  it("returns no relations when no table declares foreign keys", async () => {
    const engine = new FakeEngine(() => okOutcome({ columns: [], rows: [], ms: 1 }));
    expect(await loadRelations(engine)).toEqual([]);
  });
});

const t = (name: string): SchemaTable => ({ name, rowCount: 3, columns: [] });

describe("layoutTables", () => {
  const rel = (fromTable: string, toTable: string): Relation => ({
    from: { table: fromTable, column: "x" },
    to: { table: toTable, column: "y" },
  });

  it("places referenced tables left of referencing ones", () => {
    const tables = [t("orders"), t("order_items"), t("customers")];
    const relations = [rel("orders", "customers"), rel("order_items", "orders")];

    const laid = layoutTables(tables, relations);
    const layerOf = (name: string) => laid.find((n) => n.table.name === name)?.layer;
    expect(layerOf("customers")).toBe(0);
    expect(layerOf("orders")).toBe(1);
    expect(layerOf("order_items")).toBe(2);
  });

  it("keeps cycles and self-references from looping forever", () => {
    const laid = layoutTables([t("a"), t("b"), t("c")], [
      rel("a", "b"),
      rel("b", "a"),
      rel("c", "c"),
    ]);
    expect(laid.every((n) => Number.isInteger(n.layer))).toBe(true);
  });

  it("gives unrelated tables layer 0", () => {
    const laid = layoutTables([t("solo")], []);
    expect(laid).toEqual([{ table: t("solo"), layer: 0 }]);
  });
});
