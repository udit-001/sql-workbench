/**
 * Docs-page logic (copy buttons, URL-param wiring) — loaded only by the
 * Pages site, never by the component bundle. Scope guards keep it inert
 * if a marker element is missing.
 */
if ((window as unknown as { __docsWired?: boolean }).__docsWired) {
  throw undefined; // already wired (dev bundles us; Pages loads us standalone)
}
(window as unknown as { __docsWired?: boolean }).__docsWired = true;

import { persistSharedTheme, sharedResolvedTheme } from "./bench-kit/theme-controller";

const params = new URLSearchParams(location.search);
const hero = document.getElementById("hero");

// ?mode=card flips the hero to the drill variant; ?sql= pre-fills it.
if (params.get("mode")) hero?.setAttribute("mode", params.get("mode")!);
const sqlParam = params.get("sql");
if (sqlParam && hero) hero.setAttribute("sql", sqlParam);
const fixtureParam = params.get("dataset") ?? params.get("fixture");
if (fixtureParam && hero) hero.setAttribute("dataset", fixtureParam);

/* Header ◐ button — page chrome over the bench's standalone theme
   contract (LEARN-224): resolve with the shared precedence, persist the
   chosen mode. Benches on the page follow the document element through
   the controller's MutationObserver. */
const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    persistSharedTheme(sharedResolvedTheme() === "dark" ? "light" : "dark");
  });
}

/* Mobile sections menu (≤640px): the toc row hides and the header
   disclosure takes clones of the same links — one source of truth for
   section navigation. Contract: #nav-menu > .nav-list receives .toc a.
   Close on selection, outside tap, or Escape. */
const navMenu = document.getElementById("nav-menu") as HTMLDetailsElement | null;
const tocList = document.querySelector(".toc");
if (navMenu && tocList) {
  const navList = navMenu.querySelector(".nav-list");
  const links = [...tocList.querySelectorAll("a")].map((a) => a.cloneNode(true));
  if (!navList || links.length === 0) {
    // An empty mobile menu ships invisibly broken — fail loud instead.
    console.warn("[docs] #nav-menu out of sync with .toc — mobile section menu will be empty");
  } else {
    navList.append(...links);
    const closeMenu = () => navMenu.removeAttribute("open");
    navMenu.addEventListener("click", (e) => {
      if ((e.target as Element).closest("a")) closeMenu();
    });
    document.addEventListener("click", (e) => {
      if (navMenu.open && !navMenu.contains(e.target as Node)) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
  }
}

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
