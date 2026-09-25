/**
 * Port of `tests/test_frontmatter_schema.py`.
 *
 * Two adaptations, both stated where they appear:
 *
 * - The four `_run_check` tests at the end of the Python file — the severity
 *   matrix for both rules and the "both off skips the pass" case — are audit
 *   tests, not schema tests: they assert how `AuditReport` routes an issue
 *   list this module returns. They move to `audit_test.ts` when that module
 *   lands, rather than being asserted against a stub here.
 * - Remote fetching is exercised by replacing `globalThis.fetch`, which is what
 *   the Python tests do with `unittest.mock.patch("wiki.frontmatter_schema.urlopen")`.
 *   `SchemaLoader` reads the global at construction, so the seam needs no
 *   production API.
 *
 * The one test whose *expectation* changes rather than its shape is
 * `test_missing_schema_ref_invalid_json_schema_document`: Python patches
 * `Draft202012Validator` to raise, and the port reaches the same branch with a
 * schema document `ajv` refuses to compile. See `json_schema.ts`.
 */

import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { Config } from "../src/wiki/config.ts";
import { Path } from "../src/wiki/fspath.ts";
import {
  buildTypeSchemaRegistry,
  checkFrontmatterSchema,
  coerceSchemaRefs,
  isSchemaBindingDocument,
  JSON_SCHEMA_KEY,
  TARGET_CLASS_KEY,
  validationPayload,
} from "../src/wiki/frontmatter_schema.ts";

/** A unique temp directory, to be removed with {@link cleanup}. */
function tempRoot(): Path {
  return Path.of(Deno.makeTempDirSync({ prefix: "wiki-frontmatter-schema-" }));
}

