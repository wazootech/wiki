/**
 * Engine version, mirrored from `jsr.json#version`.
 *
 * `tests/version_test.ts` asserts this constant against `jsr.json`,
 * `package.json`, and `docs/wiki/wiki.md`.
 *
 * Kept as a literal rather than read from `jsr.json` at runtime so that
 * compiled binaries need no filesystem access to report their version.
 */
export const VERSION = "0.7.2";
