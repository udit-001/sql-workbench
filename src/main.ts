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
const fixtureParam = params.get("dataset") ?? params.get("fixture");
if (fixtureParam) bench.setAttribute("dataset", fixtureParam);
const dbParam = params.get("namespace") ?? params.get("db");
if (dbParam) bench.setAttribute("namespace", dbParam);
document.body.append(bench);
