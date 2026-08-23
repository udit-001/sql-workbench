/**
 * Embed-contract theme sync (LEARN-197/205): the Pharos dashboard relays
 * exactly one message into embedded benches —
 *   { type: "theme", theme: "dark" | "light" }
 * (see learn-tool internal/web/pharos-theme.js). No handshake, no other
 * messages; FOUC on load reads the shared pharos_theme localStorage key.
 */

export type Theme = "dark" | "light";

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
