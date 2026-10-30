/**
 * The shared SHACL benchmark fixture (#414): a seeded, deterministic graph of
 * people and organizations at a requested size, and the shapes it is checked
 * against.
 *
 * The output is plain N-Triples and Turtle on purpose. The same files feed the
 * Wiki cases here and any Worlds-side measurement (an import into SQLite/D1),
 * so neither side's numbers depend on a different graph. The same `quads` and
 * `seed` always produce byte-identical files.
 *
 * The shapes exercise the constraint kinds #414 names as the scaling risks: a
 * class target, `sh:class` (needs the value's type, one hop away), a two-step
 * sequence path, and an inverse path (needs inbound edges). About 1% of people
 * carry a planted violation so the report path is measured too, not only the
 * conforming one.
 */

/** The data namespace the fixture mints IRIs in. */
import {
  EX,
  ORG_TRIPLES,
  PEOPLE_PER_ORG,
  PERSON_TRIPLES,
  RDF_TYPE,
  SCHEMA,
} from "./fixture/constants.ts";

export { EX, SHAPES_TURTLE } from "./fixture/constants.ts";

/** What a fixture holds, and how many violations were planted in it. */
export interface Fixture {
  readonly people: number;
  readonly orgs: number;
  /** Exact triple count of {@link Fixture.ntriples}. */
  readonly quads: number;
  /** People carrying a planted violation. */
  readonly violatingPeople: number;
  readonly ntriples: string;
}

/** mulberry32: a small seeded PRNG, so a fixture never depends on `Math.random`. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function personIri(index: number): string {
  return `${EX}person/${index}`;
}

export function orgIri(index: number): string {
  return `${EX}org/${index}`;
}

function iri(value: string): string {
  return `<${value}>`;
}

function str(value: string): string {
  return JSON.stringify(value);
}

/** The person count that lands a fixture closest to `quads` triples. */
export function peopleFor(quads: number): number {
  const perBlock = PEOPLE_PER_ORG * PERSON_TRIPLES + ORG_TRIPLES;
  return Math.max(
    PEOPLE_PER_ORG,
    Math.round(quads * PEOPLE_PER_ORG / perBlock),
  );
}

/** The organization a person works for, before any planted violation. */
export function employerOf(person: number): number {
  return Math.floor(person / PEOPLE_PER_ORG);
}

/**
 * Generate a fixture of about `quads` triples.
 *
 * Violations are planted in three kinds, a third each: a missing `givenName`
 * (minCount), a second `email` (maxCount), and a `worksFor` pointing at a
 * person (`sh:class`, which also breaks the sequence path).
 */
export function generateFixture(quads: number, seed = 414): Fixture {
  const random = prng(seed);
  const people = peopleFor(quads);
  const orgs = Math.ceil(people / PEOPLE_PER_ORG);
  const lines: string[] = [];
  const type = iri(RDF_TYPE);
  const s = (term: string) => iri(`${SCHEMA}${term}`);
  let violatingPeople = 0;

  for (let o = 0; o < orgs; o++) {
    const org = iri(orgIri(o));
    lines.push(`${org} ${type} ${s("Organization")} .`);
    lines.push(`${org} ${s("name")} ${str(`Org ${o}`)} .`);
    lines.push(`${org} ${s("url")} ${iri(`https://org-${o}.example/`)} .`);
  }

  for (let p = 0; p < people; p++) {
    const person = iri(personIri(p));
    const violation = random() < 0.01 ? Math.floor(random() * 3) : -1;
    if (violation >= 0) violatingPeople++;
    const knows = Math.floor(random() * people);

    lines.push(`${person} ${type} ${s("Person")} .`);
    if (violation !== 0) {
      lines.push(`${person} ${s("givenName")} ${str(`Given${p}`)} .`);
    }
    lines.push(`${person} ${s("familyName")} ${str(`Family${p}`)} .`);
    lines.push(`${person} ${s("email")} ${str(`p${p}@bench.example`)} .`);
    if (violation === 1) {
      lines.push(`${person} ${s("email")} ${str(`p${p}.alt@bench.example`)} .`);
    }
    const employer = violation === 2
      ? iri(personIri(knows))
      : iri(orgIri(employerOf(p)));
    lines.push(`${person} ${s("worksFor")} ${employer} .`);
    lines.push(`${person} ${s("knows")} ${iri(personIri(knows))} .`);
  }

  return {
    people,
    orgs,
    quads: lines.length,
    violatingPeople,
    ntriples: lines.join("\n") + "\n",
  };
}
