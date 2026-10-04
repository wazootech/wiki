/**
 * The JSON Schema reporting layer, replayed against the oracle.
 *
 * `probes/json-schema/corpus.json` is a 60-case corpus that the pinned
 * `jsonschema` installation has already been run over; `oracle/golden.json`
 * holds its output. Every case here is compared on all three axes that matter:
 * the verdict, the instance paths, and the message text — byte for byte, after
 * the same stable path sort `check_frontmatter_schema` applies.
 *
 * The corpus is read from `probes/` rather than copied into `tests/fixtures/`
 * so that there is exactly one copy and one regeneration path
 * (`probes/json-schema/oracle/generate.py`, then `probe.ts` to re-diff ajv).
 */

import { assert, assertEquals } from "@std/assert";
import {
  JsonSchemaCompileError,
  JsonSchemaValidator,
  sortByInstancePath,
} from "../src/wiki/json_schema.ts";

interface CorpusCase {
  readonly name: string;
  readonly schema: unknown;
  readonly instance: unknown;
}

interface GoldenCase {
  readonly name: string;
  readonly constructed: boolean;
  readonly constructor_error?: string;
  readonly validation_error?: string;
  readonly sorted_paths?: readonly (string | number)[][];
  readonly sorted_messages?: readonly string[];
  readonly is_valid?: boolean;
}

const PROBE = new URL("../probes/json-schema/", import.meta.url);

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await Deno.readTextFile(new URL(name, PROBE))) as T;
}

const corpus = await readJson<{ cases: CorpusCase[] }>("corpus.json");
const golden = await readJson<{ cases: GoldenCase[] }>("oracle/golden.json");
const goldenByName = new Map(golden.cases.map((entry) => [entry.name, entry]));

// The schemas jsonschema only rejects *while validating*, which the port
// reports at construction instead; they get their own test below.
const raised = golden.cases.filter((entry) =>
  entry.validation_error !== undefined
);

Deno.test("the corpus and the oracle golden describe the same cases", () => {
  assertEquals(
    corpus.cases.map((entry) => entry.name).sort(),
    golden.cases.map((entry) => entry.name).sort(),
  );
  assert(corpus.cases.length >= 63, "the corpus lost cases");
});

Deno.test("every case matches the oracle's verdict, paths, and wording", () => {
  const mismatches: string[] = [];
  let verdicts = 0;
  let compared = 0;

  for (const testCase of corpus.cases) {
    const oracle = goldenByName.get(testCase.name);
    assert(oracle !== undefined, `no golden for ${testCase.name}`);
    // A schema jsonschema only rejects mid-validation makes ajv throw at
    // compile time; the port's contract is to report it as a readable issue.
    // Those cases are covered on their own below. Recorded in the probe's
    // FINDINGS.md as a deliberate divergence.
    if (oracle.validation_error !== undefined) continue;

    let validator: JsonSchemaValidator;
    try {
      validator = new JsonSchemaValidator(testCase.schema);
    } catch (error) {
      mismatches.push(
        `${testCase.name}: compile failed (${(error as Error).message})`,
      );
      continue;
    }

    compared++;
    const valid = validator.isValid(testCase.instance);
    if (valid === oracle.is_valid) verdicts++;
    else {
      mismatches.push(
        `${testCase.name}: verdict jsonschema=${oracle.is_valid} port=${valid}`,
      );
    }

    const errors = sortByInstancePath(validator.errors(testCase.instance));
    const paths = JSON.stringify(errors.map((error) => error.path));
    const expectedPaths = JSON.stringify(oracle.sorted_paths ?? []);
    if (paths !== expectedPaths) {
      mismatches.push(
        `${testCase.name}: paths\n    jsonschema ${expectedPaths}\n    port       ${paths}`,
      );
    }
    const messages = JSON.stringify(errors.map((error) => error.message));
    const expectedMessages = JSON.stringify(oracle.sorted_messages ?? []);
    if (messages !== expectedMessages) {
      mismatches.push(
        `${testCase.name}: messages\n    jsonschema ${expectedMessages}\n    port       ${messages}`,
      );
    }
  }

  assertEquals(raised.length, 3, "the set of oracle crashes changed");
  assertEquals(compared, golden.cases.length - raised.length);
  assertEquals(verdicts, compared, "a verdict diverged");
  assertEquals(mismatches, [], `${mismatches.length} divergences`);
});

Deno.test("a schema the oracle rejects mid-validation is reported, not thrown", () => {
  assertEquals(raised.length, 3);
  // The three corpus cases where jsonschema raises out of `iter_errors`:
  // an unknown `type` name, a non-numeric `minimum`, and a ref it cannot
  // resolve. `check_frontmatter_schema` catches construction failures and
  // turns them into `invalid JSON Schema document (...)`, so the port has to
  // fail at construction too rather than traceback halfway through a page.
  for (
    const name of [
      "invalid-schema-keyword-type",
      "invalid-schema-minimum-string",
      "unresolvable-ref",
    ]
  ) {
    const testCase = corpus.cases.find((entry) => entry.name === name);
    assert(testCase !== undefined, `missing corpus case ${name}`);
    const oracle = goldenByName.get(name);
    assert(oracle?.validation_error !== undefined, `${name} should raise`);
    let thrown: unknown = null;
    try {
      new JsonSchemaValidator(testCase.schema);
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof JsonSchemaCompileError, `${name} did not throw`);
    assert(
      (thrown as JsonSchemaCompileError).message.length > 0,
      `${name} threw without a message`,
    );
  }
});

Deno.test("sortByInstancePath is stable, so schema-key order survives", () => {
  // Two node-level failures at the same path: the order they arrive in is the
  // schema's keyword order and the stable sort must not disturb it.
  const errors = [
    { path: [], keyword: "required", message: "first" },
    { path: [], keyword: "additionalProperties", message: "second" },
    { path: ["a"], keyword: "type", message: "third" },
  ];
  assertEquals(
    sortByInstancePath(errors).map((error) => error.message),
    ["first", "second", "third"],
  );
});

Deno.test("list indices are numbers and dict keys are strings", () => {
  // `sorted(key=lambda e: list(e.path))` compares ints to ints and strs to
  // strs; a JSON object with a numeric-looking key must not become an index.
  const validator = new JsonSchemaValidator({
    type: "object",
    properties: { "0": { type: "string" } },
  });
  const errors = validator.errors({ "0": 1 });
  assertEquals(errors.length, 1);
  assertEquals(errors[0]?.path, ["0"]);
});
