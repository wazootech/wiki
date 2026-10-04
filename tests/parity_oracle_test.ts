import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { join } from "@std/path";
import {
  ORACLE_PIN,
  OraclePinRequiredError,
  readRevision,
  resolveOracle,
  revisionMatchesPin,
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

Deno.test("the pin comparison accepts an abbreviated revision", () => {
  // `ORACLE_PIN` is a 7-character abbreviation, and `git rev-parse HEAD` returns
  // the full 40. `startsWith` is what reconciles them; an equality check would
  // reject every correctly-pinned checkout and make the pin unusable.
  assertEquals(revisionMatchesPin(ORACLE_PIN), true);
  assertEquals(revisionMatchesPin(`${ORACLE_PIN}0f4c2a1`), true);
  assertEquals(revisionMatchesPin("deadbee"), false);
  assertEquals(revisionMatchesPin(""), false);
  // An explicit pin overrides the default, so a case can pin its own revision.
  assertEquals(revisionMatchesPin("abc1234", "abc1234"), true);
  assertEquals(revisionMatchesPin("abc1234", "def5678"), false);
});

Deno.test("reading the oracle revision surfaces git's own stderr", async () => {
  // A missing or non-git checkout is the common case: someone points
  // WIKI_ORACLE_ROOT at a venv that is not there. The message has to name the
  // path, or the operator cannot tell which of several roots is wrong.
  const missing = join(Deno.makeTempDirSync(), "not-a-checkout");
  const error = await assertRejects(() => readRevision(missing), Error);
  assertStringIncludes(error.message, missing);
  // Git's own wording, not ours: a missing directory fails `chdir` before
  // rev-parse ever runs, so asserting on the subcommand would be a
  // platform-specific claim. The path is the part that must survive.
  assertStringIncludes(error.message, "git revision");
});
