/**
 * SQL tokenizer for the editor overlay (LEARN-210). Pure and alignment-
 * critical: tokens concatenate to exactly the input — the highlighted
 * layer sits behind a transparent-text textarea, so any dropped,
 * reordered, or normalised character would misalign every glyph after it.
 *
 * Grammar (deliberately small): keywords, numbers, 'strings' with ''
 * escapes, -- line comments, /* block comments *​/ with no terminator
 * requirement (unterminated runs to EOF), identifiers/words, operators,
 * punctuation. Everything else is preserved verbatim as its own token.
 */

export type SqlTokenKind =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "word"
  | "operator"
  | "punctuation"
  | "whitespace"
  | "newline";

export interface SqlToken {
  kind: SqlTokenKind;
  text: string;
}

const KEYWORDS = new Set([
  "select", "from", "where", "group", "by", "order", "having", "limit", "offset",
  "join", "inner", "left", "right", "full", "outer", "cross", "on", "using",
  "as", "and", "or", "not", "null", "is", "in", "like", "glob", "between",
  "exists", "case", "when", "then", "else", "end", "distinct", "all", "union",
  "except", "intersect", "insert", "into", "values", "update", "set", "delete",
  "create", "table", "drop", "alter", "index", "view", "with", "recursive",
  "primary", "key", "foreign", "references", "unique", "check", "default",
  "asc", "desc", "if",
]);

/** Functions get keyword coloring too — they're the visual anchors of a query. */
const FUNCTIONS = new Set([
  "count", "sum", "avg", "min", "max", "round", "abs", "length", "lower",
  "upper", "substr", "coalesce", "ifnull", "nullif", "cast", "date", "strftime",
]);

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isWordStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isWordChar(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

export function highlightSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;

  const push = (kind: SqlTokenKind, start: number, end: number): void => {
    if (end > start) tokens.push({ kind, text: sql.slice(start, end) });
  };

  while (i < sql.length) {
    const char = sql.charAt(i);

    // whitespace / newline runs
    if (char === "\n") {
      let end = i;
      while (end < sql.length && sql.charAt(end) === "\n") end++;
      push("newline", i, end);
      i = end;
      continue;
    }
    if (/\s/.test(char)) {
      let end = i;
      while (end < sql.length && /\s/.test(sql.charAt(end)) && sql.charAt(end) !== "\n") end++;
      push("whitespace", i, end);
      i = end;
      continue;
    }

    // line comment
    if (char === "-" && sql.charAt(i + 1) === "-") {
      let end = i;
      while (end < sql.length && sql.charAt(end) !== "\n") end++;
      push("comment", i, end);
      i = end;
      continue;
    }

    // block comment — unterminated runs to EOF (still renders as a comment)
    if (char === "/" && sql.charAt(i + 1) === "*") {
      let end = i + 2;
      while (end < sql.length && !(sql.charAt(end) === "*" && sql.charAt(end + 1) === "/")) end++;
      end = Math.min(end + 2, sql.length);
      push("comment", i, end);
      i = end;
      continue;
    }

    // string literal — '' escapes a quote; unterminated runs to EOF
    if (char === "'") {
      let end = i + 1;
      while (end < sql.length) {
        if (sql.charAt(end) === "'" && sql.charAt(end + 1) === "'") {
          end += 2;
          continue;
        }
        if (sql.charAt(end) === "'") {
          end++;
          break;
        }
        end++;
      }
      push("string", i, Math.min(end, sql.length));
      i = Math.min(end, sql.length);
      continue;
    }

    // quoted identifier — colored as a word, consumed as one unit
    if (char === '"') {
      let end = i + 1;
      while (end < sql.length) {
        if (sql.charAt(end) === '"' && sql.charAt(end + 1) === '"') {
          end += 2;
          continue;
        }
        if (sql.charAt(end) === '"') {
          end++;
          break;
        }
        end++;
      }
      push("word", i, Math.min(end, sql.length));
      i = Math.min(end, sql.length);
      continue;
    }

    // number: digits, decimals like .5, floats 12.5
    if (isDigit(char) || (char === "." && isDigit(sql.charAt(i + 1)))) {
      let end = i;
      while (end < sql.length && /[0-9.eE+-]/.test(sql.charAt(end))) {
        // stop +/- unless directly following e/E exponent marker
        if ((sql.charAt(end) === "+" || sql.charAt(end) === "-") && !/[eE]/.test(sql.charAt(end - 1))) break;
        end++;
      }
      push("number", i, end);
      i = end;
      continue;
    }

    // word / keyword
    if (isWordStart(char)) {
      let end = i + 1;
      while (end < sql.length && isWordChar(sql.charAt(end))) end++;
      const word = sql.slice(i, end).toLowerCase();
      push(KEYWORDS.has(word) || FUNCTIONS.has(word) ? "keyword" : "word", i, end);
      i = end;
      continue;
    }

    // operators vs punctuation
    if ("=<>+-*/%".includes(char)) {
      let end = i + 1;
      // multi-char operators: <= >= <> != ||
      if (end < sql.length && "=<>|+".includes(sql.charAt(end))) end++;
      push("operator", i, end);
      i = end;
      continue;
    }
    if (/[,;().]/.test(char)) {
      push("punctuation", i, i + 1);
      i++;
      continue;
    }

    push("operator", i, i + 1);
    i++;
  }

  return tokens;
}
