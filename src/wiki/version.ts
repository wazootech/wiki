/**
 * Engine version, mirrored from `deno.json#version`.
 *
 * `tests/version_test.ts` asserts this constant against `deno.json`,
 * `package.json`, `package-lock.json`, and `docs/wiki/wiki.md`.
 *
 * Kept as a literal rather than read from `deno.json` at runtime so that
 * `deno compile` binaries need no filesystem access to report their version.
 */
export const VERSION = "0.1.24";