function cleanup(root: Path): void {
  try {
    Deno.removeSync(root.toString(), { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

/** Write a file below `root`, creating parent directories. */
function write(root: Path, relative: string, content: string): Path {
  const target = root.joinpath(...relative.split("/"));
  Deno.mkdirSync(target.parent.toString(), { recursive: true });
  Deno.writeTextFileSync(target.toString(), content);
  return target;
}

function writeSchema(
  root: Path,
  relative: string,
  schema: unknown,
): void {
  write(root, relative, JSON.stringify(schema));
}

/** A config whose input directory is `<root>/wiki`, as the Python tests build. */
function configFor(root: Path, check: Record<string, unknown> = {}): Config {
  return new Config({
    wiki: { input: [root.joinpath("wiki")] },
    config_root: root,
    ...(Object.keys(check).length > 0 ? { check } : {}),
  });
}

function makeWiki(root: Path): Path {
  const wiki = root.joinpath("wiki");
  Deno.mkdirSync(wiki.toString(), { recursive: true });
  return wiki;
}

/** Run `fn` with `fetch` replaced, the way `mock.patch` swaps `urlopen`. */
async function withFetch<T>(
  stub: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
  fn: () => Promise<T>,
): Promise<{ value: T; calls: number }> {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    calls++;
    return stub(input, init);
  }) as typeof fetch;
  try {
    return { value: await fn(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function personSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: ["givenName", "familyName"],
    properties: {
      givenName: { type: "string", minLength: 1 },
      familyName: { type: "string", minLength: 1 },
    },
  };
}

// ------------------------------------------------------------- helpers

Deno.test("coerceSchemaRefs accepts a scalar and a list", () => {
  assertEquals(coerceSchemaRefs("schemas/a.json"), ["schemas/a.json"]);
  assertEquals(
    coerceSchemaRefs(["schemas/a.json", "schemas/b.json"]),
    ["schemas/a.json", "schemas/b.json"],
  );
  assertEquals(coerceSchemaRefs(null), null);
  assertEquals(coerceSchemaRefs("  "), null);
});

Deno.test("coerceSchemaRefs rejects values that are not strings", () => {
  assertThrows(() => coerceSchemaRefs(42));
  assertThrows(() => coerceSchemaRefs(["schemas/a.json", 1]));
  assertThrows(() => coerceSchemaRefs(["schemas/a.json", "  "]));
});

Deno.test("isSchemaBindingDocument needs a target class and a schema ref", () => {
  assert(
    isSchemaBindingDocument({
      type: "sh:NodeShape",
      [TARGET_CLASS_KEY]: "schema:Person",
      [JSON_SCHEMA_KEY]: "schemas/person.json",
    }),
  );
  assertFalse(isSchemaBindingDocument({ [TARGET_CLASS_KEY]: "schema:Person" }));
});

Deno.test("validationPayload drops schema pointers and SHACL keys", () => {
  const payload = validationPayload({
    type: "TechArticle",
    headline: "Title",
    [JSON_SCHEMA_KEY]: "schemas/extra.json",
    [TARGET_CLASS_KEY]: "schema:TechArticle",
    "sh:property": [],
    "@id": "x",
    id: "y",
  });
  assertEquals(payload, { type: "TechArticle", headline: "Title" });
});

// ---------------------------------------------------------- validation

Deno.test("a type binding validates the documents that match it", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    writeSchema(root, "schemas/person.json", personSchema());
    write(
      wiki,
      "Person_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Person\nwazoo:jsonSchema: schemas/person.json\n---\n",
    );
    write(
      wiki,
      "Valid.md",
      "---\ntype: schema:Person\ngivenName: Ada\nfamilyName: Lovelace\n---\n",
    );
    write(
      wiki,
      "Invalid.md",
      "---\ntype: schema:Person\ngivenName: Ada\n---\n",
    );

    const [missing, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(missing, []);
    assertEquals(validation.length, 1);
    assert(validation[0]!.startsWith("In Invalid:"));
    assert(validation[0]!.includes("familyName"));
  } finally {
    cleanup(root);
  }
});

Deno.test("a BOM-prefixed local schema is still readable (wiki#312)", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    const schemaPath = write(root, "schemas/person.json", "");
    Deno.writeTextFileSync(
      schemaPath.toString(),
      "\uFEFF" + JSON.stringify(personSchema()),
    );
    write(
      wiki,
      "Person_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Person\nwazoo:jsonSchema: schemas/person.json\n---\n",
    );
    write(
      wiki,
      "Invalid.md",
      "---\ntype: schema:Person\ngivenName: Ada\n---\n",
    );

    const [missing, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(missing, []);
    assertEquals(validation.length, 1);
    assert(validation[0]!.includes("familyName"));
  } finally {
    cleanup(root);
  }
});

Deno.test("a binding document is not validated as an instance", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    writeSchema(root, "schemas/shape-only.json", {
      type: "object",
      required: ["headline"],
      properties: { headline: { type: "string" } },
    });
    write(
      wiki,
      "Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Person\nwazoo:jsonSchema: schemas/shape-only.json\n---\n",
    );

    const [missing, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(missing, []);
    assertEquals(validation, []);
  } finally {
    cleanup(root);
  }
});

Deno.test("a page-level schema appends to the type binding", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    writeSchema(root, "schemas/person.json", personSchema());
    writeSchema(root, "schemas/extra.json", {
      type: "object",
      required: ["nickname"],
      properties: { nickname: { type: "string" } },
    });
    write(
      wiki,
      "Person_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Person\nwazoo:jsonSchema: schemas/person.json\n---\n",
    );
    write(
      wiki,
      "Page.md",
      "---\ntype: schema:Person\ngivenName: Ada\nfamilyName: Lovelace\nwazoo:jsonSchema: schemas/extra.json\n---\n",
    );

    const [missing, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(missing, []);
    assertEquals(validation.length, 1);
    assert(validation[0]!.includes("nickname"));
  } finally {
    cleanup(root);
  }
});

Deno.test("a missing local schema is reported against both the page and the binding", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    write(
      wiki,
      "Person_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Person\nwazoo:jsonSchema: schemas/missing.json\n---\n",
    );
    write(
      wiki,
      "Page.md",
      "---\ntype: schema:Person\ngivenName: Ada\nfamilyName: Lovelace\n---\n",
    );

    const [missing, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(validation, []);
    assertEquals(missing.length, 2);
    assert(missing.some((issue) => issue.includes("missing.json")));
  } finally {
    cleanup(root);
  }
});

Deno.test("a scoped check still builds the full registry", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    writeSchema(root, "schemas/person.json", personSchema());
    write(
      wiki,
      "Person_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Person\nwazoo:jsonSchema: schemas/person.json\n---\n",
    );
    const invalid = write(
      wiki,
      "Invalid.md",
      "---\ntype: schema:Person\ngivenName: Ada\n---\n",
    );

    const [missing, validation] = await checkFrontmatterSchema(
      configFor(root),
      null,
      { filePaths: [invalid] },
    );
    assertEquals(missing, []);
    assertEquals(validation.length, 1);
  } finally {
    cleanup(root);
  }
});

