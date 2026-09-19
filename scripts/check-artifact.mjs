// Fails the build if the component artifact leaked docs-page logic.
// The component runs on arbitrary host pages and must not touch their DOM.
import { readFileSync } from "node:fs";

const MARKERS = ["data-copy", "__docsWired", "copy-btn", "docs.js"];
const js = readFileSync("dist/sql-workbench.js", "utf8");
const leaked = MARKERS.filter((m) => js.includes(m));
if (leaked.length) {
  console.error(`artifact leak: docs-page markers found in dist/sql-workbench.js: ${leaked.join(", ")}`);
  process.exit(1);
}
console.log("artifact clean: no docs-page logic");
