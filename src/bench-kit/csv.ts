/**
 * CSV → SQLite import plumbing (LEARN-204). Parsing and SQL generation are
 * pure so tests cover every rule the learner's data goes through:
 * RFC4180-style quoting, per-column type inference, identifier
 * sanitisation, and literal escaping.
 */

export interface CsvParseOptions {
  delimiter: string;
  hasHeader: boolean;
}

export interface ParsedCsv {
  columns: string[];
  /** Raw field values as text; empty fields stay "" until script building. */
  rows: string[][];
}

/** How much leading text the binary sniff inspects. */
const BINARY_SNIFF_BYTES = 8192;

/**
 * Binary sniff over a leading sample: NUL bytes or a meaningful share of
 * C0 control characters (anything but tab/newline) or U+FFFD replacement
 * markers mean this decoded as a binary file, not text. Catches images,
 * PDFs and zips dropped onto the bench — including ones renamed to .csv.
 * Text files, even odd ones, never come close to the threshold.
 */
function isProbablyBinary(sample: string): boolean {
  if (sample.includes("\0")) return true; // includes UTF-16 exports — re-save as UTF-8
  let suspicious = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0xfffd || (code < 32 && code !== 9 && code !== 10 && code !== 13)) suspicious++;
  }
  return suspicious / sample.length > 0.05;
}

/** Parse CSV text with RFC4180 quoting: "…" may span lines; "" escapes '"'. */
export function parseCsv(text: string, options: CsvParseOptions): ParsedCsv {
  const { delimiter, hasHeader } = options;
  if (!text.trim()) throw new Error("The file looks empty — nothing to import.");
  if (isProbablyBinary(text.slice(0, BINARY_SNIFF_BYTES))) {
    throw new Error(
      "This file looks binary (an image, PDF, or zip?) rather than plain-text CSV — export it as UTF-8 CSV and try again.",
    );
  }

  const records = splitRecords(text, delimiter);
  const first = records[0];
  if (!first) throw new Error("The file looks empty — nothing to import.");

  const fieldCount = first.length;
  records.forEach((record, i) => {
    if (record.length !== fieldCount) {
      throw new Error(
        `Line ${i + 1} has ${record.length} field${record.length === 1 ? "" : "s"} but expected ${fieldCount}. Check the delimiter setting.`,
      );
    }
  });

  const rawColumns = hasHeader ? records[0] : null;
  const rows = hasHeader ? records.slice(1) : records;

  const seen = new Map<string, number>();
  const columns = (rawColumns ?? []).map((name) => {
    const base = sanitizeColumnName(name);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
  if (!hasHeader) {
    for (let i = 0; i < fieldCount; i++) columns.push(`col${i + 1}`);
  }

  return { columns, rows };
}

function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === delimiter) {
      record.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\n" || char === "\r") {
      // CRLF counts as one terminator.
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }

  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Identifiers become SQL names AND sidebar/diagram labels — keep them UI-width. */
const MAX_IDENTIFIER_LENGTH = 48;

/**
 * Table/column names become SQL identifiers: lowercase [a-z0-9_] only,
 * can't start with a digit. Anything else collapses to `_`; empty gets
 * the caller's fallback (tables `t`, columns `col`). Length is capped so
 * a 200-character filename can't blow out the schema panel or diagram.
 */
function sanitizeIdentifier(raw: string, fallback: string, digitPrefix: string): string {
  const name = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_IDENTIFIER_LENGTH)
    .replace(/_+$/, "");
  if (!name) return fallback;
  return /^\d/.test(name) ? `${digitPrefix}${name}` : name;
}

export function sanitizeTableName(raw: string): string {
  return sanitizeIdentifier(raw, "t", "t_");
}

export function sanitizeColumnName(raw: string): string {
  return sanitizeIdentifier(raw, "col", "c_");
}

const INT_RE = /^[+-]?\d+$/;
const REAL_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * One transactional script: drop any previous version of the table,
 * CREATE with inferred column types, INSERT every row. Empty fields
 * import as NULL — the bench's teaching semantics for "no value".
 */
export function buildImportScript(tableName: string, parsed: ParsedCsv): string {
  const types = parsed.columns.map((_, colIndex) => inferType(parsed.rows, colIndex));
  const lines: string[] = ["BEGIN;", `DROP TABLE IF EXISTS "${tableName}";`];

  lines.push(`CREATE TABLE "${tableName}" (`);
  lines.push(
    parsed.columns.map((col, i) => `  "${col}" ${types[i]}`).join(",\n"),
  );
  lines.push(");");

  if (parsed.rows.length > 0) {
    const columnList = parsed.columns.map((col) => `"${col}"`).join(", ");
    for (const row of parsed.rows) {
      const values = row.map((value, i) => sqlLiteral(value, types[i] ?? "TEXT")).join(", ");
      lines.push(`INSERT INTO "${tableName}" (${columnList}) VALUES (${values});`);
    }
  }

  lines.push("COMMIT;");
  return lines.join("\n");
}

function inferType(rows: string[][], colIndex: number): "INT" | "REAL" | "TEXT" {
  let sawDecimal = false;
  for (const row of rows) {
    const value = (row[colIndex] ?? "").trim();
    if (value === "") continue;
    if (!REAL_RE.test(value)) return "TEXT";
    if (!INT_RE.test(value)) sawDecimal = true;
  }
  return sawDecimal ? "REAL" : "INT";
}

function sqlLiteral(raw: string, type: "INT" | "REAL" | "TEXT"): string {
  const value = raw.trim();
  if (value === "") return "NULL";
  if (type !== "TEXT") return value; // already validated numeric by inference
  return `'${value.replace(/'/g, "''")}'`;
}
