/**
 * <sql-workbench> — the whole bench as a drop-in custom element.
 *
 * One script tag + one element (single-file build, LEARN-194):
 *   <script type="module" src=".../sql-workbench.js"></script>
 *   <sql-workbench mode="card" theme="dark" db="lesson-3"></sql-workbench>
 *
 * Attributes (mode, theme, db, fixture) mirror MountOptions; theme and
 * mode react live, db and fixture are read at connect (changing them
 * remounts only via element replacement). The bench renders in a shadow
 * root — its styles cannot leak out and host styles cannot leak in.
 * Every journaled event re-dispatches as a `workbench-event` CustomEvent
 * so hosts can react without reaching inside.
 */
import { mount, type WorkbenchHandle } from "./app";
import styles from "./styles.css?inline";
import type { Theme } from "./bench-kit/theme";

export class SqlWorkbench extends HTMLElement {
  static observedAttributes = ["mode", "theme"];

  private handle: WorkbenchHandle | null = null;
  private wrapper: HTMLElement | null = null;

  connectedCallback(): void {
    if (this.handle) return;
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    this.wrapper = document.createElement("div");
    shadow.append(style, this.wrapper);

    const mode = this.getAttribute("mode");
    const theme = this.getAttribute("theme");
    const db = this.getAttribute("db");
    const fixture = this.getAttribute("fixture");
    this.handle = mount(this.wrapper, {
      ...(mode ? { mode } : {}),
      ...(theme === "light" || theme === "dark" ? { theme: theme as Theme } : {}),
      ...(db ? { db } : {}),
      ...(fixture ? { fixture } : {}),
      inlineWorker: true, // single-file contract: no side requests (LEARN-194)
      onEvent: (event) => {
        this.dispatchEvent(new CustomEvent("workbench-event", { detail: event }));
      },
    });
  }

  protected attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this.handle) return;
    if (name === "theme" && (value === "light" || value === "dark")) {
      this.handle.setTheme(value);
    }
    if (name === "mode") {
      if (value === "card") this.wrapper?.setAttribute("data-mode", "card");
      else this.wrapper?.removeAttribute("data-mode");
    }
  }

  disconnectedCallback(): void {
    this.handle?.dispose();
    this.handle = null;
    this.wrapper = null;
  }

  /** Run SQL as if typed into the editor. */
  run(sql: string): ReturnType<WorkbenchHandle["run"]> {
    return this.require().run(sql);
  }

  /** Restore the current dataset's seed data. */
  reset(): Promise<void> {
    return this.require().reset();
  }

  /** The whole session journal as Markdown. */
  exportMarkdown(): Promise<string> {
    return this.require().exportMarkdown();
  }

  private require(): WorkbenchHandle {
    if (!this.handle) throw new Error("sql-workbench is not connected");
    return this.handle;
  }
}

if (!customElements.get("sql-workbench")) {
  customElements.define("sql-workbench", SqlWorkbench);
}
