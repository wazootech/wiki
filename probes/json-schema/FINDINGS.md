# JSON Schema probe — `jsonschema` → `ajv`

`frontmatter_schema.py` does not implement JSON Schema; it hands the whole
language to `jsonschema`'s `Draft202012Validator` and prints
`e.message` in `wiki check` output. The ADR swaps that dependency for `ajv`, so
the question this probe answers is narrow and load-bearing: **how much of
`jsonschema`'s behaviour can `ajv` be held to, and what has to be reconstructed
around it?**

## Running it

```sh
# Oracle side — from the pinned oracle checkout (`repos/wiki`).
PYTHONPATH=src ./.venv/Scripts/python.exe \
    ../../worktrees/wiki/deno-rewrite/probes/json-schema/oracle/generate.py

# ajv side, and the diff.
cd ../../worktrees/wiki/deno-rewrite/probes/json-schema
deno run --allow-read --allow-write probe.ts
deno run --allow-read modes.ts      # construction-mode evidence
```

`corpus.json` is shared input; both sides read it verbatim. Tests retain
`oracle/golden.json` as the regression fixture. The probe generates
`deno-ajv.json`; `probe-out.txt` is a captured stdout diff. Neither capture is
committed; the findings below preserve the comparison summary.

## Headline

60 cases · **verdict agrees 60** · paths agree 51 · messages agree 9.

That pair of numbers is the finding. Ajv is a faithful *decider* — it reached
jsonschema's verdict on every case, including the ones where keyword semantics
are subtle (`uniqueItems`, `multipleOf` on `0.3/0.1`, `unevaluatedProperties`,
`propertyNames`, `oneOf` with two matches, `contains`/`minContains`, `if`/`then`
/`else`, `dependentRequired`, `dependentSchemas`, numeric `exclusiveMinimum`,
`prefixItems`) — and a poor *reporter*, because it words, groups, and orders its
errors differently. The port therefore keeps ajv as the engine and replaces the
reporting layer; see `src/wiki/json_schema.ts`.

## What ajv gets right without help

- **`required` multiplicity and order.** jsonschema yields one error per missing
  property, in the `required` array's order; ajv does the same, and the probe's
  `required-list-order` case (`["zeta","alpha","mu"]`) confirms the order
  survives. This is the commonest frontmatter failure, so it matters most.
- **`allOf`/`properties`/`items`/`prefixItems`/`dependentSchemas` recursion.**
  Nested errors arrive at the same instance paths with the same keywords. Paths
  (including list indices) matched on every case that was not a composite
  keyword.
- **Everything else's verdict**, one keyword at a time.

## What has to be reconstructed

**Wording.** Only 9 of 60 messages matched. Sampled pairs (jsonschema → ajv):

| keyword | jsonschema | ajv |
| --- | --- | --- |
| `required` | `'headline' is a required property` | `must have required property 'headline'` |
| `type` | `True is not of type 'number'` | `must be number` |
| `minLength` | `'ab' is too short` | `must NOT have fewer than 3 characters` |
| `minItems` | `[] should be non-empty` | `must NOT have fewer than 1 items` |
| `pattern` | `'Not A Slug' does not match '^[a-z]+(-[a-z]+)*$'` | `must match pattern "^[a-z]+(-[a-z]+)*$"` |
| `enum` | `'archived' is not one of ['draft', 'published']` | `must be equal to one of the allowed values` |
| `const` | `'page' was expected` | `must be equal to constant` |
| `multipleOf` | `7 is not a multiple of 5` | `must be multiple of 5` |
| `exclusiveMaximum` | `10 is greater than or equal to the maximum of 10` | `must be < 10` |
| `uniqueItems` | `['a', 'a'] has non-unique elements` | `must NOT have duplicate items (items ## 0 and 1 are identical)` |

The templates are transcribed from `jsonschema` 4.26's `_keywords.py` and
`_legacy_keywords.py`. Because the messages interpolate *Python* reprs
(`True`, `None`, `'text'`, `{'k': 1}`), the port reuses the existing `pyRepr`.

**Cardinality.** Two directions:

