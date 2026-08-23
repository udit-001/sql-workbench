# Diagram-Design — SVG Design Reference (cloned to /tmp/diagram-design)

## What the repo is
`cathrynlavery/diagram-design` is an MIT-licensed **Claude "skill"** that generates branded technical
diagrams as single self-contained HTML files with inline SVG. It is not an app; it's a design system +
prompt/reference library. Everything visual lives in `skills/diagram-design/`.

## Files Retrieved
1. `skills/diagram-design/references/style-guide.md` (all 140 lines) — the token source of truth: colors, typography, stroke/radius/spacing tables.
2. `skills/diagram-design/SKILL.md` (lines ~150–330) — SVG primitives: arrow markers, node box pattern, label masking, 6 connector rules, 4px grid.
3. `skills/diagram-design/references/type-db-schema.md` (48 lines) — THE spec for table-box + column-level FK diagrams.
4. `skills/diagram-design/references/type-er.md` (25 lines) — entity-level variant (cardinality `1/N`, fields as plain list).
5. `skills/diagram-design/references/type-architecture.md` (lines 1–80) — elbow path formula, bridge/hop primitive, zone grouping.
6. `skills/diagram-design/assets/example-db-schema.html` (lines ~60–120) — working reference: real table boxes with header band, PK/UQ/NN chips, FK elbows, ON DELETE labels.
7. `skills/diagram-design/assets/example-er.html` (lines ~70–120) — entity box with ENTITY eyebrow header, field rows in mono.
8. `skills/diagram-design/assets/template.html` (86 lines) — minimal light page shell.

## Architecture / how it works
Each diagram = one HTML file: Google Fonts link → CSS vars (`--color-paper` etc.) → `.frame` wrapper
with eyebrow + Instrument Serif `<h1>` → one `<svg viewBox="...">`. Z-order convention:
**bg rect → schema-group rects → arrows/connectors → arrow labels (masked) → boxes** ("draw arrows before boxes").

## Key Code

### Color tokens (light default)
```
paper   #f5f5f5   page bg, default node fill     paper-2 #ececec
ink     #2d3142   primary text/stroke            muted   #4f5d75   secondary text, default arrows
soft    #7a8399   sublabels                      rule    rgba(45,49,66,0.12)
rule-solid #bfc0c0                               accent  #eb6c36 (1–2 focal elements MAX)
accent-tint rgba(235,108,54,0.08)                link    #2e5aa8
```
Dark mode inversion rule: any `rgba(45,49,66,X)` → `rgba(245,245,245,X)` same opacity; accent brightens to `#f08a59`; dark paper `#2d3142`, dark ink `#f5f5f5`, dark muted `#bfc0c0`.

### Typography
```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```
| Role | Family | Size | Weight |
|---|---|---|---|
| Page title | Instrument Serif | 1.75rem | 400 |
| Node/table name | Geist sans | 12px | 600 |
| Field type / sublabel | Geist Mono | 9–10px | 400 |
| Eyebrow/tag chips | Geist Mono | 7–8px | 500, letter-spacing .08–.18em, uppercase |
| Arrow labels | Geist Mono | 8px | 400, letter-spacing .06em |

Rule: **mono only for technical content** (types, ports, SQL); human names in Geist sans. Never JetBrains Mono. No shadows ever — borders only.

### Arrow markers (define all three)
```svg
<marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
  <polygon points="0 0, 8 3, 0 6" fill="#4f5d75"/></marker>
<!-- arrow-accent fill=#eb6c36 ; arrow-link fill=#2e5aa8 -->
```

### Orthogonal elbow connector formula (r=8), from type-architecture.md
```svg
<path d="M x1,y1 H mid-8 Q mid,y1 mid,y1+8 V y2-8 Q mid,y2 mid+8,y2 H x2"
      fill="none" stroke="#4f5d75" stroke-width="1" marker-end="url(#arrow)"/>
```
Crossing arrows: bridge the less-important one with `a 8,8 0 0,1 16,0` semicircular hop.

### Table box anatomy (from example-db-schema.html, exact snippet)
```svg
<rect x="40" y="80" width="240" height="100" rx="6" fill="#ffffff" stroke="#2d3142" stroke-width="1"/>
<rect x="40" y="80" width="240" height="28" rx="6" fill="rgba(45,49,66,0.04)" stroke="none"/>  <!-- header band -->
<line x1="40" y1="108" x2="280" y2="108" stroke="rgba(45,49,66,0.22)" stroke-width="1"/>       <!-- hairline -->
<text x="52" y="98" fill="#2d3142" font-size="12" font-weight="600" font-family="'Geist', sans-serif">public.customers</text>
<rect x="228" y="88" width="40" height="12" rx="2" fill="none" stroke="rgba(45,49,66,0.40)" stroke-width="0.8"/> <!-- TABLE tag -->
<text x="268" y="124" fill="#4f5d75" font-size="9" font-family="'Geist Mono', monospace" text-anchor="end">uuid</text>  <!-- type right-aligned -->
<rect x="160" y="116" width="20" height="12" rx="2" fill="none" stroke="rgba(45,49,66,0.35)" stroke-width="0.8"/> <!-- constraint chip -->
<text x="170" y="125" ... font-size="8">PK</text>
```
Column rows are fixed **24px tall** so FK connectors can anchor at row centres predictably. Even-row zebra: `rgba(45,49,66,0.02)`.

