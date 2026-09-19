/**
 * Theme controller for a mounted bench (component + standalone share it).
 *
 * Precedence, verified live against the Pharos dashboard:
 *   1. explicit override (theme attribute / setTheme / local toggle)
 *   2. the shared `pharos_theme` localStorage key — holds the host's MODE
 *      ('system' | 'light' | 'dark'), resolved against the OS preference
 *   3. the host document's resolved theme (html[data-theme])
 *   4. the OS preference
 *
 * Follows three live sources — relay messages (LEARN-205 contract),
 * html[data-theme] mutations, and OS changes — and never writes the
 * shared key when hosted (LEARN-224: the key holds the host's mode; a
 * resolved value written over 'system' would freeze the host's theme).
 * Standalone owns the key and keeps the old persist-on-toggle behavior.
 */
import {
  ownsSharedThemeKey,
  resolveTheme,
  SHARED_THEME_KEY,
  themeFromMessage,
  type Theme,
} from "./theme";

export interface ThemeController {
  /** The bench's resolved theme right now. */
  readonly current: Theme;
  /** Force a theme; clears host-following until cleared. */
  set(theme: Theme): void;
  /** Drop the explicit override and re-follow the host. */
  followHost(): void;
  /** Remove every listener/observer. */
  dispose(): void;
}

/* ── Standalone theme chrome ──────────────────────────────────────────

   Two adapters read and write the shared key the same way — the bench's
   own ◐ toggle (below) and the docs page's header ◐ (src/docs.ts). The
   write rules and the read precedence therefore live here, next to the
   embed contract they implement, not duplicated in the adapters. */

/** Standalone only (LEARN-224): persist the user's chosen MODE and
 *  mirror it on the document element. Hosted benches must not call this
 *  — the key holds the host's mode. */
export function persistSharedTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(SHARED_THEME_KEY, theme);
}

/** The resolved theme a standalone document is showing right now: the
 *  shared key's mode if explicit, else the document element's, else the
 *  OS preference — the same precedence the controller resolves per
 *  bench. Reads state, writes nothing. */
export function sharedResolvedTheme(): Theme {
  const documentTheme = document.documentElement.dataset.theme;
  return resolveTheme({
    stored: localStorage.getItem(SHARED_THEME_KEY),
    ...(documentTheme ? { documentTheme } : {}),
    prefersDark: window.matchMedia("(prefers-color-scheme:dark)").matches,
  });
}

export function createThemeController(
  apply: (theme: Theme) => void,
  opts: { initialExplicit?: Theme | null } = {},
): ThemeController {
  let explicit: Theme | null = opts.initialExplicit ?? null;

  const media = window.matchMedia("(prefers-color-scheme:dark)");
  const current = (): Theme => explicit ?? sharedResolvedTheme();

  const reapply = () => {
    if (!explicit) apply(current());
  };

  apply(current());

  const onSystemChange = reapply;
  media.addEventListener("change", onSystemChange);

  const htmlObserver = new MutationObserver(reapply);
  htmlObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const onMessage = (event: MessageEvent) => {
    const theme = themeFromMessage(event.data);
    if (theme && !explicit) apply(theme);
  };
  window.addEventListener("message", onMessage);

  return {
    get current() {
      return current();
    },
    set(theme: Theme) {
      explicit = theme;
      apply(theme);
      if (ownsSharedThemeKey()) {
        // Standalone: the shared key is ours to write (demo persistence).
        persistSharedTheme(theme);
      }
    },
    followHost() {
      explicit = null;
      apply(current());
    },
    dispose() {
      media.removeEventListener("change", onSystemChange);
      htmlObserver.disconnect();
      window.removeEventListener("message", onMessage);
    },
  };
}
