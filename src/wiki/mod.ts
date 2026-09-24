/**
 * `@wazoo/wiki` public API surface (JSR entrypoint).
 *
 * The Python engine remains the source of truth for every behaviour until the
 * parity gate passes, so this file only re-exports what has actually been
 * ported. Modules are ported one milestone at a time into this directory
 * alongside their Python counterparts (`audit.py` → `audit.ts`,
 * `graph_cache.py` → `graph_cache.ts`), and the published surface grows with
 * them rather than being scaffolded up front.
 *
 * See `docs/adr/0001-deno-rewrite.md` for the migration decision and the
 * ordering of the remaining work.
 */
export { VERSION } from "./version.ts";
