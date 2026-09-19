/**
 * Standalone adapter: the full-page app on GitHub Pages is the component
 * itself (one implementation, two adapters — LEARN-194). This file only
 * reads the URL params the standalone surface supports and mounts the
 * element; everything else lives in the component + mount().
 */
import "./sql-workbench";

const params = new URLSearchParams(location.search);
const bench = document.createElement("sql-workbench");
if (params.get("mode")) bench.setAttribute("mode", params.get("mode")!);
if (params.get("fixture")) bench.setAttribute("fixture", params.get("fixture")!);
document.body.append(bench);
