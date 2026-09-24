/**
 * Tests for `src/wiki/context.ts`, ported from `src/wiki/context.py`.
 *
 * The interesting behaviour is the difference between three things that look
 * alike in YAML — no context, an empty context, and a context without
 * `@vocab` — and the prefix-deletion rule, which is the only way a config can
 * remove a default binding.
 */
import { assertEquals } from "@std/assert";
import {
  Context,
  DEFAULT_BASE_IRI,
  DEFAULT_NAMESPACES,
  DEFAULT_VOCAB,
  SCHEMA,
  WAZOO,
} from "../src/wiki/context.ts";
import { BuildError, UpgradeError, WikiError } from "../src/wiki/errors.ts";

Deno.test("an unconfigured context keeps the default prefixes and vocab", () => {
  const context = new Context();
  assertEquals(context.vocab, DEFAULT_VOCAB);
  assertEquals(context.baseIri, DEFAULT_BASE_IRI);
  assertEquals(context.namespaces.size, Object.keys(DEFAULT_NAMESPACES).length);
  assertEquals(context.namespaces.get("schema"), SCHEMA);
  assertEquals(context.namespaces.get("wazoo"), WAZOO);
});

Deno.test("baseIri is overridable and independent of the context", () => {
  assertEquals(
    new Context({ baseIri: "https://x.example/" }).baseIri,
    "https://x.example/",
  );
  assertEquals(new Context().baseIri, DEFAULT_BASE_IRI);
});

Deno.test("a configured context without @vocab has no vocab at all", () => {
  // Distinct from the unconfigured case above: configuring a context opts out
  // of the default vocab unless it asks for one.
  const context = new Context({ namespaces: { schema: SCHEMA } });
  assertEquals(context.vocab, null);
});

Deno.test("an empty configured context is not the same as no context", () => {
  assertEquals(new Context({ namespaces: {} }).vocab, null);
  assertEquals(new Context().vocab, "https://schema.org/");
});

Deno.test("@vocab overrides the default and is not kept as a prefix", () => {
  const context = new Context({
    namespaces: { "@vocab": "https://example.org/vocab/", schema: SCHEMA },
  });
  assertEquals(context.vocab, "https://example.org/vocab/");
  assertEquals(context.namespaces.has("@vocab"), false);
});

Deno.test("falsey @vocab values mean no vocab, not a stringified value", () => {
  // Reachable from YAML, and Python's `str(val) if val else None` turns each of
  // these into `None` rather than "false"/"0".
  for (const value of ["", false, 0, null]) {
    assertEquals(new Context({ namespaces: { "@vocab": value } }).vocab, null);
  }
  assertEquals(
    new Context({ namespaces: { "@vocab": "https://e/" } }).vocab,
    "https://e/",
  );
});

Deno.test("a null prefix value deletes the default binding", () => {
  const context = new Context({ namespaces: { wazoo: null, schema: SCHEMA } });
  assertEquals(context.namespaces.has("wazoo"), false);
  assertEquals(context.namespaces.get("schema"), SCHEMA);
});

Deno.test("an unknown prefix is added and a non-string IRI is coerced", () => {
  const context = new Context({
    namespaces: { ex: "https://example.org/", weird: 42 },
  });
  assertEquals(context.namespaces.get("ex"), "https://example.org/");
  assertEquals(context.namespaces.get("weird"), "42");
});

Deno.test("defaults are per-instance, not shared mutable state", () => {
  const first = new Context({ namespaces: { wazoo: null } });
  const second = new Context();
  assertEquals(first.namespaces.has("wazoo"), false);
  assertEquals(second.namespaces.has("wazoo"), true);
});

Deno.test("bindNamespaces writes every managed prefix to the target", () => {
  const bound = new Map<string, string>();
  new Context().bindNamespaces({
    set: (prefix, iri) => void bound.set(prefix, iri),
  });
  assertEquals(bound.get("rdf"), "http://www.w3.org/1999/02/22-rdf-syntax-ns#");
  assertEquals(bound.size, new Context().namespaces.size);
});

Deno.test("the error hierarchy is catchable at each level", () => {
  const build = new BuildError("nope");
  const upgrade = new UpgradeError("nope");
  assertEquals(build instanceof BuildError, true);
  assertEquals(build instanceof WikiError, true);
  assertEquals(build instanceof Error, true);
  assertEquals(upgrade instanceof BuildError, false);
  assertEquals(build.name, "BuildError");
  assertEquals(new WikiError("x").name, "WikiError");
});
