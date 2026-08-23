# Research: Deployment & distribution

Ticket: LEARN-194 · Resolved: GitHub Pages + same dist as vendored Pharos asset

## Decision

One build output, two distribution surfaces:

```text
dist/
├── GitHub Pages   → standalone, zero-install public app
│                    (Actions workflow deploys on tag push)
└── asset zip      → vendored Pharos asset (`pharos asset add sql-workbench`),
                     served same-origin at
                     /api/lesson-html/{ws}/assets/sql-workbench/index.html
```

## Details

### Standalone hosting — GitHub Pages

- Pages serves `.wasm` with the correct `application/wasm` MIME type and gzip compression (mime-db backed; verified live since 2018).
- Pages **cannot set COOP/COEP headers** → no SharedArrayBuffer. Our engine choice already avoids it (memory DB). This constraint is now a standing rule: *the bundle must never require cross-origin isolation.*
- Deploy: single GitHub Actions workflow building dist + publishing Pages on tagged release. No extra vendor (Netlify/Vercel rejected — adds an account for zero capability gain).

### Offline posture

- Minimal **precache service worker**: app shell + JS + wasm cached on first visit → fully functional offline afterwards. Matches Pharos's vendored/offline principle without install-ceremony UI in v1. No workbox; hand-rolled precache list.

### Pharos asset packaging

- Precedent: `mermaid-lightbox` is a **vendored-only** asset in learn-tool's registry (embedded files, no external download). `sql-workbench` registers the same way: the dist bundle becomes embedded `Files`, so `pharos asset add sql-workbench` works fully offline.
- Lessons embed via root-relative iframe `src` per PAGE-THEME.md conventions; theme arrives via the existing postMessage convention (forwarded into the nested iframe — contract owned by LEARN-197).
- Release workflow additionally attaches `sql-workbench-asset.zip` to GitHub releases so learn-tool can vendor a pinned version.

## Rejected alternatives

- **CDN-loaded engine at runtime** — violates offline principle; wasm must ship with the bundle.
- **Separate builds for web vs Pharos asset** — one dist keeps them identical; embed mode is just URL params.

## Sources

- [WebAssembly spec issue #573](https://github.com/WebAssembly/spec/issues/573) — GH Pages serves `application/wasm` + gzip (confirmed live)
- [GH Pages header limitations](https://stackoverflow.com/questions/79381719/github-pages-page-wrong-mime-type) (community confirmation of non-configurable headers)
- learn-tool `internal/cli/asset_registry.go` — vendored-only asset precedent (`mermaid-lightbox`)
