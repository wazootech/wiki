import { dataFactory, termKey } from "@wazoo/sparql-engine";
import type { Quad, Term } from "@rdfjs/types";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDF_FIRST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#first";
const RDF_REST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest";
const RDF_NIL = "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil";
const RDFS_SUBCLASS = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const RDFS_SUBPROP = "http://www.w3.org/2000/01/rdf-schema#subPropertyOf";
const RDFS_DOMAIN = "http://www.w3.org/2000/01/rdf-schema#domain";
const RDFS_RANGE = "http://www.w3.org/2000/01/rdf-schema#range";
const OWL_EQUIV_CLASS = "http://www.w3.org/2002/07/owl#equivalentClass";
const OWL_EQUIV_PROP = "http://www.w3.org/2002/07/owl#equivalentProperty";
const OWL_INVERSE = "http://www.w3.org/2002/07/owl#inverseOf";
const OWL_SAME_AS = "http://www.w3.org/2002/07/owl#sameAs";
const OWL_TRANSITIVE = "http://www.w3.org/2002/07/owl#TransitiveProperty";
const OWL_FUNCTIONAL = "http://www.w3.org/2002/07/owl#FunctionalProperty";
const OWL_HAS_KEY = "http://www.w3.org/2002/07/owl#hasKey";
const OWL_PROPERTY_CHAIN = "http://www.w3.org/2002/07/owl#propertyChainAxiom";
const OWL_DISJOINT = "http://www.w3.org/2002/07/owl#disjointWith";
const OWL_COMPLEMENT = "http://www.w3.org/2002/07/owl#complementOf";

export interface InconsistencyReport {
  id: string;
  rule?: string;
  terms: Term[];
  quads: Quad[];
}

interface Index {
  bySubject: Map<string, Quad[]>;
  byObject: Map<string, Quad[]>;
  byPredicate: Map<string, Quad[]>;
}

function indexQuads(quads: Quad[]): Index {
  const bySubject = new Map<string, Quad[]>();
  const byObject = new Map<string, Quad[]>();
  const byPredicate = new Map<string, Quad[]>();
  const push = <T,>(m: Map<string, T[]>, k: string, v: T): void => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  for (const q of quads) {
    push(bySubject, termKey(q.subject), q);
    push(byObject, termKey(q.object), q);
    push(byPredicate, q.predicate.value, q);
  }
  return { bySubject, byObject, byPredicate };
}

function listMembers(idx: Index, head: Term): Term[] | null {
  const members: Term[] = [];
  const seen = new Set<string>();
  let node = head;
  while (true) {
    const nk = termKey(node);
    if (nk === termKey(dataFactory.namedNode(RDF_NIL))) return members;
    if (seen.has(nk)) return null;
    seen.add(nk);
    let member: Term | null = null;
    let rest: Term | null = null;
    for (const q of idx.bySubject.get(nk) ?? []) {
      const pv = q.predicate.value;
      if (pv === RDF_FIRST) member = q.object;
      else if (pv === RDF_REST) rest = q.object;
    }
    if (member === null || rest === null) return null;
    members.push(member);
    node = rest;
  }
}

const tripleKey = (s: Term, p: string, o: Term): string =>
  termKey(s) + " " + p + " " + termKey(o);

export class OWL2RLFallback {
  private vocabulary: Quad[] = [];
  private staticQ: Quad[] = [];

  load(vocabulary: Quad[]): string {
    this.vocabulary = vocabulary;
    this.staticQ = this.expand(vocabulary);
    return "";
  }

  getRuntime(): string {
    return "";
  }

  getStaticClosure(): Quad[] {
    return this.staticQ.slice();
  }

  getStaticInconsistencies(): InconsistencyReport[] {
    return detectInconsistencies(this.staticQ);
  }

  *infer(data: Quad[]): Generator<Quad> {
    const full = this.expand([...this.vocabulary, ...data]);
    const excluded = new Set<string>();
    for (const q of [...this.vocabulary, ...this.staticQ, ...data]) {
      excluded.add(tripleKey(q.subject, q.predicate.value, q.object));
    }
    for (const q of full) {
      const k = tripleKey(q.subject, q.predicate.value, q.object);
      if (!excluded.has(k)) {
        excluded.add(k);
        yield q;
      }
    }
  }

