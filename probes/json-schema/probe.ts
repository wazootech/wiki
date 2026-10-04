/**
 * ajv side of the frontmatter JSON Schema probe.
 *
 * Reads the shared corpus, compiles every schema with `Ajv2020` under the
 * options the port would use, and prints a per-case comparison against
 * `oracle/golden.json`:
 *
 *   - validity: does ajv reach the same verdict as jsonschema?
 *   - paths + keywords: same errors, in the same order?
 *   - messages: same text?
 *
 * The point is to find out how much of jsonschema's *message* contract ajv
 * leaves reproducible from its error objects (`instancePath`, `keyword`,
 * `params`, `schemaPath`), because `wiki check` prints those strings.
 *
 *     deno run --allow-read --allow-write probes/json-schema/probe.ts
 */

import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";

type Case = { name: string; schema: unknown; instance: unknown };

type GoldenError = {
  path: (string | number)[];
  keyword: string | null;
  message: string;
  schema_path: (string | number)[];
};

type GoldenCase = {
  name: string;
  constructed: boolean;
  constructor_error?: string;
  validation_error?: string;
  raw?: GoldenError[];
  sorted_paths?: (string | number)[][];
  sorted_messages?: string[];
  is_valid?: boolean;
};

const HERE = new URL("./", import.meta.url);
const corpus = JSON.parse(
  await Deno.readTextFile(new URL("corpus.json", HERE)),
) as { cases: Case[] };
const golden = JSON.parse(
  await Deno.readTextFile(new URL("oracle/golden.json", HERE)),
) as { cases: GoldenCase[] };

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
  verbose: true,
});

/** Ajv's `instancePath` back to the deque jsonschema reports. */
function pathOf(error: ErrorObject): (string | number)[] {
  if (error.instancePath === "") return [];
  return error.instancePath
    .slice(1)
    .split("/")
    .map((segment) => {
      const decoded = segment.replace(/~1/g, "/").replace(/~0/g, "~");
      return /^\d+$/.test(decoded) ? Number(decoded) : decoded;
    });
}

type AjvCase = {
  name: string;
  compiled: boolean;
  compile_error?: string;
  validation_error?: string;
  raw?: {
    path: (string | number)[];
    keyword: string;
    params: unknown;
    message: string;
    schemaPath: string;
    schema?: unknown;
    parentSchemaKeys?: string[];
  }[];
  sorted_paths?: (string | number)[][];
  sorted_messages?: string[];
  is_valid?: boolean;
};

const results: AjvCase[] = [];
for (const testCase of corpus.cases) {
  const record: AjvCase = { name: testCase.name, compiled: true };
  let validate: ReturnType<typeof ajv.compile>;
  try {
    validate = ajv.compile(testCase.schema);
  } catch (error) {
    record.compiled = false;
    record.compile_error = `${(error as Error).name}: ${(error as Error).message}`;
    results.push(record);
    continue;
  }
  let valid: boolean;
  try {
    valid = validate(testCase.instance) as boolean;
  } catch (error) {
    record.validation_error = `${(error as Error).name}: ${(error as Error).message}`;
    results.push(record);
    continue;
  }
  const errors = (validate.errors ?? []) as ErrorObject[];
  record.raw = errors.map((error) => ({
    path: pathOf(error),
    keyword: error.keyword,
    params: error.params,
    message: error.message ?? "",
    schemaPath: error.schemaPath,
    // `verbose: true` adds the two schema views the jsonschema reporting layer
    // needs: the keyword's own value, and its container.
    schema: error.schema,
    parentSchemaKeys: error.parentSchema === undefined
      ? undefined
      : Object.keys(error.parentSchema as Record<string, unknown>),
  }));
  record.is_valid = valid && errors.length === 0;
  const sorted = [...errors].sort((a, b) =>
    comparePathLists(pathOf(a), pathOf(b))
  );
  record.sorted_paths = sorted.map(pathOf);
  record.sorted_messages = sorted.map((error) => error.message ?? "");
  results.push(record);
}

/** Python list comparison: element-wise, shorter-is-smaller on a common prefix. */
function comparePathLists(
  a: (string | number)[],
  b: (string | number)[],
): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const left = a[i]!;
    const right = b[i]!;
    const order = typeof left === "string" && typeof right === "string"
      ? (left < right ? -1 : left > right ? 1 : 0)
      : Number(left) - Number(right);
    if (order !== 0) return order;
  }
  return a.length - b.length;
}

await Deno.writeTextFile(
  new URL("deno-ajv.json", HERE),
  JSON.stringify({ cases: results }, null, 2) + "\n",
);

// ---------------------------------------------------------------- comparison

const byName = new Map(golden.cases.map((entry) => [entry.name, entry]));
let sameVerdict = 0;
let samePaths = 0;
let sameMessages = 0;
let structural = 0;

for (const record of results) {
  const oracle = byName.get(record.name);
  if (oracle === undefined) {
    console.log(`?? ${record.name}: not in the oracle golden`);
    continue;
  }
  const notes: string[] = [];
  const oracleValid = oracle.is_valid ?? null;
  const ajvValid = record.compiled ? (record.is_valid ?? false) : null;
  if (oracleValid === ajvValid) {
    sameVerdict++;
  } else {
    notes.push(`verdict: jsonschema=${oracleValid} ajv=${ajvValid}`);
  }
  if (oracle.validation_error || record.validation_error) {
    structural++;
    notes.push(
      `raised: jsonschema=${oracle.validation_error ?? "-"} ajv=${
        record.validation_error ?? "-"
      }`,
    );
  }
  if (oracle.constructed && !record.compiled) {
    structural++;
    notes.push(`ajv compile: ${record.compile_error}`);
  }
  const oraclePaths = JSON.stringify(oracle.sorted_paths ?? []);
  const ajvPaths = JSON.stringify(record.sorted_paths ?? []);
  if (oraclePaths === ajvPaths) {
    samePaths++;
  } else {
    structural++;
    notes.push(`paths: jsonschema=${oraclePaths} ajv=${ajvPaths}`);
  }
  const oracleMessages = oracle.sorted_messages ?? [];
  const ajvMessages = record.sorted_messages ?? [];
  if (JSON.stringify(oracleMessages) === JSON.stringify(ajvMessages)) {
    sameMessages++;
  } else if (oraclePaths === ajvPaths || !oracle.validation_error) {
    notes.push(
      `messages:\n      jsonschema: ${
        JSON.stringify(oracleMessages)
      }\n      ajv:        ${JSON.stringify(ajvMessages)}`,
    );
  }
  if (notes.length > 0 || record.name.startsWith("zz")) {
    console.log(`\n== ${record.name}`);
    for (const note of notes) console.log(`   ${note}`);
  }
}

console.log(
  `\n${results.length} cases · verdict agrees ${sameVerdict} · paths agree ${samePaths} · messages agree ${sameMessages} · structural/other ${structural}`,
);
