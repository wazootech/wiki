import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from rdflib import Graph, URIRef, RDF, RDFS, Namespace

from wiki_cli.context import WikiConfig
from wiki_cli.reasoning import apply_inference
from wiki_cli.rdf import load_graph

class TestReasoning(unittest.TestCase):
    def test_full_reasoning_pipeline(self) -> None:
        """Test that custom axioms in reasoning_dir flow into the central graph and expand it successfully."""
        with TemporaryDirectory() as tmpdir:
            reasoning_dir = Path(tmpdir) / "ontology"
            reasoning_dir.mkdir()
            wiki_dir = Path(tmpdir) / "wiki"
            wiki_dir.mkdir()
            
            # Create an axiom: Person subClassOf Agent
            axiom_content = """
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <https://schema.org/> .
schema:Person rdfs:subClassOf schema:Agent .
"""
            (reasoning_dir / "custom-axiom.ttl").write_text(axiom_content, encoding="utf-8")
            
            # Create a mini wiki page stating Gregory is a Person
            (wiki_dir / "gregory.md").write_text("""---
type: Person
name: Gregory
---
""", encoding="utf-8")
            
            # 1. Configure and Load
            config = WikiConfig(wiki_dir=wiki_dir, reasoning_dir=reasoning_dir)
            
            # Disable auto inference in loader to confirm pre/post state
            graph = load_graph(config, infer=False)
            
            schema = Namespace("https://schema.org/")
            gregory = URIRef("https://wiki.example.org/gregory.md")
            
            # Confirm pre-state: has axiom, has type, but NO inferred Agent yet
            self.assertTrue((schema.Person, RDFS.subClassOf, schema.Agent) in graph)
            self.assertFalse((gregory, RDF.type, schema.Agent) in graph)
            
            # 2. Run Inference
            expanded_graph = apply_inference(graph, config)
            
            # 3. Confirm post-state: Derivation worked!
            self.assertTrue((gregory, RDF.type, schema.Agent) in expanded_graph)

if __name__ == "__main__":
    unittest.main()
