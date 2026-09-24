/**
 * Engine version, mirrored from `deno.json#version`.
 *
 * The Python→Deno migration keeps several version surfaces in lockstep
 * (`pyproject.toml`, `package.json`, `package-lock.json`, `uv.lock`,
 * `src/wiki/__init__.py`, `docs/wiki/wiki.md`, and now `deno.json`).
 * `tests/version_test.ts` asserts this constant against the surfaces that are
 * cheap to read from Deno; the remaining ones stay enforced by the release
 * helper until the cutover retires them. See `docs/adr/0001-deno-rewrite.md`.
 *
 * Kept as a literal rather than read from `deno.json` at runtime so that
 * `deno compile` binaries need no filesystem access to report their version.
 */
export const VERSION = "0.1.23";
