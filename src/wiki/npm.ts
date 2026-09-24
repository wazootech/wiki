/**
 * npm package entrypoint — future replacement for the `npm/` wrapper.
 *
 * The published `wazootech-wiki` npm package is currently a process wrapper:
 * it locates Python, builds a private venv, installs the matching PyPI
 * distribution, and shells out (`npm/setup.js`, `npm/python.js`). Once the
 * parity gate passes, `npm/src/index.ts` re-exports this module and the package
 * ships the engine itself instead of a launcher for a Python one.
 *
 * This module exists now so the intended npm surface is explicit and
 * typechecked. It deliberately lives under `src/` rather than `npm/src/`: the
 * `npm/` tree is still built with `tsup`/`prettier`/`eslint` against the
 * Node-only `tsconfig.json`, which has no `Deno` globals. See
 * `docs/adr/0001-deno-rewrite.md`.
 */
export { main, PROG_NAME } from "./cli.ts";
export { VERSION } from "./version.ts";
