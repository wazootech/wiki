import * as sys from "../src/wiki/sys.ts";
import { test } from "node:test";
import { assertEquals } from "@std/assert";
import { parse as parseToml } from "@std/toml";
import { VERSION } from "../src/wiki/version.ts";

const ROOT = new URL("../", import.meta.url);

async function jsonVersion(path: string): Promise<string> {
  const value: unknown = JSON.parse(
    await sys.readTextFile(new URL(path, ROOT)),
  );
  if (typeof value !== "object" || value === null) {
    throw new Error(`${path} did not parse as an object`);
  }
  const version = (value as Record<string, unknown>).version;
  if (typeof version !== "string") {
    throw new Error(`${path} has no string version`);
  }
  return version;
}

test("VERSION matches deno.json", async () => {
  assertEquals(VERSION, await jsonVersion("deno.json"));
});

test("VERSION matches package.json", async () => {
  assertEquals(VERSION, await jsonVersion("package.json"));
});

test("VERSION matches pyproject.toml", async () => {
  const project = parseToml(
    await sys.readTextFile(new URL("pyproject.toml", ROOT)),
  ).project as { version?: unknown } | undefined;
  assertEquals(project?.version, VERSION);
});

test("VERSION matches the docs wiki metadata", async () => {
  const text = await sys.readTextFile(new URL("docs/wiki/wiki.md", ROOT));
  const match = /^softwareVersion:\s*(\S+)/m.exec(text);
  assertEquals(match?.[1], VERSION);
});
