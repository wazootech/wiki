import { assertEquals } from "@std/assert";
import { VERSION } from "../src/wiki/version.ts";

const ROOT = new URL("../", import.meta.url);

/** Read the top-level `version` field of a JSON file in the repo. */
async function jsonVersion(path: string): Promise<string> {
  const parsed: unknown = JSON.parse(
    await Deno.readTextFile(new URL(path, ROOT)),
  );
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${path} did not parse as a JSON object`);
  }
  const version = (parsed as Record<string, unknown>).version;
  if (typeof version !== "string") {
    throw new Error(`${path} has no string "version" field`);
  }
  return version;
}

/** Read `[project] version` from pyproject.toml without a TOML dependency. */
async function pyprojectVersion(path: string): Promise<string> {
  const text = await Deno.readTextFile(new URL(path, ROOT));
  const match = /^version = "([^"]+)"/m.exec(text);
  const version = match?.[1];
  if (version === undefined) {
    throw new Error(`${path} has no [project] version`);
  }
  return version;
}

// The migration keeps several version surfaces in lockstep. These three are the
// ones the Deno side can read without a Python toolchain, so they double as the
// seed of the CLI↔types drift check that replaces `npm/test-cli-drift.js` and
// `tests/test_version.py` at cutover.

Deno.test(
  "VERSION matches deno.json",
  { permissions: { read: true } },
  async () => {
    assertEquals(VERSION, await jsonVersion("deno.json"));
  },
);

Deno.test(
  "VERSION matches package.json",
  { permissions: { read: true } },
  async () => {
    assertEquals(VERSION, await jsonVersion("package.json"));
  },
);

Deno.test(
  "VERSION matches pyproject.toml",
  { permissions: { read: true } },
  async () => {
    assertEquals(VERSION, await pyprojectVersion("pyproject.toml"));
  },
);
