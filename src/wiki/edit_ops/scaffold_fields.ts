import { extname } from "@std/path";
import type { Config } from "../config.ts";
import { splitFrontmatterText } from "../document.ts";
import {
  buildTypeSchemaRegistry,
  normalizeTypeUri,
  SchemaLoader,
  TARGET_CLASS_KEY,
} from "../frontmatter_schema.ts";
import { readText } from "../fspath.ts";
import { iterDocumentFiles } from "../paths.ts";

/** Frontmatter keys a page of `type` must carry, in the order shapes list them. */
export async function requiredFields(
  config: Config,
  type: string,
): Promise<string[]> {
  const typeKey = normalizeTypeUri(type, config);
  const fields: string[] = [];
  const add = (key: unknown) => {
    if (typeof key === "string" && key !== "" && !fields.includes(key)) {
      fields.push(key);
    }
  };

  // SHACL shape pages: `sh:property` entries with `sh:minCount >= 1`. Read
  // from frontmatter, the way `buildTypeSchemaRegistry` reads schema bindings,
  // so the keys come back spelled as this wiki spells them (`schema:name`).
  // Shapes written in Turtle blocks or RDF files are not consulted here; the
  // edit's validation still enforces them.
  for (const filePath of iterDocumentFiles(config)) {
    if (extname(filePath).toLowerCase() !== ".md") continue;
    const data = splitFrontmatterText(readText(filePath)).data;
    if (data === null) continue;
    const targets = [data[TARGET_CLASS_KEY]].flat();
    if (
      !targets.some((target) => normalizeTypeUri(target, config) === typeKey)
    ) {
      continue;
    }
    const properties = data["sh:property"];
    if (!Array.isArray(properties)) continue;
    for (const property of properties) {
      if (property === null || typeof property !== "object") continue;
      const record = property as Record<string, unknown>;
      if (Number(record["sh:minCount"] ?? 0) >= 1) add(record["sh:path"]);
    }
  }

  // JSON Schemas bound to the type: their top-level `required`.
  const refs = buildTypeSchemaRegistry(config).get(typeKey) ?? [];
  if (refs.length > 0) {
    const loader = new SchemaLoader(config.config_root, {
      remoteSchemaRefs: config.check.remote_schema_refs,
      remoteSchemaHosts: config.check.remote_schema_hosts,
    });
    for (const ref of refs) {
      const { schema } = await loader.loadSchema(ref);
      const required = schema?.["required"];
      if (Array.isArray(required)) required.forEach(add);
    }
  }
  return fields;
}

/**
 * The key this wiki types pages with: `@type` or `type`, whichever more of its
 * pages use (both compile the same, `graph.ts`), so a new page matches its
 * neighbours. A wiki with neither gets `@type`.
 */
export function typeKey(config: Config): "@type" | "type" {
  let at = 0;
  let bare = 0;
  for (const filePath of iterDocumentFiles(config)) {
    if (extname(filePath).toLowerCase() !== ".md") continue;
    const data = splitFrontmatterText(readText(filePath)).data;
    if (data === null) continue;
    if ("@type" in data) at++;
    else if ("type" in data) bare++;
  }
  return bare > at ? "type" : "@type";
}
