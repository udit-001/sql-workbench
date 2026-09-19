/**
 * Standalone adapter: the docs/demo page IS the component (one build).
 * This module registers the element and applies URL params to the hero
 * bench; the page markup in index.html places every instance.
 */
import "./sql-workbench";

const params = new URLSearchParams(location.search);
const hero = document.getElementById("hero");

// ?mode=card flips the hero to the drill variant; ?sql= pre-fills it.
if (params.get("mode")) hero?.setAttribute("mode", params.get("mode")!);
const sqlParam = params.get("sql");
if (sqlParam && hero) hero.setAttribute("sql", sqlParam);
const fixtureParam = params.get("dataset") ?? params.get("fixture");
if (fixtureParam && hero) hero.setAttribute("dataset", fixtureParam);
