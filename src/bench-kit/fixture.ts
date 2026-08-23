/**
 * Fixture JSON v1 (LEARN-196): a fixture is the reset state, nothing
 * pedagogical. One file per fixture at `fixtures/<id>.json`; the `id` slug
 * MUST equal the filename stem and the `?fixture=` value. v1 ships only
 * `kind: "sqlite-dataset"`; seeds stay plain readable SQL — no base64.
 */

/** Slug rule from LEARN-196: lowercase letters/digits joined by hyphens. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface Fixture {
  id: string;
  kind: "sqlite-dataset";
  title: string;
  description?: string;
  /** Full seed script — CREATE + INSERT statements, executed verbatim on load/reset. */
  sql: string;
}

export class FixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureError";
  }
}

function fail(reason: string): never {
  throw new FixtureError(reason);
}

/**
 * Validate raw parsed JSON against schema v1. `requestedId` is the
 * ?fixture= value the app asked for; a mismatch means wrong file served.
 * Throws FixtureError with a plain-language reason for every failure mode.
 */
export function parseFixture(raw: unknown, requestedId: string): Fixture {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("The fixture file is not a JSON object — expected { … } at the top level.");
  }
  const f = raw as Record<string, unknown>;

  const id = f.id;
  if (typeof id !== "string" || !SLUG.test(id)) {
    fail(
      `Fixture id ${JSON.stringify(id ?? null)} is invalid — use lowercase letters, digits and hyphens (like "ecommerce").`,
    );
  }
  if (id !== requestedId) {
    fail(
      `Asked for fixture "${requestedId}" but this file is "${id}" — the id must match the filename stem.`,
    );
  }

  if (f.kind !== "sqlite-dataset") {
    fail(
      `Unknown fixture kind ${JSON.stringify(f.kind ?? null)} — this bench only loads sqlite-dataset (v1).`,
    );
  }

  if (f.version !== 1) {
    fail(`Unsupported fixture version ${JSON.stringify(f.version ?? null)} — expected version 1.`);
  }

  if (typeof f.title !== "string" || !f.title.trim()) {
    fail("The fixture has no usable \"title\" — add a short human-readable name.");
  }

  if ("encoding" in f) {
    fail(
      "This fixture declares an encoding (base64) — sqlite-dataset seeds must stay plain readable SQL so agents can author and diff them.",
    );
  }

  const reset = f.reset;
  if (typeof reset !== "object" || reset === null || Array.isArray(reset)) {
    fail('The fixture has no "reset" object — add {"reset": {"sql": "CREATE …"}}.');
  }
  const sql = (reset as Record<string, unknown>).sql;
  if (typeof sql !== "string" || !sql.trim()) {
    fail('The fixture\'s "reset.sql" is missing or empty — put the seed SQL there.');
  }

  const description =
    typeof f.description === "string" && f.description.trim() ? f.description : undefined;

  return description === undefined
    ? { id, kind: "sqlite-dataset", title: f.title.trim(), sql }
    : { id, kind: "sqlite-dataset", title: f.title.trim(), description, sql };
}

/** Fetch + parse `fixtures/<id>.json` relative to the deployed app root. */
export async function fetchFixture(id: string): Promise<Fixture> {
  let response: Response;
  try {
    response = await fetch(`fixtures/${encodeURIComponent(id)}.json`);
  } catch (err) {
    throw new FixtureError(
      `Could not fetch fixture "${id}": ${(err as Error)?.message ?? String(err)}`,
    );
  }
  if (response.status === 404) {
    throw new FixtureError(`No fixture named "${id}" was found (looked for fixtures/${id}.json).`);
  }
  if (!response.ok) {
    throw new FixtureError(`Fetching fixture "${id}" failed: HTTP ${response.status}.`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    throw new FixtureError(
      `Fixture "${id}" is not valid JSON: ${(err as Error)?.message ?? String(err)}`,
    );
  }
  return parseFixture(raw, id);
}
