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

/* Copy buttons on the docs page's code blocks. */
for (const pre of document.querySelectorAll("pre")) {
  const btn = document.createElement("button");
  btn.className = "copy-btn";
  btn.textContent = "Copy";
  btn.setAttribute("aria-label", "Copy code to clipboard");
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector("code")?.innerText ?? pre.innerText);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Ctrl+C"; // clipboard blocked (permissions/fallback)
    }
    setTimeout(() => (btn.textContent = "Copy"), 1400);
  });
  pre.append(btn);
}
