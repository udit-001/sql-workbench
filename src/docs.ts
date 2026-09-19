/**
 * Docs-page logic (copy buttons, URL-param wiring) — loaded only by the
 * Pages site, never by the component bundle. Scope guards keep it inert
 * if a marker element is missing.
 */
if ((window as unknown as { __docsWired?: boolean }).__docsWired) {
  throw undefined; // already wired (dev bundles us; Pages loads us standalone)
}
(window as unknown as { __docsWired?: boolean }).__docsWired = true;

const params = new URLSearchParams(location.search);
const hero = document.getElementById("hero");

// ?mode=card flips the hero to the drill variant; ?sql= pre-fills it.
if (params.get("mode")) hero?.setAttribute("mode", params.get("mode")!);
const sqlParam = params.get("sql");
if (sqlParam && hero) hero.setAttribute("sql", sqlParam);
const fixtureParam = params.get("dataset") ?? params.get("fixture");
if (fixtureParam && hero) hero.setAttribute("dataset", fixtureParam);

/* Copy buttons on code blocks marked data-copy. */
for (const pre of document.querySelectorAll<HTMLElement>("pre[data-copy]")) {
  if (pre.querySelector(".copy-btn")) continue;
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
