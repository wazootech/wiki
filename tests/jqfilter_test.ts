import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { resolvePath } from "../src/wiki/jqfilter.ts";

Deno.test("resolvePath handles nested keys, wildcards, and indexes", () => {
  const data = {
    users: [
      { name: "Ada", scores: [7, 9] },
      { name: "Lin", scores: [8] },
    ],
  };
  assertEquals(resolvePath(data, "users[].name"), ["Ada", "Lin"]);
  assertEquals(resolvePath(data, "users[0].scores[1]"), [9]);
  assertEquals(resolvePath(data, "users[].scores[]"), [7, 9, 8]);
});

Deno.test("resolvePath supports Unicode keys and absent paths", () => {
  assertEquals(resolvePath({ "naïve": { "名字": "Ada" } }, "naïve.名字"), [
    "Ada",
  ]);
  assertEquals(resolvePath({ users: [] }, "users[].name"), []);
  assertEquals(resolvePath({ value: 1 }, "missing"), []);
  assertEquals(resolvePath(["Ada"], "0"), []);
  assertEquals(resolvePath({}, "toString"), []);
  assertEquals(resolvePath({ value: 1 }, ""), [{ value: 1 }]);
});

Deno.test("resolvePath rejects malformed tokens", () => {
  const error = assertThrows(() =>
    resolvePath({ items: [] }, "items[not-an-index]")
  );
  assert(error instanceof Error);
  assertStringIncludes(error.message, "Invalid path token");
});
