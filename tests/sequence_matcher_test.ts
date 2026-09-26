import { assertEquals } from "@std/assert";
import {
  getCloseMatches,
  sequenceMatcherRatio,
} from "../src/wiki/sequence_matcher.ts";

Deno.test("SequenceMatcher ratio matches Python's code-point matching", () => {
  assertEquals(
    sequenceMatcherRatio("target-pag", "target-page"),
    0.9523809523809523,
  );
  assertEquals(sequenceMatcherRatio("kitten", "sitting"), 0.6153846153846154);
  assertEquals(sequenceMatcherRatio("e\u0301", "é"), 0);
  assertEquals(sequenceMatcherRatio("", ""), 1);
});

Deno.test("getCloseMatches preserves Python's tuple ordering for ties", () => {
  assertEquals(
    getCloseMatches("a-page", ["ab-page", "ac-page"], 2, 0.86),
    ["ac-page", "ab-page"],
  );
});

Deno.test("popular repeated characters remain available for block extension", () => {
  const prefix = "a".repeat(220);
  const suffix = "b".repeat(20);
  assertEquals(
    sequenceMatcherRatio(`${prefix}X${suffix}`, `${prefix}Y${suffix}`),
    0.9128630705394191,
  );
});