  inferWithDiagnostics(data: Quad[]): { quads: Quad[]; inconsistencies: InconsistencyReport[] } {
    const full = this.expand([...this.vocabulary, ...data]);
    const excluded = new Set<string>();
    for (const q of [...this.vocabulary, ...this.staticQ, ...data]) {
      excluded.add(tripleKey(q.subject, q.predicate.value, q.object));
    }
    const quads: Quad[] = [];
    for (const q of full) {
      const k = tripleKey(q.subject, q.predicate.value, q.object);
      if (!excluded.has(k)) {
        excluded.add(k);
        quads.push(q);
      }
    }
    return { quads, inconsistencies: detectInconsistencies([...this.vocabulary, ...data, ...full]) };
  }

  private expand(input: Quad[]): Quad[] {
    const current = input.slice();
    const seen = new Set<string>();
    const idxOut = new Map<string, Quad>();
    for (const q of current) {
      const k = tripleKey(q.subject, q.predicate.value, q.object);
      if (!seen.has(k)) {
        seen.add(k);
        idxOut.set(k, q);
      }
    }
    const addQuad = (q: Quad): boolean => {
      const k = tripleKey(q.subject, q.predicate.value, q.object);
      if (seen.has(k)) return false;
      seen.add(k);
      idxOut.set(k, q);
      return true;
    };
    const add = (s: Term, p: string, o: Term): boolean => {
      if (s.termType === "DefaultGraph" || o.termType === "DefaultGraph") return false;
      return addQuad(dataFactory.quad(s, dataFactory.namedNode(p), o));
    };
    const nn = (iri: string): Term => dataFactory.namedNode(iri);
    const keyOf = (t: Term): string => termKey(t);

    for (let round = 0; round < 128; round++) {
      const before = seen.size;
      const quads = [...idxOut.values()];
      const idx = indexQuads(quads);

      for (const q of quads) {
        const s = q.subject;
        const p = q.predicate.value;
        const o = q.object;

        if (p === RDFS_SUBCLASS) {
          for (const t of idx.bySubject.get(keyOf(o)) ?? []) {
            if (t.predicate.value === RDFS_SUBCLASS && keyOf(s) !== keyOf(t.object)) add(s, RDFS_SUBCLASS, t.object);
          }
          for (const t of idx.byObject.get(keyOf(s)) ?? []) {
            if (t.predicate.value === RDFS_SUBCLASS && keyOf(t.subject) !== keyOf(o)) add(t.subject, RDFS_SUBCLASS, o);
          }
        } else if (p === RDFS_SUBPROP) {
          for (const t of idx.bySubject.get(keyOf(o)) ?? []) {
            if (t.predicate.value === RDFS_SUBPROP && keyOf(s) !== keyOf(t.object)) add(s, RDFS_SUBPROP, t.object);
          }
        } else if (p === OWL_EQUIV_CLASS) {
          if (keyOf(s) !== keyOf(o)) {
            add(s, RDFS_SUBCLASS, o);
            add(o, RDFS_SUBCLASS, s);
          }
        } else if (p === OWL_EQUIV_PROP) {
          if (keyOf(s) !== keyOf(o)) {
            add(s, RDFS_SUBPROP, o);
            add(o, RDFS_SUBPROP, s);
          }
        } else if (p === OWL_INVERSE) {
          if (keyOf(s) !== keyOf(o)) add(o, OWL_INVERSE, s);
        } else if (p === RDFS_DOMAIN) {
          for (const t of idx.byPredicate.get(s.value) ?? []) {
            add(t.subject, RDF_TYPE, o);
          }
        } else if (p === RDFS_RANGE) {
          for (const t of idx.byPredicate.get(s.value) ?? []) {
            add(t.object, RDF_TYPE, o);
          }
        } else if (p === RDF_TYPE && o.termType === "NamedNode") {
          const ck = keyOf(o);
          for (const t of idx.bySubject.get(ck) ?? []) {
            if (t.predicate.value === RDFS_SUBCLASS) add(s, RDF_TYPE, t.object);
            if (t.predicate.value === OWL_EQUIV_CLASS) add(s, RDF_TYPE, t.object);
          }
          for (const t of idx.byObject.get(ck) ?? []) {
            if (t.predicate.value === OWL_EQUIV_CLASS) add(s, RDF_TYPE, t.subject);
          }
        } else if (p === OWL_SAME_AS && keyOf(s) !== keyOf(o)) {
          add(o, OWL_SAME_AS, s);
          for (const t of idx.bySubject.get(keyOf(s)) ?? []) {
            if (t.predicate.value === OWL_SAME_AS) continue;
            add(o, t.predicate.value, t.object);
          }
          for (const t of idx.byObject.get(keyOf(s)) ?? []) {
            add(t.subject, t.predicate.value, o);
          }
          for (const t of idx.bySubject.get(keyOf(o)) ?? []) {
            if (t.predicate.value === OWL_SAME_AS) continue;
            add(s, t.predicate.value, t.object);
          }
          for (const t of idx.byObject.get(keyOf(o)) ?? []) {
            add(t.subject, t.predicate.value, s);
          }
        }
      }

      for (const q of quads) {
        const s = q.subject;
        const p = q.predicate.value;
        const o = q.object;
        const isTransitive = () =>
          (idx.byPredicate.get(RDF_TYPE) ?? []).some(
            (t) => t.subject.value === p && t.object.value === OWL_TRANSITIVE,
          );
        const isFunctional = () =>
          (idx.byPredicate.get(RDF_TYPE) ?? []).some(
            (t) => t.subject.value === p && t.object.value === OWL_FUNCTIONAL,
          );

        if (isTransitive()) {
          for (const t of idx.bySubject.get(keyOf(o)) ?? []) {
            if (t.predicate.value === p && keyOf(s) !== keyOf(t.object)) add(s, p, t.object);
          }
        }
        if (isFunctional()) {
          const fillers: Term[] = [];
          for (const t of idx.byPredicate.get(p) ?? []) {
            if (keyOf(t.subject) === keyOf(s) && t.object.termType !== "Literal") fillers.push(t.object);
          }
          for (let i = 0; i < fillers.length; i++) {
            for (let j = i + 1; j < fillers.length; j++) {
              if (keyOf(fillers[i]) !== keyOf(fillers[j])) add(fillers[i], OWL_SAME_AS, fillers[j]);
            }
          }
        }
        if (p === RDFS_SUBPROP || p === OWL_EQUIV_PROP || p === OWL_INVERSE) {
          for (const t of idx.byPredicate.get(s.value) ?? []) {
            if (p === OWL_INVERSE) add(t.object, o.value, t.subject);
            else add(t.subject, o.value, t.object);
          }
          if (p === OWL_EQUIV_PROP || p === OWL_INVERSE) {
            for (const t of idx.byPredicate.get(o.value) ?? []) {
              if (p === OWL_INVERSE) add(t.object, s.value, t.subject);
              else add(t.subject, s.value, t.object);
            }
          }
        }
      }

      for (const keyQ of idxOut.values()) {
        if (keyQ.predicate.value !== OWL_HAS_KEY) continue;
        const props = listMembers(idx, keyQ.object);
        if (!props || props.length === 0) continue;
        const ck = keyOf(keyQ.subject);
        const members: Term[] = [];
        for (const t of idx.byPredicate.get(RDF_TYPE) ?? []) {
          if (keyOf(t.object) === ck) members.push(t.subject);
        }
        for (let i = 0; i < members.length; i++) {
          for (let j = i + 1; j < members.length; j++) {
            const a = members[i];
            const b = members[j];
            if (keyOf(a) !== keyOf(b) && valuesEqual(idx, a, props, b)) add(a, OWL_SAME_AS, b);
          }
        }
      }

      for (const chainQ of quads) {
        if (chainQ.predicate.value !== OWL_PROPERTY_CHAIN) continue;
        const props = listMembers(idx, chainQ.object);
        if (!props || props.length < 2) continue;
        const head = chainQ.subject;
        let pairs: Array<[Term, Term]> = [];
        for (const t of idx.byPredicate.get(props[0].value) ?? []) {
          pairs.push([t.subject, t.object]);
        }
        for (let step = 1; step < props.length; step++) {
          const next: Array<[Term, Term]> = [];
          for (const [a, mid] of pairs) {
            for (const t of idx.byPredicate.get(props[step].value) ?? []) {
              if (keyOf(t.subject) === keyOf(mid)) next.push([a, t.object]);
            }
          }
          pairs = next;
        }
        for (const [a, b] of pairs) {
          if (keyOf(a) !== keyOf(b)) add(a, head.value, b);
        }
      }

      if (seen.size === before) break;
    }

    return [...idxOut.values()].sort((a, b) =>
      tripleKey(a.subject, a.predicate.value, a.object).localeCompare(
        tripleKey(b.subject, b.predicate.value, b.object),
      )
    );
  }
}

