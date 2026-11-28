/**
 * Parser tests, ported case-for-case from `tests/test_parser.py`.
 *
 * The Python suite is the spec here: every assertion below exists in the
 * oracle's tests, so a divergence is a port bug rather than a judgement call.
 * The BOM cases are wiki#312 — the behaviour the oracle branch is named after.
 */

import * as sys from "../src/wiki/sys.ts";
import { test } from "node:test";
import { join } from "@std/path";
import { assertEquals, assertNotEquals } from "@std/assert";

import {
  documentDataFromPath,
  ensureContext,
  frontmatterError,
  parseFrontmatter,
  splitDocumentBody,
  splitFrontmatterBody,
} from "../src/wiki/parser.ts";

/** Run `body` with a fresh temp directory, cleaning up afterwards. */
function withTempDir(body: (root: string) => void): void {
  const dir = sys.makeTempDirSync({ prefix: "wiki-parser-" });
  try {
    body(dir);
  } finally {
    sys.removeSync(dir, { recursive: true });
  }
}

test("parseFrontmatter reads YAML frontmatter", () => {
  const content =
    "---\nid: wiki:gregory\ngivenName: Gregory\ntype: Person\n---\nHello World\n";
  const data = parseFrontmatter(content);
  assertEquals(data?.["id"], "wiki:gregory");
  assertEquals(data?.["type"], "Person");
  assertEquals(data?.["givenName"], "Gregory");
});

test("parseFrontmatter reads JSON frontmatter", () => {
  const content =
    '---\n{\n  "id": "wiki:gregory",\n  "givenName": "Gregory",\n  "type": "Person"\n}\n---\nHello World\n';
  const data = parseFrontmatter(content);
  assertEquals(data?.["id"], "wiki:gregory");
  assertEquals(data?.["type"], "Person");
});

test("parseFrontmatter refuses broken frontmatter", () => {
  assertEquals(parseFrontmatter("Hello World"), null);
  assertEquals(parseFrontmatter("---"), null);
  assertEquals(parseFrontmatter("---\n[invalid_yaml\n---"), null);
  assertEquals(parseFrontmatter("---\n{\n---"), null);
  // A non-mapping document has no frontmatter to speak of.
  assertEquals(parseFrontmatter("---\n- item1\n- item2\n---"), null);
});

test("ensureContext injects defaults without clobbering a scalar context", () => {
  const updated = ensureContext({ givenName: "Gregory" });
  const injected = updated["@context"] as Record<string, string>;
  assertEquals("@vocab" in injected, false);
  assertEquals(injected["wiki"], "https://wiki.example.org/");

  const partial = ensureContext({
    "@context": { custom: "http://custom.org/" },
  });
  const merged = partial["@context"] as Record<string, string>;
  assertEquals(merged["custom"], "http://custom.org/");
  assertEquals("@vocab" in merged, false);

  // A scalar `@context` is left exactly as written.
  const scalar = ensureContext({ "@context": "schema.org" });
  assertEquals(scalar["@context"], "schema.org");
});

test("splitFrontmatterBody returns the stripped body", () => {
  const [data, body] = splitFrontmatterBody(
    "---\nid: wiki:test\nlabel: Test\n---\nBody text here",
  );
  assertEquals(data?.["label"], "Test");
  assertEquals(body, "Body text here");

  const noFrontmatter = "Just body text\nwith multiple lines";
  const [none, verbatim] = splitFrontmatterBody(noFrontmatter);
  assertEquals(none, null);
  assertEquals(verbatim, noFrontmatter);
});

test("splitFrontmatterBody keeps dashes that appear in the body", () => {
  const [data, body] = splitFrontmatterBody(
    "---\nid: wiki:test\nlabel: Test\n---\nBody with --- dashes --- in text",
  );
  assertEquals(data?.["label"], "Test");
  assertEquals(body, "Body with --- dashes --- in text");
});

test("frontmatterError flags only blocks a formatter could mangle", () => {
  assertEquals(frontmatterError("Just body text\n"), null);
  assertEquals(frontmatterError("---\nid: wiki:test\n---\nBody"), null);
  assertNotEquals(frontmatterError("---\n[broken\n---\nBody"), null);
  // Frontmatter that parses to a non-mapping is unreadable too.
  assertNotEquals(frontmatterError("---\n- one\n- two\n---\nBody"), null);
  // An opener with no closer is a thematic break, not a block.
  assertEquals(frontmatterError("---\nid: wiki:test\n"), null);
});

