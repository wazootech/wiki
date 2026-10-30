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
export const EX = "https://bench.example/";
export const SCHEMA = "https://schema.org/";
export const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/** One organization per this many people. */
export const PEOPLE_PER_ORG = 20;
/** Triples per conforming person and per organization. */
export const PERSON_TRIPLES = 6;
export const ORG_TRIPLES = 3;

/** The shapes, in Turtle. Kept in one string so a consumer can copy it out. */
export const SHAPES_TURTLE = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix schema: <${SCHEMA}> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix bench: <${EX}shape/> .

bench:Person
    a sh:NodeShape ;
    sh:targetClass schema:Person ;
    sh:property [
        sh:path schema:givenName ;
        sh:minCount 1 ;
        sh:datatype xsd:string ;
    ] , [
        sh:path schema:email ;
        sh:maxCount 1 ;
    ] , [
        sh:path schema:worksFor ;
        sh:minCount 1 ;
        sh:class schema:Organization ;
    ] , [
        sh:path ( schema:worksFor schema:name ) ;
        sh:minCount 1 ;
    ] , [
        sh:path schema:knows ;
        sh:nodeKind sh:IRI ;
        sh:class schema:Person ;
    ] .

bench:Organization
    a sh:NodeShape ;
    sh:targetClass schema:Organization ;
    sh:property [
        sh:path schema:name ;
        sh:minCount 1 ;
        sh:maxCount 1 ;
    ] , [
        sh:path [ sh:inversePath schema:worksFor ] ;
        sh:minCount 1 ;
    ] .
`;
