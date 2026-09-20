// Assembles the Pages site in dist/ from: the released component file
// (already downloaded into dist/ by pages.yml), the docs page markup
// (index.html, repointed from the dev entries to the two built files),
// the docs bundle, and the fixtures.
import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";

mkdirSync("dist", { recursive: true });

let html = readFileSync("index.html", "utf8");
const devEntries =
  '<script type="module" src="/src/main.ts"></script>\n    <script type="module" src="/src/docs.ts"></script>';
const prodEntries =
  '<script type="module" src="./sql-workbench.js"></script>\n    <script type="module" src="./docs.js"></script>';
if (!html.includes(devEntries)) throw new Error("index.html dev entries missing or drifted");
html = html.replace(devEntries, prodEntries);
writeFileSync("dist/index.html", html);

// Standalone page: replace dev entry with released component.
let standalone = readFileSync("standalone.html", "utf8");
const standaloneDevEntry = '<script type="module" src="/src/main.ts"></script>';
const standaloneProdEntry = '<script type="module" src="./sql-workbench.js"></script>';
if (!standalone.includes(standaloneDevEntry)) throw new Error("standalone.html dev entry missing or drifted");
standalone = standalone.replace(standaloneDevEntry, standaloneProdEntry);
writeFileSync("dist/standalone.html", standalone);

cpSync("public/fixtures", "dist/fixtures", { recursive: true });
cpSync("public/og-image.png", "dist/og-image.png");
console.log("pages assembled in dist/");
