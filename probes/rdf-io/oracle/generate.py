"""Serialize the shared fixture with rdflib, the way the Python engine does.

Run from the oracle checkout:

    PYTHONPATH=src ./.venv/Scripts/python.exe <probe>/oracle/generate.py <probe>

Writes one file per format under `<probe>/oracle/`, plus a parse check of the
Deno side's output so the comparison runs in both directions.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from rdflib import BNode, Graph, Literal, URIRef
from rdflib.namespace import RDF, XSD

probe = Path(sys.argv[1])
fixture = json.loads((probe / "graph.json").read_text(encoding="utf-8"))[0]["triples"]

graph = Graph()
blank_nodes: dict[int, BNode] = {}


def term(spec: dict) -> object:
    if "iri" in spec:
        return URIRef(spec["iri"])
    if "blank" in spec:
        key = id(spec)
        blank_nodes.setdefault(key, BNode())
        return blank_nodes[key]
    if "datatype" in spec:
        return Literal(spec["literal"], datatype=URIRef(spec["datatype"]))
    if "lang" in spec:
        return Literal(spec["literal"], lang=spec["lang"])
    return Literal(spec["literal"])


for triple in fixture:
    graph.add((term(triple["s"]), URIRef(triple["p"]), term(triple["o"])))

out = probe / "oracle"
out.mkdir(exist_ok=True)

(out / "nt.txt").write_text(graph.serialize(format="nt"), encoding="utf-8")
(out / "turtle.txt").write_text(graph.serialize(format="turtle"), encoding="utf-8")
(out / "xml.txt").write_text(graph.serialize(format="xml"), encoding="utf-8")
(out / "jsonld.txt").write_text(graph.serialize(format="json-ld", indent=2), encoding="utf-8")
# `nquads` is not a single-graph rdflib format in the engine either: it is the
# dialect `format.py` writes by hand with `term.n3()`.
lines = [f"{s.n3()} {p.n3()} {o.n3()} ." for s, p, o in graph]
(out / "nquads.txt").write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

# Reverse direction: can rdflib read what the Deno side writes?
deno = probe / "deno"
report = {}
for name, fmt in (("nt.txt", "nt"), ("turtle.txt", "turtle"), ("xml.txt", "xml")):
    source = deno / name
    if not source.exists():
        report[name] = "missing"
        continue
    reparsed = Graph()
    try:
        reparsed.parse(source, format=fmt)
        report[name] = f"ok {len(reparsed)} triples"
    except Exception as exc:  # noqa: BLE001 - the message is the finding
        report[name] = f"FAILED {type(exc).__name__}: {exc}"

# And the fixture as reported by rdflib, for a term-level comparison.
report["n3"] = [f"{s.n3()} {p.n3()} {o.n3()}" for s, p, o in graph]
(out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