test("frontmatterError returns null for a document with no BOM trouble", () => {
  // The tolerant read path: a BOM-prefixed page must not be reported as
  // broken frontmatter just because the BOM survived into the parser.
  assertEquals(frontmatterError("\uFEFF---\nid: wiki:test\n---\nBody"), null);
});

test("documentDataFromPath loads each data format", () => {
  withTempDir((root) => {
    const yml = join(root, "person.yml");
    const yaml = join(root, "person.yaml");
    const json = join(root, "person.json");
    const toml = join(root, "person.toml");
    sys.writeTextFileSync(yml, "type: Person\ngivenName: Gregory\n");
    sys.writeTextFileSync(yaml, "type: Person\ngivenName: Gregory\n");
    sys.writeTextFileSync(json, '{"type": "Person", "givenName": "Alice"}');
    sys.writeTextFileSync(toml, 'type = "Person"\ngivenName = "Bob"\n');

    const ymlData = documentDataFromPath(yml);
    const yamlData = documentDataFromPath(yaml);
    const jsonData = documentDataFromPath(json);
    const tomlData = documentDataFromPath(toml);

    assertEquals(ymlData?.["givenName"], "Gregory");
    assertEquals(yamlData?.["givenName"], "Gregory");
    assertEquals(jsonData?.["givenName"], "Alice");
    assertEquals(tomlData?.["givenName"], "Bob");
    for (const data of [ymlData, yamlData, jsonData, tomlData]) {
      assertEquals("@context" in (data ?? {}), true);
    }
  });
});

test("documentDataFromPath tolerates BOM-prefixed data files (wiki#312)", () => {
  withTempDir((root) => {
    const json = join(root, "person.json");
    const yml = join(root, "person.yml");
    sys.writeTextFileSync(
      json,
      "\uFEFF" + '{"type": "Person", "givenName": "Alice"}',
    );
    sys.writeTextFileSync(yml, "\uFEFF" + "type: Person\ngivenName: Gregory\n");
    assertEquals(documentDataFromPath(json)?.["givenName"], "Alice");
    assertEquals(documentDataFromPath(yml)?.["givenName"], "Gregory");
  });
});

test("documentDataFromPath rejects files that are not mappings", () => {
  withTempDir((root) => {
    const files: [string, string][] = [
      ["items.yml", "- one\n- two\n"],
      ["items.yaml", "- one\n- two\n"],
      ["items.json", "[1, 2, 3]"],
      ["items.toml", "x = broken\n"],
    ];
    for (const [name, content] of files) {
      const file = join(root, name);
      sys.writeTextFileSync(file, content);
      assertEquals(documentDataFromPath(file), null, `${name} should be null`);
    }
  });
});

test("splitDocumentBody gives data files an empty body", () => {
  withTempDir((root) => {
    const yml = join(root, "person.yml");
    const yaml = join(root, "person.yaml");
    const toml = join(root, "person.toml");
    sys.writeTextFileSync(yml, "type: Person\ngivenName: Gregory\n");
    sys.writeTextFileSync(yaml, "type: Person\ngivenName: Gregory\n");
    sys.writeTextFileSync(toml, 'type = "Person"\ngivenName = "Bob"\n');

    const [ymlData, ymlBody] = splitDocumentBody(yml);
    const [yamlData, yamlBody] = splitDocumentBody(yaml);
    const [tomlData, tomlBody] = splitDocumentBody(toml);

    assertEquals(ymlData?.["givenName"], "Gregory");
    assertEquals(ymlBody, "");
    assertEquals(yamlData?.["givenName"], "Gregory");
    assertEquals(yamlBody, "");
    assertEquals(tomlData?.["givenName"], "Bob");
    assertEquals(tomlBody, "");
  });
});

test("splitDocumentBody tolerates a BOM-prefixed page", () => {
  withTempDir((root) => {
    const page = join(root, "Page.md");
    sys.writeTextFileSync(
      page,
      "\uFEFF---\nid: wiki:test\nlabel: Test\n---\nBody text here",
    );
    const [data, body] = splitDocumentBody(page);
    assertEquals(data?.["label"], "Test");
    assertEquals(body, "Body text here");
  });
});
