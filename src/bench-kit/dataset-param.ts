/**
 * ?dataset= / ?fixture= resolution — pure, so it is node-testable and the
 * DOM side of it stays three lines.
 *
 * A query string is anonymous input. Only the bare-slug form is allowed:
 * it resolves to this origin's own fixtures/<id>.json. Anything else (an
 * absolute URL, a path) is a host-owned location and does not belong on a
 * public page, so it is rejected rather than fetched. Host-owned URLs stay
 * available where they are legitimate — the `dataset` attribute read by
 * mount(), and `WorkbenchHandle.setDataset()`.
 */
import { isDatasetSlug } from "./fixture";

export interface DatasetParamResult {
  /** The slug to load, or null when there is nothing to load. */
  slug: string | null;
  /** A present-but-rejected value, so the caller can warn about it.
      null when nothing was rejected. */
  rejected: string | null;
}

export function resolveDatasetParam(search: string): DatasetParamResult {
  const params = new URLSearchParams(search);
  const raw = params.get("dataset") ?? params.get("fixture");
  if (!raw) return { slug: null, rejected: null };
  if (!isDatasetSlug(raw)) return { slug: null, rejected: raw };
  return { slug: raw, rejected: null };
}
