/**
 * The published JSR package resolves imports from `jsr.json`; Bun and the npm
 * package use `package.json`. Both have to name the same versions.
 */
import * as sys from "../src/wiki/sys.ts";
import { test } from "node:test";
import { assertEquals } from "@std/assert";

type Specs = Record<string, string>;

async function readJson<T>(path: string): Promise<T> {
  const url = new URL(`../${path}`, import.meta.url);
  return JSON.parse(await sys.readTextFile(url)) as T;
}

/** The `package.json` spec that matches a `jsr.json` import specifier. */
function packageSpec(name: string, specifier: string): string {
  const parts = /^(npm|jsr):(.+)@([^@]+)$/.exec(specifier);
  if (parts === null) throw new Error(`unpinned import ${name}: ${specifier}`);
  const [, registry, target, version] = parts as unknown as string[];
  if (registry === "jsr") {
    return `npm:@jsr/${target!.slice(1).replace("/", "__")}@${version}`;
  }
  return target === name ? version! : `npm:${target}@${version}`;
}

test("package.json lists every jsr.json import at the same spec", async () => {
  const jsr = await readJson<{ imports: Specs }>("jsr.json");
  const pkg = await readJson<{
    dependencies: Specs;
    devDependencies: Specs;
  }>("package.json");
  const declared = { ...pkg.devDependencies, ...pkg.dependencies };
  const names = Object.keys(jsr.imports);
  assertEquals(
    Object.fromEntries(names.map((name) => [name, declared[name]])),
    Object.fromEntries(
      names.map((name) => [name, packageSpec(name, jsr.imports[name]!)]),
    ),
  );
});
