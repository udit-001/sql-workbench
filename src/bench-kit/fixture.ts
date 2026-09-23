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
      `Asked for the "${requestedId}" dataset, but the fixture says "${id}" — the fixture's id must match its name ("${id}.json"),`,
    );
  }

  if (f.kind !== "sqlite-dataset") {
    fail(
      `This fixture's "kind" is ${JSON.stringify(f.kind ?? null)} — this bench only loads "sqlite-dataset". Set the kind, then reload the page.`,
    );
  }

  if (f.version !== 1) {
    fail(
      `This fixture is version ${JSON.stringify(f.version ?? null)} — this bench loads version 1 only. Update the fixture, then reload the page.`,
    );
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

/** Fetch + parse a dataset by reference. A bare slug fetches
 *  `fixtures/<id>.json` relative to the deployed app root (Pages demo,
 *  standalone); a root-relative path or absolute URL is fetched verbatim —
 *  the host owns storage and serving (pharos keeps datasets in its
 *  workspace API), and the bench only needs the bytes + the shape contract.
 *  The stem id comes from the reference itself, so the id==stem invariant
 *  and the journal's dataset id hold across both forms. */
export interface DatasetRef {
  /** Fetch URL, verbatim for host-owned locations. */
  url: string;
  /** Stem id: the slug, or the host path's last segment minus .json. */
  id: string;
}

export function resolveDatasetRef(ref: string): DatasetRef {
  const clean = ref.split(/[?#]/, 1)[0] ?? ref;
  if (!SLUG.test(clean)) {
    const segments = clean.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    return { url: ref, id: last.replace(/\.json$/, "") };
  }
  return { url: `fixtures/${encodeURIComponent(clean)}.json`, id: clean };
}

export async function fetchDataset(ref: string): Promise<Fixture> {
  const { url, id } = resolveDatasetRef(ref);
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new FixtureError(
      `The dataset "${id}" didn't load — ${url} is unreachable (${(err as Error)?.message ?? String(err)}). Check the address, then reload the page.`,
    );
  }
  if (response.status === 404) {
    throw new FixtureError(
      `The dataset "${id}" didn't load — nothing was served at ${url}. Check that the dataset is installed there, then reload the page.`,
    );
  }
  if (!response.ok) {
    throw new FixtureError(
      `The dataset "${id}" didn't load — ${url} returned HTTP ${response.status}. Check the server, then reload the page.`,
    );
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    throw new FixtureError(
      `The dataset "${id}" didn't load — ${url} didn't return JSON (${(err as Error)?.message ?? String(err)}). Fix the file, then reload the page.`,
    );
  }
  return parseFixture(raw, id);
}