Deno.test("a page schema list is a union of requirements", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    writeSchema(root, "schemas/a.json", {
      type: "object",
      required: ["foo"],
      properties: { foo: { type: "string" } },
    });
    writeSchema(root, "schemas/b.json", {
      type: "object",
      required: ["bar"],
      properties: { bar: { type: "string" } },
    });
    write(
      wiki,
      "Page.md",
      "---\ntype: schema:WebPage\nname: List union\nfoo: ok\nwazoo:jsonSchema:\n  - schemas/a.json\n  - schemas/b.json\n---\n",
    );

    let [, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(validation.length, 1);
    assert(validation[0]!.includes("bar"));

    Deno.removeSync(wiki.joinpath("Page.md").toString());
    write(
      wiki,
      "PageBoth.md",
      "---\ntype: schema:WebPage\nname: Both missing\nwazoo:jsonSchema:\n  - schemas/a.json\n  - schemas/b.json\n---\n",
    );

    [, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(validation.length, 2);
    assert(validation.some((issue) => issue.includes("foo")));
    assert(validation.some((issue) => issue.includes("bar")));
  } finally {
    cleanup(root);
  }
});

Deno.test("a schema outside the config root is refused", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    write(root.parent, "outside.json", "{}");
    write(
      wiki,
      "Page.md",
      "---\ntype: schema:WebPage\nname: Escape\nwazoo:jsonSchema: ../outside.json\n---\n",
    );

    const [missing, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(validation, []);
    assertEquals(missing.length, 1);
    assert(missing[0]!.includes("under the wiki config root"));
  } finally {
    cleanup(root);
  }
});

Deno.test("a schema that is not a .json file is refused", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    writeSchema(root, "schemas/rules.yaml", { type: "object" });
    write(
      wiki,
      "Page.md",
      "---\ntype: schema:WebPage\nname: Wrong ext\nwazoo:jsonSchema: schemas/rules.yaml\n---\n",
    );

    const [missing, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(validation, []);
    assertEquals(missing.length, 1);
    assert(missing[0]!.includes(".json"));
  } finally {
    cleanup(root);
  }
});

Deno.test("a schema document the engine cannot compile is reported, not thrown", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    // `jsonschema` accepts this document and raises `UnknownType` while
    // validating; `ajv` refuses to compile it, and the port reports the
    // construction failure the way the Python side reports one.
    writeSchema(root, "schemas/broken.json", {
      type: "object",
      properties: { x: { type: "not a type" } },
    });
    write(
      wiki,
      "Page.md",
      "---\ntype: schema:WebPage\nname: Bad schema\nwazoo:jsonSchema: schemas/broken.json\n---\n",
    );

    const [missing, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(validation, []);
    assertEquals(missing.length, 1);
    assert(missing[0]!.includes("invalid JSON Schema document"));
  } finally {
    cleanup(root);
  }
});

