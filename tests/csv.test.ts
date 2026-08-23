import { describe, expect, it } from "vitest";
import {
  buildImportScript,
  parseCsv,
  sanitizeColumnName,
  sanitizeTableName,
} from "../src/bench-kit/csv";

describe("parseCsv", () => {
  it("parses simple comma rows with a header", () => {
    const parsed = parseCsv("date,region,amount\n2024-01-03,south_asia,98\n2024-01-04,europe,29.5", {
      delimiter: ",",
      hasHeader: true,
    });
    expect(parsed.columns).toEqual(["date", "region", "amount"]);
    expect(parsed.rows).toEqual([
      ["2024-01-03", "south_asia", "98"],
      ["2024-01-04", "europe", "29.5"],
    ]);
  });

  it("treats every row as data when there is no header", () => {
    const parsed = parseCsv("a,b\nc,d", { delimiter: ",", hasHeader: false });
    expect(parsed.columns).toEqual(["col1", "col2"]);
    expect(parsed.rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("honors quoted fields containing commas, newlines and doubled quotes", () => {
    const parsed = parseCsv('name,note\n"Smith, Ada""s","line1\nline2"', {
      delimiter: ",",
      hasHeader: true,
    });
    expect(parsed.rows).toEqual([['Smith, Ada"s', "line1\nline2"]]);
  });

  it("handles CRLF line endings and a trailing newline", () => {
    const parsed = parseCsv("a,b\r\n1,2\r\n3,4\r\n", { delimiter: ",", hasHeader: true });
    expect(parsed.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("supports semicolon and tab delimiters", () => {
    const semi = parseCsv("a;b\n1;2", { delimiter: ";", hasHeader: true });
    expect(semi.rows).toEqual([["1", "2"]]);

    const tab = parseCsv("a\tb\n1\t2", { delimiter: "\t", hasHeader: true });
    expect(tab.rows).toEqual([["1", "2"]]);
  });

  it("rejects ragged rows naming the first bad line", () => {
    expect(() => parseCsv("a,b,c\n1,2\n", { delimiter: ",", hasHeader: true })).toThrow(
      /line 2.*expected 3/i,
    );
  });

  it("rejects empty input", () => {
    expect(() => parseCsv("", { delimiter: ",", hasHeader: true })).toThrow(/empty/i);
  });
});

describe("type inference (via buildImportScript)", () => {
  const script = (csv: string) =>
    buildImportScript("t", parseCsv(csv, { delimiter: ",", hasHeader: true }));

  it("infers INT only when every non-empty value is integral", () => {
    expect(script("n\n1\n-7\n")).toContain('"n" INT');
  });

  it("infers REAL when any value is decimal", () => {
    expect(script("v\n1\n2.5\n")).toContain('"v" REAL');
  });

  it("keeps mixed alphanumeric columns TEXT", () => {
    expect(script("v\n12ab\n3\n")).toContain('"v" TEXT');
  });

  it("imports empty fields as NULL in all column types", () => {
    const s = script("a,b,c\n,5,\n");
    expect(s).toContain("NULL, 5, NULL");
  });

  it("doubles single quotes inside text values", () => {
    const s = script("who\nO'Brien\n");
    expect(s).toContain("'O''Brien'");
  });
});

describe("identifier sanitizers", () => {
  it.each([
    ["My Sales 2024!", "my_sales_2024"],
    ["99 balloons", "t_99_balloons"],
    [" déjà vu", "d_j_vu"],
    ["ALREADY_OK", "already_ok"],
  ])("maps table name %j to %j", (raw, expected) => {
    expect(sanitizeTableName(raw)).toBe(expected);
  });

  it.each([
    ["Order ID", "order_id"],
    ["2nd col", "c_2nd_col"],
    ["", "col"],
  ])("maps column %j to %j", (raw, expected) => {
    expect(sanitizeColumnName(raw)).toBe(expected);
  });

  it("deduplicates colliding column names", () => {
    const parsed = parseCsv("amount,amount,\n1,2,3\n", { delimiter: ",", hasHeader: true });
    expect(parsed.columns).toEqual(["amount", "amount_2", "col"]);
  });
});

describe("buildImportScript", () => {
  it("wraps the import in a transaction and drops any previous version", () => {
    const s = buildImportScript(
      "my_sales",
      parseCsv("a,b\n1,x\n", { delimiter: ",", hasHeader: true }),
    );
    expect(s.startsWith("BEGIN;")).toBe(true);
    expect(s).toContain('DROP TABLE IF EXISTS "my_sales";');
    expect(s.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("creates the table then inserts one row per record", () => {
    const csv = 'qty,label\n3,"say ""hi"""\n';
    const s = buildImportScript("t", parseCsv(csv, { delimiter: ",", hasHeader: true }));
    expect(s).toContain('CREATE TABLE "t" (\n  "qty" INT,\n  "label" TEXT\n);');
    expect(s).toContain(`INSERT INTO "t" ("qty", "label") VALUES (3, 'say "hi"');`);
  });
});
