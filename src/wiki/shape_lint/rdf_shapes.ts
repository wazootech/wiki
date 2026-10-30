import type { Config } from "../config.ts";
import { rdfSources } from "../graph.ts";
import { resolve } from "@std/path";
import type { IssueDetail } from "../schemas/reports.ts";
import { SourceFindings, TripleIndex } from "./triples.ts";
import { isShaclRelevant } from "./source_path.ts";
import { lintSource } from "./source.ts";

/** The findings of {@link lintShapeDefinitions}, one list per rule. */
export interface ShapeLintResult {
  /** `check.shape_definition`: shapes that break a SHACL Core rule. */
  readonly definitions: IssueDetail[];
  /** `check.shape_unused`: node shapes that apply to nothing. */
  readonly unused: IssueDetail[];
}

/**
 * Lint the shapes written in RDF rather than frontmatter: ` ```turtle `
 * blocks and RDF data files under `wiki.input`. Findings name the source and
 * the shape (an IRI, or the triples that reach a blank node from one), since
 * there is no frontmatter key to point at.
 */
export async function lintRdfShapes(
  config: Config,
  fileFilter: ReadonlySet<string> | null,
  filePaths: readonly string[] | null,
  lint: { readonly definitions: boolean; readonly unused: boolean },
  referenced: () => Promise<Set<string>>,
): Promise<ShapeLintResult> {
  const definitions: IssueDetail[] = [];
  const unused: IssueDetail[] = [];
  const scoped = filePaths === null
    ? null
    : new Set(filePaths.map((path) => resolve(path)));
  for (const source of await rdfSources(config)) {
    if (scoped !== null && !scoped.has(resolve(source.path))) continue;
    if (
      fileFilter !== null &&
      (source.route === null || !fileFilter.has(source.route))
    ) continue;
    if (!source.quads.some(isShaclRelevant)) continue;
    const label = source.route === null
      ? config.relativeToRoot(source.path)
      : `${source.route} (turtle block ${source.block})`;
    const index = new TripleIndex(source.quads);
    const findings = new SourceFindings(label, index, config.context);
    const unusedFindings = lint.unused
      ? new SourceFindings(label, index, config.context)
      : null;
    await lintSource(index, findings, unusedFindings, referenced);
    const detail = (message: string): IssueDetail => ({
      message,
      path: source.path,
      route: source.route,
    });
    if (lint.definitions) definitions.push(...findings.messages.map(detail));
    if (unusedFindings !== null) {
      unused.push(...unusedFindings.messages.map(detail));
    }
  }
  return { definitions, unused };
}
