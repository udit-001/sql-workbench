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
import { ownsSharedThemeKey, resolveTheme, themeFromMessage, type Theme } from "./theme";

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

export function createThemeController(
  apply: (theme: Theme) => void,
  opts: { initialExplicit?: Theme | null } = {},
): ThemeController {
  let explicit: Theme | null = opts.initialExplicit ?? null;

  const media = window.matchMedia("(prefers-color-scheme:dark)");
  const current = (): Theme => {
    const stored = localStorage.getItem("pharos_theme");
    const documentTheme = document.documentElement.dataset.theme;
    return resolveTheme({
      ...(explicit ? { explicit } : {}),
      stored,
      ...(documentTheme ? { documentTheme } : {}),
      prefersDark: media.matches,
    });
  };

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
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("pharos_theme", theme);
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
