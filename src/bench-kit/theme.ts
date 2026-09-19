/**
 * Embed-contract theme sync (LEARN-197/205): the Pharos dashboard relays
 * exactly one message into embedded benches —
 *   { type: "theme", theme: "dark" | "light" }
 * (see learn-tool internal/web/pharos-theme.js). No handshake, no other
 * messages; FOUC on load reads the shared pharos_theme localStorage key.
 */

export type Theme = "dark" | "light";

/** The shared localStorage key: holds the host's MODE ('system' | 'light'
 *  | 'dark'). The FOUC guard in index.html repeats this string by
 *  necessity — it must run before any module loads. */
export const SHARED_THEME_KEY = "pharos_theme";

/** Returns the theme when `data` is a valid relay message, else undefined. */
export function themeFromMessage(data: unknown): Theme | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const message = data as Record<string, unknown>;
  if (
    message.type === "theme" &&
    (message.theme === "dark" || message.theme === "light")
  ) {
    return message.theme;
  }
  return undefined;
}

/* ── Theme resolution for embedded use (component mount) ──────────────

   Precedence, verified live against the Pharos dashboard:
   1. explicit `theme` attribute on the element
   2. the shared `pharos_theme` localStorage key — holds the user's MODE
      ('system' | 'light' | 'dark'), resolved against the OS preference
   3. the host document's resolved theme (html[data-theme])
   4. the OS preference

   The controller NEVER writes `pharos_theme` when hosted (LEARN-224):
   the key holds the host's mode, and a resolved value written over
   'system' would freeze the host's theme. Standalone keeps the old
   read-modify-write — it owns the key there. */

export type ThemeInput = {
  /** Explicit theme attribute ('light' | 'dark'), else undefined. */
  explicit?: Theme;
  /** Raw value of the pharos_theme key ('system' | 'light' | 'dark' | null). */
  stored: string | null;
  /** Resolved theme on the host document element, if any. */
  documentTheme?: string;
  /** Whether the OS prefers dark. */
  prefersDark: boolean;
};

export function resolveTheme(input: ThemeInput): Theme {
  if (input.explicit) return input.explicit;
  const stored = input.stored;
  if (stored === "light" || stored === "dark") return stored;
  if (input.documentTheme === "light" || input.documentTheme === "dark") {
    return input.documentTheme;
  }
  return input.prefersDark ? "dark" : "light";
}

/** True when this bench owns the shared key: top-level document, no host. */
export function ownsSharedThemeKey(): boolean {
  return typeof window === "undefined" || window.parent === window;
}
