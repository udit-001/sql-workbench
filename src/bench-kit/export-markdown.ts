import type { QueryEvent, WorkbenchEvent } from "./journal";
import { formatCount } from "./format";

/**
 * Standalone export (LEARN-197): the journal as chat-paste-ready Markdown,
 * grouped by day — fenced sql blocks, ✓/✗, rows/ms, verbatim errors.
 * Days run newest-first; entries within a day stay chronological so a
 * reader follows practice in order.
 */
export function eventsToMarkdown(events: WorkbenchEvent[], exportedAt = Date.now()): string {
  const lines: string[] = [
    `# SQL practice — exported ${formatStamp(exportedAt)}`,
    "",
  ];

  if (events.length === 0) {
    lines.push("No practice runs yet.", "");
    return lines.join("\n");
  }

  const byDay = new Map<string, WorkbenchEvent[]>();
  for (const event of events) {
    const day = localDay(event.ts);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(event);
    else byDay.set(day, [event]);
  }

  // Input is newest-first (journal.list()); buckets inherit that, but
  // within a day we restore chronological order.
  for (const [day, dayEvents] of [...byDay.entries()]) {
    lines.push(`## ${day}`, "");
    for (const event of [...dayEvents].sort((a, b) => a.ts - b.ts)) {
      if (event.type === "query") {
        lines.push(...queryLines(event), "");
      } else if (event.type === "csv-import") {
        lines.push(`- imported CSV **${event.name}** (${formatCount(event.rows)} rows)`, "");
      } else {
        lines.push(`- reset sample data **${event.fixture}**`, "");
      }
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");
}

function queryLines(event: QueryEvent): string[] {
  return event.ok
    ? [`✓ ${formatCount(event.rows)} row${event.rows === 1 ? "" : "s"} · ${event.ms} ms`, "", "```sql", event.sql, "```"]
    : [`✗ ${event.error}`, "", "```sql", event.sql, "```"];
}

/** Local calendar day, locale-independent (agent-friendly YYYY-MM-DD). */
function localDay(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatStamp(ts: number): string {
  return `${localDay(ts)} ${new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}
