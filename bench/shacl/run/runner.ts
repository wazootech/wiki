import { join } from "@std/path";
import { orgIri, personIri, SHAPES_TURTLE } from "../fixture.ts";
import { PAGES } from "./options.ts";

/**
 * A Markdown page for a person the fixture also knows about, so the scoped
 * cases validate real frontmatter. Scoped mode sees only the page, so the
 * `sh:class` and path constraints that reach other documents report there:
 * that is scoped mode's documented behaviour, and it times the report path.
 */
function page(index: number): string {
  return [
    "---",
    "type: Person",
    `givenName: Bench ${index}`,
    `email: bench-${index}@bench.example`,
    "worksFor:",
    `  "@id": ${orgIri(0)}`,
    "knows:",
    `  "@id": ${personIri(index)}`,
    "---",
    `# Bench Person ${index}`,
    "",
  ].join("\n");
}

export function writeFixture(
  dir: string,
  ntriples: string,
  withWiki: boolean,
): void {
  Deno.mkdirSync(dir, { recursive: true });
  Deno.writeTextFileSync(join(dir, "data.nt"), ntriples);
  Deno.writeTextFileSync(join(dir, "shapes.ttl"), SHAPES_TURTLE);
  if (!withWiki) return;
  const wiki = join(dir, "wiki");
  Deno.mkdirSync(wiki, { recursive: true });
  Deno.writeTextFileSync(join(wiki, "data.nt"), ntriples);
  Deno.writeTextFileSync(join(wiki, "shapes.ttl"), SHAPES_TURTLE);
  for (let i = 0; i < PAGES; i++) {
    Deno.writeTextFileSync(join(wiki, `Bench_Person_${i}.md`), page(i));
  }
}

export function seconds(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function megabytes(bytes: number | null): string {
  return bytes === null ? "n/a" : `${Math.round(bytes / 2 ** 20)} MB`;
}

export function phaseText(phases: Readonly<Record<string, number>>): string {
  return Object.entries(phases)
    .map(([name, ms]) => `${name} ${seconds(ms)}`)
    .join(", ");
}
