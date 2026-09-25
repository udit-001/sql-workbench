/**
 * Reflect ?dataset= onto <sql-workbench> BEFORE the custom element exists.
 *
 * This module is imported first by main.ts, ahead of ./sql-workbench, and
 * that import order is load-bearing rather than cosmetic. Module scripts
 * are deferred, so the element is already in the DOM here — but the custom
 * element is not defined yet. Attributes are read exactly once, in mount(),
 * and define() upgrades every matching element immediately. So a set that
 * happens after the define lands on an element that has already mounted,
 * and the param does nothing: the bench boots Empty and the URL quietly
 * lies. Setting it here, in the gap between parse and define, is what makes
 * the attribute arrive in time.
 */
import { resolveDatasetParam } from "./bench-kit/dataset-param";

const { slug, rejected } = resolveDatasetParam(location.search);

if (rejected !== null) {
  console.warn(
    "[sql-workbench] ?dataset= takes a fixture slug only (lowercase, digits, hyphens) — ignoring:",
    rejected,
  );
} else if (slug !== null) {
  // The first <sql-workbench> is the page's primary bench on both pages that
  // load main.ts. Multi-bench pages keep their per-element `dataset`
  // attributes; a query string can only name one dataset anyway.
  document.querySelector("sql-workbench")?.setAttribute("dataset", slug);
}

/** The slug this page booted with, for chrome that has to reflect it. */
export const datasetParamSlug = slug;