Deno.test("the issue list is byte-identical to the oracle's", async () => {
  // Captured from the pinned oracle (`repos/wiki`) over this exact fixture
  // tree. Two things in it are surprising and deliberate:
  //
  // - every page reports `'type'` as an *unexpected* property when the schema
  //   sets `additionalProperties: false`, because `validation_payload` filters
  //   `@`-prefixed keys, `id`, `sh:*`, and the two schema pointers but not the
  //   frontmatter `type` key. That is the oracle's behaviour, and the port
  //   copies it rather than fixing it here.
  // - `Broken`'s failures come out node-level first, then in instance-path
  //   order, which is what the stable sort in `check_frontmatter_schema` plus
  //   the schema-key ordering in `json_schema.ts` have to add up to.
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    writeSchema(root, "schemas/person.json", {
      type: "object",
      required: ["givenName", "familyName"],
      properties: {
        givenName: { type: "string", minLength: 1 },
        familyName: { type: "string", minLength: 3 },
        email: { type: "string", pattern: "^[^@]+@[^@]+$" },
        age: { type: "integer", minimum: 0 },
        status: { enum: ["draft", "published"] },
      },
      additionalProperties: false,
    });
    writeSchema(root, "schemas/extra.json", {
      type: "object",
      required: ["nickname"],
      properties: { nickname: { type: "string" } },
    });
    writeSchema(root, "schemas/rules.yaml", { type: "object" });
    write(root.parent, "outside.json", "{}");
    write(
      wiki,
      "Person_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Person\nwazoo:jsonSchema: schemas/person.json\n---\n",
    );
    write(
      wiki,
      "Valid.md",
      "---\ntype: schema:Person\ngivenName: Ada\nfamilyName: Lovelace\nstatus: draft\n---\n",
    );
    write(
      wiki,
      "Broken.md",
      "---\ntype: schema:Person\ngivenName: 5\nfamilyName: ab\nemail: nope\nage: -1\nstatus: gone\nstray: 1\n---\n",
    );
    write(
      wiki,
      "List.md",
      "---\ntype: schema:Person\ngivenName: Ada\nfamilyName: Lovelace\nwazoo:jsonSchema:\n  - schemas/extra.json\n---\n",
    );
    write(
      wiki,
      "Missing.md",
      "---\ntype: schema:WebPage\nwazoo:jsonSchema: schemas/absent.json\n---\n",
    );
    write(
      wiki,
      "WrongExt.md",
      "---\ntype: schema:WebPage\nwazoo:jsonSchema: schemas/rules.yaml\n---\n",
    );
    write(
      wiki,
      "Outside.md",
      "---\ntype: schema:WebPage\nwazoo:jsonSchema: ../outside.json\n---\n",
    );

    const [missing, validation] = await checkFrontmatterSchema(configFor(root));
    assertEquals(missing, [
      "In Missing: wazoo:jsonSchema 'schemas/absent.json' must resolve to a readable .json file under the wiki config root.",
      "In Outside: wazoo:jsonSchema '../outside.json' must resolve to a readable .json file under the wiki config root.",
      "In WrongExt: wazoo:jsonSchema 'schemas/rules.yaml' must resolve to a readable .json file under the wiki config root.",
    ]);
    assertEquals(validation, [
      "In Broken: Additional properties are not allowed ('stray', 'type' were unexpected) (schema: schemas/person.json, via type schema:Person)",
      "In Broken: -1 is less than the minimum of 0 (schema: schemas/person.json, via type schema:Person)",
      "In Broken: 'nope' does not match '^[^@]+@[^@]+$' (schema: schemas/person.json, via type schema:Person)",
      "In Broken: 'ab' is too short (schema: schemas/person.json, via type schema:Person)",
      "In Broken: 5 is not of type 'string' (schema: schemas/person.json, via type schema:Person)",
      "In Broken: 'gone' is not one of ['draft', 'published'] (schema: schemas/person.json, via type schema:Person)",
      "In List: Additional properties are not allowed ('type' was unexpected) (schema: schemas/person.json, via type schema:Person)",
      "In List: 'nickname' is a required property (schema: schemas/extra.json)",
      "In Valid: Additional properties are not allowed ('type' was unexpected) (schema: schemas/person.json, via type schema:Person)",
    ]);
  } finally {
    cleanup(root);
  }
});

Deno.test("buildTypeSchemaRegistry dedupes repeated references", () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    for (const name of ["A_Shape.md", "B_Shape.md"]) {
      write(
        wiki,
        name,
        "---\ntype: sh:NodeShape\nsh:targetClass: schema:Person\nwazoo:jsonSchema: schemas/person.json\n---\n",
      );
    }
    const registry = buildTypeSchemaRegistry(configFor(root));
    assertEquals(registry.get("https://schema.org/Person"), [
      "schemas/person.json",
    ]);
  } finally {
    cleanup(root);
  }
});

// -------------------------------------------------------------- remote

Deno.test("a remote schema is fetched and applied", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    write(
      wiki,
      "Remote_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Thing\nwazoo:jsonSchema: https://example.org/schema.json\n---\n",
    );
    write(wiki, "Good.md", "---\ntype: schema:Thing\nlabel: ok\n---\n");
    write(wiki, "Bad.md", "---\ntype: schema:Thing\n---\n");

    const { value, calls } = await withFetch(
      () =>
        Promise.resolve(jsonResponse({
          type: "object",
          required: ["label"],
          properties: { label: { type: "string" } },
        })),
      () => checkFrontmatterSchema(configFor(root)),
    );
    assertEquals(calls, 1);
    const [missing, validation] = value;
    assertEquals(missing, []);
    assertEquals(validation.length, 1);
    assert(validation[0]!.startsWith("In Bad:"));
  } finally {
    cleanup(root);
  }
});

