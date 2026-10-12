import { assert, assertEquals } from "@std/assert";
import { Wiki } from "../src/wiki/mod.ts";

// The docs list the methods of the `Wiki` class by name. Reflect on the real
// class so a rename or removal fails here instead of drifting (#391).
const instance = new Set(
  Object.getOwnPropertyNames(Wiki.prototype).filter((n) => n !== "constructor"),
);
const statics = new Set(Object.getOwnPropertyNames(Wiki));

const DOCS: Array<[string, RegExp]> = [
  ["README.md", /Methods cover the library surface:[\s\S]*?`Wiki\.load`/],
  [
    "docs/wiki/TypeScript_API_Reference.md",
    /Every operation is a typed method[\s\S]*?`Wiki\.load`/,
  ],
];

for (const [path, pattern] of DOCS) {
  Deno.test(`${path} documents only Wiki methods that exist`, () => {
    const text = Deno.readTextFileSync(path);
    const match = text.match(pattern);
    assert(match, `${path}: method list not found`);
    const names = [...match[0].matchAll(/`([A-Za-z_.]+)`/g)].map((m) => m[1]!);
    assert(names.length > 10, `${path}: parsed only ${names.length} names`);
    for (const name of names) {
      if (name === "Wiki") continue;
      if (name.startsWith("Wiki.")) {
        assert(statics.has(name.slice(5)), `${path}: no static ${name}`);
      } else {
        assert(instance.has(name), `${path}: no method Wiki#${name}`);
      }
    }
  });
}

Deno.test("CLI-only commands are not Wiki methods", () => {
  for (const name of ["fmt", "mcp", "upgrade"]) {
    assertEquals(instance.has(name), false, name);
  }
});
