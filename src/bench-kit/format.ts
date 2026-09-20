/**
 * User-facing number formatting, in ONE place (SQLWB-7).
 *
 * Convention: en-US, always — a deliberate choice, not an oversight.
 * This is a teaching artifact whose output travels: the journal feeds
 * agent prompts, practice logs get pasted into chats, and the docs site
 * is screenshotted. Byte-stable numbers beat locale-correct ones for all
 * three, and the product copy is English-only. Flip the locale argument
 * here (and only here) if that ever changes.
 */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