- ajv splits one jsonschema error into many — `additionalProperties: false`
  (`must NOT have additional properties`, once per offending key, plus
  `unevaluatedProperties` likewise), `anyOf`/`oneOf`/`contains` (child errors
  *plus* a summary), `propertyNames` (the inner error *plus* `property name must
  be valid`), `if` (`must match "then" schema` on top of the branch's errors).
- jsonschema splits one ajv error into many — never in the corpus; verified
  instead by construction (`required`).

The port collapses the first group and drops the second's summaries, keeping
these shapes:

- `additionalProperties: false` → `Additional properties are not allowed ('another', 'stray' were unexpected)`, names sorted, singular/plural verb
  chosen by count, and the `patternProperties` variant
  (`'x' do not match any of the regexes: '^x-'`) when the schema declares any.
- `propertyNames` → one error per offending name, with the *name* as the
  instance and no instance path (jsonschema calls `descend(instance=property,
  schema=propertyNames)` with no path).
- `contains` → `['a','b'] does not contain items matching the given schema` when
  nothing matched, else `Too few items match the given schema (expected at
  least 2 but only 1 matched)`; both need a match count, so the subschema is
  compiled and the items re-tested.
- `oneOf` with several matches → `5 is valid under each of {'type': 'number',
  'minimum': 0}, {'type': 'number'}`. Note the order: jsonschema breaks out of
  its loop at the first valid subschema and then lists the *remaining* matches
  first, appending the first one last. ajv stops as soon as it has two passing
  schemas (`one-of-three-matches` shows it reporting two of three), so the full
  match set is recomputed from the subschemas rather than read from
  `params.passingSchemas`.

**Order.** `check_frontmatter_schema` sorts by instance path with a *stable*
sort, so the order among errors at the *same* path survives into the printed
output. There jsonschema's rule is "keywords in schema key order, descending
during each keyword's turn", and ajv does not follow it: with the same three
keys, `{additionalProperties: false, required: ["a"]}` and the reverse order both
make ajv report `required` first
(`order-additional-then-required` / `order-required-then-additional`). The port
reconstructs the order from the error's schema path, ranking each segment by its
position among its container's keys.

**`false` subschemas.** `{"properties": {"x": false}}` gives jsonschema
`False schema does not allow 1` at path `[]` — the value is quoted but the error
is attached to the *parent*, because `descend` yields it before the caller
prepends the property — and ajv `boolean schema is false` at path `["x"]`. Both
the wording and the path are translated.

## Construction mode (`modes.ts`)

`Draft202012Validator(schema)` is not a schema validator, and ajv by default is,
so the options were measured rather than assumed:

| schema | `validateSchema: true` | `validateSchema: false` | jsonschema |
| --- | --- | --- | --- |
| `$schema: draft-07` | throws | compiles | ignores `$schema` |
| `$schema: draft-04` | throws | compiles | ignores `$schema` |
| unknown keyword `x-custom` | compiles (`strict: false`) | compiles | ignored |
| `$comment` | compiles | compiles | ignored |
| `type: "not a type"` | throws | throws | throws **while validating** |
| `minimum: "zero"` | throws | throws | throws **while validating** |
| `$ref: https://…absent` | throws | throws | throws **while validating** |
| `pattern: "("` | throws | throws | throws **while validating** |

The port compiles with `validateSchema: false`, `strict: false`,
`validateFormats: false`, `allErrors: true`, `verbose: true`. The first two are
what keep a document the oracle accepts (a draft-07 `$schema` declaration, an
annotation keyword) from being rejected as unreadable.

`validateFormats: false` is the other half of that: jsonschema asserts `format`
only when given a format checker, and `frontmatter_schema.py` never gives one, so
a malformed `email`/`date-time` is *valid* on both sides
(`format-annotation-only`).

## Accepted divergences

1. **A malformed schema document fails earlier, and legibly.** The four cases in
   the last four rows of the table above make `ajv` throw while *compiling*
   where jsonschema throws while *validating*. Nothing can be checked either
   way; the oracle tracebacks, the port reports `invalid JSON Schema document
   (...)` as an issue, which is what `check_frontmatter_schema` already does with
   construction failures for unreadable schema files.
2. **Float formatting.** Python's `repr(1.0)` is `1.0`; JSON parsing collapses it
   to `1`, so a message quoting such a number is spec-close, not byte-close.
   Nothing in the corpus is affected.
3. **Ranking across `$ref`.** ajv's schema path is the *resolved* location
   (`#/$defs/person/required`) where jsonschema's stays at the reference site, so
   an error from a `$ref`'d subschema can rank differently against a sibling.
   Only observable when two errors share one instance path.
4. **Unrendered keywords.** A keyword with no template falls back to ajv's own
   wording rather than silently dropping the error. The corpus and the shipped
   scaffolds' keywords are all covered.

## Result

`src/wiki/json_schema.ts` implements the layer; `tests/json_schema_test.ts`
replays this corpus against `oracle/golden.json` and requires all 57
non-crashing cases to match on **verdict, paths, and messages byte for byte**
(plus the 3 crashing cases to fail at construction instead of mid-page). That
test is the contract — if a future ajv upgrade or template edit changes a
message, it fails loudly rather than shipping a differently-worded `check`.