### Edge label masking (mandatory)
```svg
<rect x="MID_X-56" y="ARROW_Y-20" width="112" height="12" rx="2" fill="#f5f5f5"/>
<text x="MID_X" y="ARROW_Y-11" fill="#4f5d75" font-size="8" font-family="'Geist Mono', monospace"
      text-anchor="middle" letter-spacing="0.06em">ON DELETE RESTRICT</text>
```
Mask must keep a visible **6–10px gap** from its own line; never overlap a node drawn after it.

### Schema group container
```svg
<rect ... rx="8" fill="rgba(45,49,66,0.02)" stroke="rgba(45,49,66,0.20)" stroke-width="0.8" stroke-dasharray="4,4"/>
<text ... fill="#4f5d75" font-size="8" font-family="'Geist Mono'" letter-spacing="0.14em">BILLING</text>
```
Drawn first so tables paint over it.

## Spacing rules
- **4px grid hard rule**: all coords/sizes/gaps/font-sizes divisible by 4 (stroke widths 0.8/1/1.2 exempt).
- Gaps between nodes: 20/24/32/40/48. Box padding 8/12/16. Radii: 4 (tags) / 6 (nodes) / 8 (containers).
- Stroke widths: thin 0.8, default 1, strong 1.2. Dashed semantics: `4,3` optional/async; `4,4` boundaries.
- Fan-out on a shared edge: attach points ≥12px apart, offset `L·k/(N+1)`; two FKs on one row offset ±8px around row centre.
- Background: clean paper rect, no dot grid by default (opt-in 22×22 dot pattern at `rgba(45,49,66,0.10)`).
- Complexity budget for db-schema: max 5 tables, 8 columns shown, 6 FK edges, 2 accent elements; ER: max 8 entities.

## Design Recipe (ordered rules for an ER/FK diagram matching this language)
1. Single self-contained HTML; load Instrument Serif + Geist + Geist Mono via Google Fonts; CSS vars for tokens.
2. Tokens: paper `#f5f5f5` bg; ink `#2d3142`; muted `#4f5d75`; accent `#eb6c36` on ≤2 focal elements; white `#ffffff` node fills; hairlines `rgba(45,49,66,.12–.22)`.
3. Z-order: paper rect → group rects → connectors → masked edge labels → table boxes.
4. Tables: 240-ish wide rects, `rx=6`, `fill=#ffffff`, `stroke=#2d3142`, `stroke-width=1`; header band `rgba(45,49,66,0.04)` ~24–28px tall with hairline below; name in Geist 12px w600 left, small `rx=2` TABLE tag top-right; body rows exactly 24px tall; column name Geist 12px left, SQL type Geist Mono 9px right-anchored muted; PK/FK/UQ/NN chips as 20×12 `rx=2` outlined mono tags.
5. FK edges: orthogonal rounded elbows (Q corners, r=8) from row-centre to row-centre, `stroke=#4f5d75 stroke-width=1`; the one destructive/cascading FK gets `#eb6c36 @ 1.2`.
6. Every edge label ("ON DELETE CASCADE") in Geist Mono 8px tracked .06em, on an opaque paper mask rect with 6–10px gap above/beside its line.
7. Define all three markers (muted/accent/link), 8×6 polygon, refX=7 refY=3.
8. Schema groups: dashed `4,4` `rx=8` rect at 2% ink wash, mono uppercase eyebrow label, painted first.
9. Obey the 4px grid everywhere; gaps ≥20 between tables; fan shared attach points ≥12px apart; never diagonal lines; hop (`a 8,8`) when paths must cross; no shadows anywhere.
10. Page chrome: mono eyebrow ("Database schema · Diagram Design") + Instrument Serif h1; accessible SVG with prefixed `<title>`/`<desc>` and `role="img"`.

## Start Here
Open `/tmp/diagram-design/skills/diagram-design/assets/example-db-schema.html` — it is a complete, working instance of exactly the target artifact (tables + column-level FK arrows) and should be imitated directly.

## Acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "context.md contains concrete findings with exact file paths, code excerpts, hex/px values extracted from style-guide.md, SKILL.md, type-db-schema.md, example-db-schema.html"
    }
  ],
  "changedFiles": [
    "/home/udit/Dev/personal/sql-workbench/context.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git clone --depth 1 https://github.com/cathrynlavery/diagram-design /tmp/diagram-design",
      "result": "passed",
      "summary": "repo cloned successfully"
    },
    {
      "command": "cat/wc/sed/grep over style-guide.md, SKILL.md, type-*.md, template.html, example-db-schema.html, example-er.html",
      "result": "passed",
      "summary": "full design system, connector rules, and reference examples inspected"
    }
  ],
  "validationOutput": [
    "All quoted snippets verified against cloned source files in /tmp/diagram-design"
  ],
  "residualRisks": [
    "Repo notes pre-baked assets/example-*.html were built under an earlier skin; style-guide.md tokens are authoritative where they differ"
  ],
  "noStagedFiles": true,
  "diffSummary": "Added context.md design-reference findings document",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": ""
}
```

---

## Application to the bench (LEARN-209)

- Structure/anatomy/stroke rules ported verbatim; colors resolve through Nord CSS vars instead of the repo's paper/ink palette.
- Google Fonts (Instrument Serif/Geist) intentionally NOT loaded — the offline-first precache rule (LEARN-194) forbids network font fetches; system Inter/mono stacks stand in.
- Edge labels ("ON DELETE …") deferred: our seed fixtures don't declare referential actions; revisit if fixtures grow them.
- Renderer is lazy (draws on first tab activation): SVG text measurement returns 0 inside display:none panes.
