/**
 * Dev entry: registers the component from source and loads the docs-page
 * logic. The Pages site loads the released sql-workbench.js alongside a
 * standalone docs bundle instead — docs.ts is idempotent, so the two
 * loading paths never double-attach.
 */
import "./sql-workbench";
import "./docs";
