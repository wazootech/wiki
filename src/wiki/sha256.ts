/**
 * SHA-256, synchronously.
 *
 * The wiki fingerprint is a SHA-256 digest computed from inside synchronous
 * code: `load_graph`, `set_disk_graph`, and every cache lookup derive it.
 * `node:crypto` is a Deno built-in and its `createHash` is synchronous, so it
 * satisfies that constraint without a hand-rolled compression function.
 */
import { createHash } from "node:crypto";

/** The SHA-256 hex digest of a UTF-8 string or raw bytes. */
export function sha256Hex(message: string | Uint8Array): string {
  return createHash("sha256").update(message).digest("hex");
}
