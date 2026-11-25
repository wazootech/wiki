import type { Context } from "../context.ts";
import { describeValue } from "../describe.ts";
import type { DataRecord } from "../parser.ts";
import { SHACL_PROPERTIES } from "./shacl_properties.ts";
import {
  type Findings,
  IRI_VALUED,
  isBlankMapping,
  isShaclTerm,
  itemPath,
  keyIri,
  NODE_KINDS,
  PATH_VALUED,
  SHAPE_LISTS,
  SHAPE_VALUED,
  shLocal,
  SKIP_KEYS,
  valueIri,
} from "./terms.ts";
import { lintAlternatives, lintPath } from "./path.ts";

/** Check that every `sh:` IRI among the scalar values is a SHACL term. */
function lintValues(
  value: unknown,
  where: string,
  context: Context,
  findings: Findings,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      lintValues(item, `${where}[${index}]`, context, findings)
    );
    return;
  }
  if (isBlankMapping(value)) return;
  const local = shLocal(valueIri(value, context));
  if (local !== null && !isShaclTerm(local)) {
    findings.add(where, `sh:${local} is not a term of the SHACL vocabulary.`);
  }
}

/**
 * Walk one mapping. `kind` is what the spec says the node is: a property shape
 * needs `sh:path` (§2.3), a node shape must not have one (§2.2, and §4.7.1 for
 * the values of `sh:node`), and anything else is checked for vocabulary and
 * nested shapes.
 */
export function lintShape(
  shape: DataRecord,
  where: string,
  kind: "property" | "node" | "other",
  context: Context,
  findings: Findings,
): void {
  const prefix = where === "" ? "" : `${where}.`;
  let pathKey: string | null = null;

  for (const [key, value] of Object.entries(shape)) {
    if (key.startsWith("@") || (where === "" && SKIP_KEYS.has(key))) continue;
    const at = `${prefix}${key}`;
    const local = shLocal(keyIri(key, context));
    if (local === null) {
      // Not a SHACL key, but a nested mapping may still carry SHACL keys.
      if (isBlankMapping(value)) {
        lintShape(value, at, "other", context, findings);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (isBlankMapping(item)) {
            lintShape(item, `${at}[${index}]`, "other", context, findings);
          }
        });
      }
      continue;
    }

    if (!SHACL_PROPERTIES.has(local)) {
      findings.add(
        at,
        `sh:${local} is not a property of the SHACL vocabulary, so it ` +
          "constrains nothing.",
      );
      continue;
    }

    if (local === "path") pathKey = at;
    if (PATH_VALUED.has(local)) {
      lintPath(value, at, context, findings);
      continue;
    }
    if (local === "alternativePath") {
      lintAlternatives(value, at, context, findings);
      continue;
    }
    if (local === "nodeKind") {
      const kind = shLocal(valueIri(value, context));
      if (kind === null || !NODE_KINDS.has(kind)) {
        findings.add(
          at,
          `sh:nodeKind must be one of ${
            [...NODE_KINDS].map((k) => `sh:${k}`)
              .join(", ")
          }, not ${describeValue(value)} (SHACL §4.1.3).`,
        );
      }
      continue;
    }

    if (IRI_VALUED.has(local)) {
      (Array.isArray(value) ? value : [value]).forEach((item, index) => {
        if (item === null || item === undefined) return;
        if (valueIri(item, context) !== null) return;
        findings.add(
          itemPath(at, value, index),
          `sh:${local} takes IRIs, and ${describeValue(item)} compiles to a ` +
            "literal; use a full IRI or a CURIE whose prefix the wiki declares.",
        );
      });
      continue;
    }

    if (SHAPE_VALUED.has(local) || SHAPE_LISTS.has(local)) {
      const childKind = local === "property"
        ? "property"
        : local === "node"
        ? "node"
        : "other";
      (Array.isArray(value) ? value : [value]).forEach((item, index) => {
        if (isBlankMapping(item)) {
          lintShape(
            item,
            itemPath(at, value, index),
            childKind,
            context,
            findings,
          );
        }
      });
      continue;
    }

    lintValues(value, at, context, findings);
  }

  if (kind === "property" && pathKey === null) {
    findings.add(
      where === "" ? "sh:path" : where,
      "a property shape needs exactly one sh:path (SHACL §2.3).",
    );
  }
  if (kind === "node" && pathKey !== null) {
    findings.add(
      pathKey,
      "a node shape cannot have sh:path (SHACL §2.2); put a path constraint " +
        "in a property shape under sh:property.",
    );
  }
}
