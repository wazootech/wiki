/**
 * Which ajv construction mode mirrors `Draft202012Validator(schema)`?
 *
 * jsonschema's constructor is *not* a schema validator: it accepts documents it
 * considers malformed and only trips over them (or not) while validating. ajv,
 * by default, validates the schema against the 2020-12 meta-schema at compile
 * time and loads whatever `$schema` names. That difference decides whether a
 * schema file the oracle accepts is reported by the port as unreadable, so it
 * needs measuring rather than guessing.
 *
 *     deno run --allow-read --allow-write probes/json-schema/modes.ts
 */

import Ajv2020 from "ajv/dist/2020.js";
import type { JSONSchemaType } from "ajv";

const cases: { name: string; schema: Record<string, unknown> }[] = [
  { name: "plain", schema: { type: "object", required: ["a"] } },
  {
    name: "draft-07-dollar-schema",
    schema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["a"],
    },
  },
  {
    name: "draft-04-dollar-schema",
    schema: {
      $schema: "http://json-schema.org/draft-04/schema#",
      type: "object",
    },
  },
  { name: "unknown-annotation", schema: { type: "object", "x-custom": 1 } },
  { name: "comment-keyword", schema: { $comment: "hi", type: "object" } },
  { name: "invalid-type-name", schema: { type: "not a type" } },
  { name: "invalid-minimum", schema: { type: "number", minimum: "zero" } },
  { name: "unresolvable-ref", schema: { $ref: "https://example.org/absent.json" } },
  {
    name: "external-ref-in-defs",
    schema: { type: "object", properties: { x: { $ref: "https://example.org/absent.json" } } },
  },
  { name: "bad-pattern", schema: { type: "string", pattern: "(" } },
  { name: "boolean-schema", schema: false as unknown as Record<string, unknown> },
  { name: "array-type-list", schema: { type: ["object", "null"] } },
];

for (const validateSchema of [true, false]) {
  console.log(`\n=== validateSchema: ${validateSchema}`);
  for (const testCase of cases) {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: false,
      validateFormats: false,
      verbose: true,
      validateSchema,
    });
    try {
      ajv.compile(testCase.schema as JSONSchemaType<unknown>);
      console.log(`  compiled  ${testCase.name}`);
    } catch (error) {
      console.log(
        `  THREW     ${testCase.name}: ${(error as Error).message.slice(0, 120)}`,
      );
    }
  }
}
