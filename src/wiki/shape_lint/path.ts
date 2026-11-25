import type { Context } from "../context.ts";
import { describeValue } from "../describe.ts";
import {
  type Findings,
  isBlankMapping,
  keyIri,
  PATH_FORMS,
  shLocal,
  valueIri,
} from "./terms.ts";

/** Lint an `sh:alternativePath` value: a list of at least two paths. */
export function lintAlternatives(
  value: unknown,
  where: string,
  context: Context,
  findings: Findings,
): void {
  const items = Array.isArray(value)
    ? value.filter((item) => item !== null && item !== undefined)
    : [];
  if (items.length < 2) {
    findings.add(
      where,
      "sh:alternativePath must be a list of at least two paths " +
        "(SHACL §2.3.1.3).",
    );
  }
  if (!Array.isArray(value)) {
    lintPath(value, where, context, findings);
    return;
  }
  value.forEach((item, index) => {
    if (item === null || item === undefined) return;
    lintPath(item, `${where}[${index}]`, context, findings);
  });
}

/** Lint a property path value at `where` (§2.3.1). */
export function lintPath(
  value: unknown,
  where: string,
  context: Context,
  findings: Findings,
): void {
  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== null && item !== undefined);
    if (items.length === 0) {
      findings.add(where, "an empty list is not a SHACL property path.");
    }
    value.forEach((item, index) => {
      if (item === null || item === undefined) return;
      lintPath(item, `${where}[${index}]`, context, findings);
    });
    return;
  }
  if (isBlankMapping(value)) {
    const keys = Object.keys(value);
    const forms = keys.filter((key) => {
      const local = shLocal(keyIri(key, context));
      return local !== null && PATH_FORMS.has(local);
    });
    if (forms.length !== 1 || keys.length !== 1) {
      findings.add(
        where,
        "a complex path must have exactly one key, one of sh:inversePath, " +
          "sh:alternativePath, sh:zeroOrMorePath, sh:oneOrMorePath, or " +
          "sh:zeroOrOnePath (SHACL §2.3.1).",
      );
    }
    for (const key of forms) {
      const at = `${where}.${key}`;
      if (shLocal(keyIri(key, context)) === "alternativePath") {
        lintAlternatives(value[key], at, context, findings);
      } else {
        lintPath(value[key], at, context, findings);
      }
    }
    return;
  }
  if (valueIri(value, context) === null) {
    findings.add(
      where,
      `${describeValue(value)} is not an IRI, so it is not a property path; ` +
        "use a full IRI or a CURIE whose prefix the wiki declares.",
    );
  }
}
