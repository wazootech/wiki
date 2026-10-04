"""Generate canonical asserted/inferred graph goldens from the Python wiki engine.

Usage:
    PYTHONPATH=src/.venv python gen_goldens.py <config-path> <out-dir> <name>

For each target, region produces two N-Triples files with the term-set sorted line by line:
    <name>.asserted.nt       (load_graph / load_dataset, infer=False)
    <name>.inferred.nt       (load_graph / load_dataset, infer=True, owlrl DeductiveClosure(OWLRL_Semantics))
and a JSON manifest describing graph facts (triple counts per graph, named graphs).

Run with the wiki repo venv:  repos/wiki/.venv/Scripts/python.exe  (PYTHONPATH=src)
"""

import json
import sys
from pathlib import Path

from rdflib import Graph, Literal  # noqa: E402

from wiki.wiki import Wiki  # noqa: E402


def _canonical_nt(graph: Graph) -> list[str]:
    raw = graph.serialize(format="nt")
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return sorted(set(raw.splitlines()))


def _strip_literal_noise(graph: Graph) -> list[str]:
    clean = [t for t in graph if not (isinstance(t[0], Literal) or isinstance(t[1], Literal))]
    g = Graph()
    for t in clean:
        g.add(t)
    return _canonical_nt(g)


def main() -> None:
    (config_path, out_dir, name) = sys.argv[1:4]
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    w = Wiki.load(config_path)

    summary = {"name": name, "graphs": {}}

    for target in ("graph", "dataset"):
        for infer in (False, True):
            if target == "graph":
                g = w.graph(infer=infer, reload=True, disk_cache=False)
                lines = _canonical_nt(g)
                (out_dir / f"{name}.{target}.{'inferred' if infer else 'asserted'}.nt").write_text(
                    "\n".join(lines), encoding="utf-8"
                )
                if infer:
                    (out_dir / f"{name}.{target}.clean.nt").write_text(
                        "\n".join(_strip_literal_noise(g)), encoding="utf-8"
                    )
                summary["graphs"].setdefault(target, {})[str(infer)] = {
                    "triples": len(lines),
                    "named": [str(g.identifier)],
                }
            else:
                ds = w.dataset(infer=infer, reload=True, disk_cache=False)
                per_graph = {}
                for g in ds.graphs():
                    glines = _canonical_nt(g)
                    per_graph[str(g.identifier)] = glines
                for guri, glines in per_graph.items():
                    tag = f"{target}.{_slug(guri)}"
                    (out_dir / f"{name}.{tag}.{'inferred' if infer else 'asserted'}.nt").write_text(
                        "\n".join(glines), encoding="utf-8"
                    )
                summary["graphs"].setdefault(target, {})[str(infer)] = {
                    "triples": sum(len(v) for v in per_graph.values()),
                    "named": list(per_graph),
                }

    (out_dir / f"{name}.manifest.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


def _slug(uri: str) -> str:
    slug = uri.rstrip("/").rsplit("/", 1)[-1] or "root"
    slug = "".join(c if c.isalnum() or c in "-_" else "_" for c in slug)
    return slug.strip("_") or "graph"


if __name__ == "__main__":
    raise SystemExit(main())