function valuesEqual(idx: Index, a: Term, props: Term[], b: Term): boolean {
  for (const prop of props) {
    const pv = prop.value;
    const va = (idx.bySubject.get(termKey(a)) ?? []).filter((t) => t.predicate.value === pv);
    const vb = (idx.bySubject.get(termKey(b)) ?? []).filter((t) => t.predicate.value === pv);
    if (va.length === 0) return false;
    const ka = new Set(va.map((t) => termKey(t.object)));
    const kb = new Set(vb.map((t) => termKey(t.object)));
    if (ka.size !== kb.size) return false;
    for (const k of ka) if (!kb.has(k)) return false;
  }
  return true;
}

function detectInconsistencies(quads: Quad[]): InconsistencyReport[] {
  const idx = indexQuads(quads);
  const reports: InconsistencyReport[] = [];
  const nn = (iri: string): Term => dataFactory.namedNode(iri);

  for (const cand of idx.byPredicate.get(RDF_TYPE) ?? []) {
    if (cand.object.termType === "Literal") continue;
    const types = new Set<string>();
    for (const t of idx.bySubject.get(termKey(cand.subject)) ?? []) {
      if (t.predicate.value === RDF_TYPE) types.add(termKey(t.object));
    }
    const s = cand.subject;
    for (const d of idx.byPredicate.get(OWL_DISJOINT) ?? []) {
      if (types.has(termKey(d.subject)) && types.has(termKey(d.object)) && termKey(d.subject) !== termKey(d.object)) {
        reports.push({
          id: "fallback:inconsistency:cax-dw:" + termKey(s),
          rule: "cax-dw",
          terms: [s],
          quads: [cand, dataFactory.quad(d.subject, d.predicate, d.object)],
        });
      }
    }
    for (const c of idx.byPredicate.get(OWL_COMPLEMENT) ?? []) {
      if (types.has(termKey(c.subject)) && types.has(termKey(c.object)) && termKey(c.subject) !== termKey(c.object)) {
        reports.push({
          id: "fallback:inconsistency:cls-com:" + termKey(s),
          rule: "cls-com",
          terms: [s],
          quads: [cand, dataFactory.quad(c.subject, c.predicate, c.object)],
        });
      }
    }
  }

  for (const fp of idx.byPredicate.get(RDF_TYPE) ?? []) {
    if (fp.object.value !== OWL_FUNCTIONAL) continue;
    const fillers = new Map<string, Term[]>();
    for (const t of idx.byPredicate.get(fp.subject.value) ?? []) {
      if (t.object.termType !== "Literal") continue;
      const arr = fillers.get(termKey(t.subject)) ?? [];
      arr.push(t.object);
      fillers.set(termKey(t.subject), arr);
    }
    for (const list of fillers.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (termKey(list[i]) === termKey(list[j])) continue;
          reports.push({
            id: "fallback:inconsistency:eq-diff1:" + termKey(list[i]) + ":" + termKey(list[j]),
            rule: "eq-diff1",
            terms: [list[i], list[j]],
            quads: [dataFactory.quad(fp.subject, fp.predicate, fp.object)],
          });
          break;
        }
        if (reports.length > 0 && reports[reports.length - 1].rule === "eq-diff1") break;
      }
    }
  }

  void nn;
  return reports;
}