import { assertEquals, assertThrows } from "@std/assert";
import {
  OraclePinRequiredError,
  resolveOracle,
  venvWikiBin,
} from "../parity/oracle.ts";

Deno.test("an executable override requires a pinned checkout by default", () => {
  assertThrows(
    () =>
      resolveOracle((name) => name === "WIKI_ORACLE" ? "/tmp/wiki" : undefined),
    OraclePinRequiredError,
    "WIKI_ORACLE_ROOT",
  );
});

Deno.test("an explicit executable override can be checked against its pinned root", () => {
  const oracle = resolveOracle((name) => {
    if (name === "WIKI_ORACLE") return "/custom/wiki";
    if (name === "WIKI_ORACLE_ROOT") return "/pinned/wiki";
    return undefined;
  });

  assertEquals(oracle, { bin: "/custom/wiki", root: "/pinned/wiki" });
});

Deno.test("an unpinned executable override requires explicit drift permission", () => {
  const oracle = resolveOracle(
    (name) => name === "WIKI_ORACLE" ? "/custom/wiki" : undefined,
    true,
  );

  assertEquals(oracle, { bin: "/custom/wiki", root: undefined });
});

Deno.test("a pinned checkout resolves its platform-specific executable", () => {
  const root = "/pinned/wiki";
  const oracle = resolveOracle((name) =>
    name === "WIKI_ORACLE_ROOT" ? root : undefined
  );

  assertEquals(oracle, { bin: venvWikiBin(root), root });
});
