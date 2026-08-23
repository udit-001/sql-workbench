/**
 * Beginner-friendly error explanations (LEARN-211). The Outcome's verbatim
 * message is never touched — journal and agent contract stay byte-exact.
 * This layer only ADDS a plain-language diagnosis and, when the loaded
 * schema can offer one, a "did you mean" suggestion.
 */

export interface ErrorContext {
  tables: string[];
  columns: string[];
}

export interface ErrorHint {
  title: string;
  suggestion?: string;
}

const EMPTY_CONTEXT: ErrorContext = { tables: [], columns: [] };

export function explainSqlError(
  message: string,
  context: ErrorContext = EMPTY_CONTEXT,
): ErrorHint | undefined {
  const msg = message.toLowerCase();

  let match = /no such column: ([^\s"]+)/.exec(msg);
  if (match) {
    const name = match[1] ?? "";
    const suggestion = suggestName(name, context.columns);
    return {
      title: `There's no column called “${name}”`,
      suggestion: suggestion
        ? `Did you mean “${suggestion}”?`
        : "Check the spelling — or the column may live in another table (try a JOIN).",
    };
  }

  match = /no such table: ([^\s"]+)/.exec(msg);
  if (match) {
    const name = match[1] ?? "";
    const suggestion = suggestName(name, context.tables);
    return {
      title: `There's no table called “${name}”`,
      suggestion: suggestion
        ? `Did you mean “${suggestion}”?`
        : "Check the spelling — the tables in this dataset are listed in the schema panel.",
    };
  }

  if (/must appear in the group by/.test(msg)) {
    return {
      title: "Every selected column must be grouped",
      suggestion:
        "Either add it to GROUP BY, or wrap it in an aggregate like COUNT() or MAX().",
    };
  }

  if (/aggregate function|misuse of aggregate/.test(msg)) {
    return {
      title: "Aggregates like SUM() can't be filtered in WHERE",
      suggestion: "Move that condition into HAVING — it runs after groups are formed.",
    };
  }

  match = /ambiguous column name: ([^\s"]+)/.exec(msg);
  if (match) {
    return {
      title: `“${match[1]}” exists in more than one table`,
      suggestion: "Prefix it with a table or alias — for example o.customer_id.",
    };
  }

  match = /unique constraint failed: ([\w.]+)/.exec(msg);
  if (match) {
    return {
      title: "That value already exists",
      suggestion: `${match[1]} must stay unique — change the value or remove the duplicate row.`,
    };
  }

  match = /not null constraint failed: ([\w.]+)/.exec(msg);
  if (match) {
    return {
      title: `${match[1]} is required`,
      suggestion: "Give that column a value — it can't be NULL.",
    };
  }

  if (/foreign key constraint failed/.test(msg)) {
    return {
      title: "That row is referenced by another table",
      suggestion:
        "Add the related row first (or remove the rows pointing at it), then retry.",
    };
  }

  if (/incomplete input/.test(msg)) {
    return {
      title: "The query ends too soon",
      suggestion:
        "Something is left open — count your parentheses and make sure every quote closes.",
    };
  }

  match = /unrecognized token: "(.+)"/.exec(msg);
  if (match) {
    return {
      title: `SQLite doesn't recognize “${match[1]}”`,
      suggestion: "There's likely a stray character right before this position.",
    };
  }

  match = /no such function: ([^\s"]+)/.exec(msg);
  if (match) {
    const name = match[1] ?? "";
    return {
      title: `There's no function called “${name}”`,
      suggestion: "Check the spelling — SQLite's function names are things like ROUND, SUM, UPPER.",
    };
  }

  return undefined;
}

/**
 * Nearest real name within a small edit budget; ties resolve
 * alphabetically so suggestions are deterministic.
 */
export function suggestName(input: string, candidates: string[]): string | undefined {
  const target = input.toLowerCase();
  let best: { name: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = editDistance(target, candidate.toLowerCase());
    const limit = Math.max(2, Math.floor(candidate.length / 3));
    if (distance > limit) continue;
    if (!best || distance < best.distance || (distance === best.distance && candidate < best.name)) {
      best = { name: candidate, distance };
    }
  }
  return best?.name;
}

function editDistance(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1).fill(0);
  const curr = new Array<number>(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  const at = (row: number[], index: number): number => row[index] ?? 0;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        at(prev, j) + 1,
        at(curr, j - 1) + 1,
        at(prev, j - 1) + substitutionCost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = at(curr, j);
  }
  return at(prev, b.length);
}
