import { Config } from "../config.ts";
import type { Context } from "../context.ts";
import type { DataRecord } from "../parser.ts";
import { isTruthy, resolveType } from "./terms.ts";

/** The context and content predicate a `Config` or bare `Context` implies. */
export function rdfBinding(
  context: Context | Config,
): { context: Context; contentPredicate: string | null } {
  if (context instanceof Config) {
    return {
      context: context.context,
      contentPredicate: context.graph.content_predicate,
    };
  }
  return { context, contentPredicate: null };
}

/** Frontmatter `type` as a list, whatever shape it arrived in. */
function normalizeTypeList(raw: unknown): unknown[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return [...raw];
  return [raw];
}

/** `true` for the SHACL shape types `append` must leave alone. */
function isShaclShapeDocument(types: readonly unknown[]): boolean {
  for (const item of types) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (
      normalized === "sh:NodeShape" || normalized === "sh:PropertyShape" ||
      normalized === "NodeShape" || normalized === "PropertyShape"
    ) {
      return true;
    }
    const index = normalized.indexOf(":");
    if (index > 0 && normalized.slice(0, index) === "sh") {
      const local = normalized.slice(index + 1);
      if (local === "NodeShape" || local === "PropertyShape") return true;
    }
  }
  return false;
}

/**
 * Merge frontmatter types with `graph.implicit_types` per
 * `implicit_types_policy`.
 *
 * `fallback` (the default) only supplies a type to a page that declares none;
 * `append` unions them, in declaration order, deduped by *resolved URI* — which
 * is why two spellings of the same class (`schema:Person` and `Person` under a
 * schema.org vocab) collapse to the first one seen. Shape documents are exempt
 * from `append`: adding `TechArticle` to a `sh:NodeShape` would make every
 * shape validate as content.
 */
export function effectiveTypes(
  data: DataRecord,
  context: Context | Config,
): unknown[] {
  const declared = isTruthy(data["@type"]) ? data["@type"] : data["type"];
  const frontmatterTypes = normalizeTypeList(declared);

  let implicitTypes: readonly string[] = [];
  let policy = "fallback";
  if (context instanceof Config) {
    implicitTypes = context.graph.implicit_types;
    policy = context.graph.implicit_types_policy;
  }

  if (implicitTypes.length === 0) return frontmatterTypes;
  if (frontmatterTypes.length === 0) return [...implicitTypes];
  if (policy === "fallback") return frontmatterTypes;
  if (isShaclShapeDocument(frontmatterTypes)) return frontmatterTypes;

  const rdfContext = context instanceof Config ? context.context : context;
  const seen = new Set<string>();
  const merged: unknown[] = [];
  for (const item of [...frontmatterTypes, ...implicitTypes]) {
    const resolved = resolveType(item, rdfContext);
    if (resolved === null) continue;
    if (seen.has(resolved.value)) continue;
    seen.add(resolved.value);
    merged.push(item);
  }
  return merged;
}
