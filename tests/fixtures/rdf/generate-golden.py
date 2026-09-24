"""Generate the RDF dialect goldens from the pinned oracle.

The two files this writes are the byte-level contract for the port's writers:

- ``oracle-nt.txt`` is ``Graph.serialize(format="nt")`` — rdflib's
  ``NTSerializer`, which escapes a newline as ``\\n``. This is the
  ``.wiki/cache/*.nt`` dialect.
- ``oracle-nquads.txt`` is ``format.py::_serialize_nquads_graph`` — the
  hand-rolled writer built on ``term.n3()``, which switches to a triple-quoted
  literal when the value contains a newline. This is the ``export --format
  nquads`` dialect.

They differ on purpose, which is why the port has two functions.

Run from the oracle checkout:

    PYTHONPATH=src ./.venv/Scripts/python.exe <worktree>/tests/fixtures/rdf/generate-golden.py \\
        <worktree>/tests/fixtures/rdf
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from rdflib import Graph, Literal, URIRef

out = Path(sys.argv[1])
fixture = json.loads((out / "terms.json").read_text(encoding="utf-8"))["triples"]

graph = Graph()


def term(spec: dict) -> object:
    if "iri" in spec:
        return URIRef(spec["iri"])
    if "datatype" in spec:
        return Literal(spec["literal"], datatype=URIRef(spec["datatype"]))
    if "lang" in spec:
        return Literal(spec["literal"], lang=spec["lang"])
    return Literal(spec["literal"])


for item in fixture:
    graph.add((term(item["s"]), URIRef(item["p"]), term(item["o"])))

# `write_text` would translate newlines on Windows; the goldens are compared
# with the port's output, which is LF everywhere.
(out / "oracle-nt.txt").write_text(graph.serialize(format="nt"), encoding="utf-8", newline="\n")

# Exactly `format.py::_serialize_nquads_graph`.
lines = [f"{s.n3()} {p.n3()} {o.n3()} ." for s, p, o in graph]
(out / "oracle-nquads.txt").write_text(
    "\n".join(lines) + ("\n" if lines else ""), encoding="utf-8", newline="\n"
)

print(f"wrote {len(lines)} triples to {out}")
print(f"nt bytes: {(out / 'oracle-nt.txt').read_bytes()!r}"[:200])
