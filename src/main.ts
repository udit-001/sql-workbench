/**
 * Dev entry: registers the component from source. The Pages site loads
 * the released sql-workbench.js instead (vite builds from
 * src/sql-workbench.ts directly); index.html loads docs.ts itself.
 *
 * Also owns the standalone page's dataset picker. It lives here rather
 * than in a page module of its own because main.ts is already the only
 * entry standalone.html loads — a second module would mean a second build
 * artifact in release.yml/pages.yml for a few dozen lines. index.html
 * loads this file too, so the picker sits behind a scope guard and stays
 * inert when its marker element is absent (the docs.ts guard pattern).
 */
// Order matters: ./dataset-param must be imported BEFORE ./sql-workbench.
// ES modules evaluate imports in source order, and ./sql-workbench calls
// customElements.define — which upgrades and mounts every matching element
// on the spot. dataset-param has to land the ?dataset= attribute in the
// gap between the DOM existing and the element being defined.
import "./dataset-param";
import { datasetParamSlug } from "./dataset-param";
import { SqlWorkbench } from "./sql-workbench";
import { isDatasetSlug } from "./bench-kit/fixture";

/** The bundled fixtures in teaching order, not alphabetical: a ladder from
 *  "your first query" to "real analysis", then a tier for "here is a schema
 *  you would meet at work". A disabled placeholder leads, because the bench
 *  boots empty and the prompt is the invitation to make the first pick. */
const SAMPLES: { slug: string; label: string }[] = [
  { slug: "bookshop", label: "Bookshop — your first queries" },
  { slug: "ecommerce", label: "E-commerce — your first JOIN" },
  { slug: "bike-rentals", label: "Bike rentals — joins & groups" },
  { slug: "food-delivery", label: "Food delivery — analysis" },
  { slug: "chinook", label: "Chinook — a real music-store schema" },
];

function wireDatasetPicker(): void {
  const picker = document.getElementById("dataset-picker");
  if (!(picker instanceof HTMLSelectElement)) return; // not the standalone page
  const bench = document.querySelector<SqlWorkbench>("sql-workbench");
  if (!bench) {
    console.warn("[standalone] #dataset-picker present but no <sql-workbench> — ignoring");
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Load a dataset…";
  placeholder.disabled = true;
  placeholder.selected = true;
  picker.append(placeholder);
  for (const sample of SAMPLES) {
    const option = document.createElement("option");
    option.value = sample.slug;
    option.textContent = sample.label;
    picker.append(option);
  }

  // ?dataset= was already reflected onto the element by ./dataset-param,
  // before the custom element was defined — setting it here would be too
  // late (the bench has already mounted) and the page would boot empty.
  // The picker only has to show the truth. A slug the list does not know (a
  // host-added fixture) still needs an option, or the select would display
  // nothing while a dataset is loaded.
  if (datasetParamSlug) {
    if (!SAMPLES.some((s) => s.slug === datasetParamSlug)) {
      const option = document.createElement("option");
      option.value = datasetParamSlug;
      option.textContent = datasetParamSlug;
      picker.append(option);
    }
    picker.value = datasetParamSlug;
  }

  picker.addEventListener("change", () => {
    const slug = picker.value;
    if (!isDatasetSlug(slug)) return;
    // Set the attribute and the URL only once the switch has landed, so a
    // failed load leaves the picker and the URL describing what is actually
    // in the database.
    void bench
      .setDataset(slug)
      .then((id) => {
        bench.setAttribute("dataset", id);
        const url = new URL(location.href);
        url.searchParams.set("dataset", id);
        history.replaceState(null, "", url);
      })
      .catch((err: unknown) => {
        picker.value = bench.getAttribute("dataset") ?? "";
        console.error("[standalone] dataset switch failed", err);
      });
  });
}

wireDatasetPicker();