Deno.test("check.remote_schema_refs: deny never reaches the network", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    write(
      wiki,
      "Remote_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Thing\nwazoo:jsonSchema: https://example.org/schema.json\n---\n",
    );

    const { value, calls } = await withFetch(
      () => {
        throw new Error("network call");
      },
      () =>
        checkFrontmatterSchema(configFor(root, { remote_schema_refs: "deny" })),
    );
    assertEquals(calls, 0);
    const [missing, validation] = value;
    assertEquals(missing.length, 1);
    assert(missing[0]!.includes("remote schema refs are disabled"));
    assertEquals(validation, []);
  } finally {
    cleanup(root);
  }
});

Deno.test("an allowlist blocks a host it does not name", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    write(
      wiki,
      "Remote_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Thing\nwazoo:jsonSchema: https://example.org/schema.json\n---\n",
    );

    const { value, calls } = await withFetch(
      () => {
        throw new Error("network call");
      },
      () =>
        checkFrontmatterSchema(configFor(root, {
          remote_schema_refs: "allowlist",
          remote_schema_hosts: ["schemas.example.org"],
        })),
    );
    assertEquals(calls, 0);
    const [missing, validation] = value;
    assertEquals(missing.length, 1);
    assert(missing[0]!.includes("not allowed by check.remote_schema_hosts"));
    assertEquals(validation, []);
  } finally {
    cleanup(root);
  }
});

Deno.test("an allowlist permits the host it names", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    write(
      wiki,
      "Remote_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Thing\nwazoo:jsonSchema: https://example.org/schema.json\n---\n",
    );
    write(wiki, "Bad.md", "---\ntype: schema:Thing\n---\n");

    const { value, calls } = await withFetch(
      () =>
        Promise.resolve(jsonResponse({
          type: "object",
          required: ["label"],
          properties: { label: { type: "string" } },
        })),
      () =>
        checkFrontmatterSchema(configFor(root, {
          remote_schema_refs: "allowlist",
          remote_schema_hosts: ["example.org"],
        })),
    );
    assertEquals(calls, 1);
    const [missing, validation] = value;
    assertEquals(missing, []);
    assertEquals(validation.length, 1);
    assert(validation[0]!.startsWith("In Bad:"));
  } finally {
    cleanup(root);
  }
});

Deno.test("an HTTP error from a remote schema is an issue", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    write(
      wiki,
      "Remote_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Thing\nwazoo:jsonSchema: https://example.org/schema.json\n---\n",
    );
    write(wiki, "Page.md", "---\ntype: schema:Thing\nlabel: ok\n---\n");

    const { value } = await withFetch(
      () => Promise.resolve(new Response("nope", { status: 404 })),
      () => checkFrontmatterSchema(configFor(root)),
    );
    const [missing, validation] = value;
    assertEquals(validation, []);
    assert(missing.length > 0);
    assert(missing.some((issue) => issue.includes("HTTP 404")));
  } finally {
    cleanup(root);
  }
});

Deno.test("a timed-out remote schema is an issue", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    write(
      wiki,
      "Remote_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Thing\nwazoo:jsonSchema: https://example.org/schema.json\n---\n",
    );
    write(wiki, "Page.md", "---\ntype: schema:Thing\nlabel: ok\n---\n");

    const { value } = await withFetch(
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
      () => checkFrontmatterSchema(configFor(root)),
    );
    const [missing, validation] = value;
    assertEquals(validation, []);
    assert(missing.some((issue) => issue.includes("timed out")));
  } finally {
    cleanup(root);
  }
});

Deno.test("both rules off skips the pass entirely", async () => {
  const root = tempRoot();
  try {
    const wiki = makeWiki(root);
    write(
      wiki,
      "Remote_Shape.md",
      "---\ntype: sh:NodeShape\nsh:targetClass: schema:Thing\nwazoo:jsonSchema: https://example.org/schema.json\n---\n",
    );

    const { value, calls } = await withFetch(
      () => {
        throw new Error("network call");
      },
      () =>
        checkFrontmatterSchema(configFor(root, {
          frontmatter_schema: "off",
          missing_schema_ref: "off",
        })),
    );
    assertEquals(calls, 0);
    assertEquals(value, [[], []]);
  } finally {
    cleanup(root);
  }
});
