/**
 * Deno resolves imports from `deno.json`, Bun from `package.json`. Until Deno
 * is gone both list the engine's dependencies, so they must name the same ones.
 */
import * as sys from "../src/wiki/sys.ts";
import { test } from "node:test";
import { assertEquals } from "@std/assert";

type Specs = Record<string, string>;

async function readJson<T>(path: string): Promise<T> {
  const url = new URL(`../${path}`, import.meta.url);
  return JSON.parse(await sys.readTextFile(url)) as T;
}

/** The `package.json` spec that matches a `deno.json` import specifier. */
function packageSpec(name: string, specifier: string): string {
  const parts = /^(npm|jsr):(.+)@([^@]+)$/.exec(specifier);
  if (parts === null) throw new Error(`unpinned import ${name}: ${specifier}`);
  const [, registry, target, version] = parts as unknown as string[];
  if (registry === "jsr") {
    return `npm:@jsr/${target!.slice(1).replace("/", "__")}@${version}`;
  }
  return target === name ? version! : `npm:${target}@${version}`;
}

test("package.json lists every deno.json import at the same spec", async () => {
  const deno = await readJson<{ imports: Specs }>("deno.json");
  const pkg = await readJson<{
    dependencies: Specs;
    devDependencies: Specs;
  }>("package.json");
  const declared = { ...pkg.devDependencies, ...pkg.dependencies };
  const names = Object.keys(deno.imports);
  assertEquals(
    Object.fromEntries(names.map((name) => [name, declared[name]])),
    Object.fromEntries(
      names.map((name) => [name, packageSpec(name, deno.imports[name]!)]),
    ),
  );
});
