import { assertEquals } from "@std/assert";
import { VERSION } from "../src/wiki/version.ts";

const ROOT = new URL("../", import.meta.url);

async function jsonVersion(path: string): Promise<string> {
  const value: unknown = JSON.parse(
    await Deno.readTextFile(new URL(path, ROOT)),
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

Deno.test("VERSION matches deno.json", async () => {
  assertEquals(VERSION, await jsonVersion("deno.json"));
});

Deno.test("VERSION matches package.json", async () => {
  assertEquals(VERSION, await jsonVersion("package.json"));
});

Deno.test("VERSION matches package-lock.json", async () => {
  const lock: unknown = JSON.parse(
    await Deno.readTextFile(new URL("package-lock.json", ROOT)),
  );
  if (typeof lock !== "object" || lock === null) {
    throw new Error("package-lock.json did not parse as an object");
  }
  const root = (lock as { packages?: Record<string, { version?: string }> })
    .packages?.[""];
  assertEquals(root?.version, VERSION);
});

Deno.test("VERSION matches the docs wiki metadata", async () => {
  const text = await Deno.readTextFile(
    new URL("docs/wiki/wiki.md", ROOT),
  );
  const match = /^softwareVersion:\s*(\S+)/m.exec(text);
  assertEquals(match?.[1], VERSION);
});
