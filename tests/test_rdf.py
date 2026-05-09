import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from rdflib import Graph, URIRef, RDF, Literal, Namespace
from rdflib.namespace import XSD

from wiki_cli.context import WikiConfig, Context
from wiki_cli.rdf import (
    frontmatter_to_graph,
    kebab_case,
    resolve_predicate,
    resolve_object,
    build_name_to_id_map,
    resolve_blank_nodes,
    load_graph,
    graph_stats,
)


class TestRDFFrontmatter(unittest.TestCase):
    def setUp(self) -> None:
        self.config = WikiConfig()
        self.context = self.config.context

    def test_kebab_case(self) -> None:
        """Test kebab-case conversion helper."""
        self.assertEqual(kebab_case("John Smith! & Co."), "john-smith--co")
        self.assertEqual(kebab_case(""), "")
        self.assertEqual(kebab_case("some--double--dashes"), "some-double-dashes")

    def test_resolve_predicate(self) -> None:
        """Test resolve_predicate handles various prefixes and fallback mappings."""
        # Custom namespace prefix
        self.assertEqual(
            resolve_predicate("foaf:name", self.context),
            self.context.namespaces["foaf"]["name"]
        )
        # Wiki prefix
        self.assertEqual(
            resolve_predicate("wiki.gregory", self.context),
            self.context.namespaces["wiki"]["gregory"]
        )
        # Unregistered prefix or default falls back to schema
        self.assertEqual(
            resolve_predicate("givenName", self.context),
            self.context.namespaces["schema"]["givenName"]
        )
        self.assertEqual(
            resolve_predicate("unregistered:prop", self.context),
            self.context.namespaces["schema"]["unregistered:prop"]
        )

    def test_resolve_object_datatypes(self) -> None:
        """Test resolve_object maps booleans, numbers, HTTP URIs, None, and strings correctly."""
        graph = Graph()
        subject = URIRef(self.context.namespaces["wiki"]["gregory"])
        
        # HTTP URI
        resolve_object("url", "https://google.com", graph, subject, self.context)
        url_pred = self.context.namespaces["schema"]["url"]
        self.assertTrue((subject, url_pred, URIRef("https://google.com")) in graph)
        
        # Boolean
        resolve_object("knows", True, graph, subject, self.context)
        knows_pred = self.context.namespaces["schema"]["knows"]
        self.assertTrue((subject, knows_pred, Literal(True, datatype=XSD.boolean)) in graph)
        
        # Numbers
        resolve_object("age", 30, graph, subject, self.context)
        age_pred = self.context.namespaces["schema"]["age"]
        self.assertTrue((subject, age_pred, Literal(30)) in graph)
        
        # None (should add nothing)
        resolve_object("nothing", None, graph, subject, self.context)
        nothing_pred = self.context.namespaces["schema"]["nothing"]
        self.assertEqual(len(list(graph.objects(subject, nothing_pred))), 0)

    def test_nested_dict_creates_blank_node(self) -> None:
        """Test that a nested dictionary without explicit @type creates a blank node."""
        data = {
            "@type": "Person",
            "@id": "wiki:gregory",
            "name": "Gregory",
            "address": {
                "street": "123 Main St",
                "city": "Seattle"
            }
        }
        graph = frontmatter_to_graph(data, self.context)
        subject = URIRef(self.context.namespaces["wiki"]["gregory"])

        # Verify name predicate
        name_pred = self.context.namespaces["schema"]["name"]
        self.assertTrue((subject, name_pred, Literal("Gregory")) in graph)
        
        # Verify address predicate points to a blank node
        address_pred = self.context.namespaces["schema"]["address"]
        blank_nodes = list(graph.objects(subject, address_pred))
        self.assertEqual(len(blank_nodes), 1)
        blank = blank_nodes[0]
        self.assertTrue(isinstance(blank, URIRef) and str(blank).startswith("_:blank"))
        
        # Verify properties on the blank node
        street_pred = self.context.namespaces["schema"]["street"]
        city_pred = self.context.namespaces["schema"]["city"]
        self.assertTrue((blank, street_pred, Literal("123 Main St")) in graph)
        self.assertTrue((blank, city_pred, Literal("Seattle")) in graph)

    def test_nested_typed_dict_creates_typed_blank_node(self) -> None:
        """Test that a nested dictionary with @type creates a typed blank node."""
        data = {
            "@type": "Person",
            "@id": "wiki:gregory",
            "name": "Gregory",
            "address": {
                "@type": "PostalAddress",
                "street": "123 Main St"
            }
        }
        graph = frontmatter_to_graph(data, self.context)
        subject = URIRef(self.context.namespaces["wiki"]["gregory"])
        address_pred = self.context.namespaces["schema"]["address"]
        blank = list(graph.objects(subject, address_pred))[0]
        
        type_pred = RDF.type
        expected_type = self.context.namespaces["schema"]["PostalAddress"]
        self.assertTrue((blank, type_pred, expected_type) in graph)

    def test_nested_referenced_dict_creates_uri_ref(self) -> None:
        """Test that a nested dictionary with @id maps directly to a URI reference."""
        data = {
            "@type": "Person",
            "@id": "wiki:gregory",
            "name": "Gregory",
            "spouse": {
                "@id": "wiki:bella"
            }
        }
        graph = frontmatter_to_graph(data, self.context)
        subject = URIRef(self.context.namespaces["wiki"]["gregory"])
        spouse_pred = self.context.namespaces["schema"]["spouse"]
        spouse_obj = list(graph.objects(subject, spouse_pred))[0]
        
        expected_spouse = URIRef(self.context.namespaces["wiki"]["bella"])
        self.assertEqual(spouse_obj, expected_spouse)

    def test_nested_list_of_dicts_creates_multiple_nodes(self) -> None:
        """Test that a list of nested dictionaries creates corresponding multiple blank nodes."""
        data = {
            "@type": "Person",
            "@id": "wiki:gregory",
            "address": [
                {"street": "123 Main St"},
                {"street": "456 Oak Ave"}
            ]
        }
        graph = frontmatter_to_graph(data, self.context)
        subject = URIRef(self.context.namespaces["wiki"]["gregory"])
        address_pred = self.context.namespaces["schema"]["address"]
        blanks = list(graph.objects(subject, address_pred))
        self.assertEqual(len(blanks), 2)
        
        street_pred = self.context.namespaces["schema"]["street"]
        streets = {str(graph.value(blank, street_pred)) for blank in blanks}
        self.assertEqual(streets, {"123 Main St", "456 Oak Ave"})

    def test_auto_inject_markdown_body(self) -> None:
        """Test that the markdown body is auto-injected into the graph if content_predicate is set."""
        data = {
            "@type": "Person",
            "@id": "wiki:gregory",
            "name": "Gregory"
        }
        self.config.content_predicate = "schema:text"
        body_text = "Gregory is a software engineer."
        
        graph = frontmatter_to_graph(data, self.config, body=body_text)
        subject = URIRef(self.context.namespaces["wiki"]["gregory"])
        
        text_pred = self.context.namespaces["schema"]["text"]
        self.assertTrue((subject, text_pred, Literal(body_text)) in graph)

    def test_frontmatter_to_graph_empty_and_id_generation(self) -> None:
        """Test empty dictionary handling and fallback id generation logic."""
        # Empty dict or missing type -> Empty graph
        self.assertEqual(len(frontmatter_to_graph({}, self.config)), 0)
        
        # Missing type -> Empty graph
        self.assertEqual(len(frontmatter_to_graph({"name": "Alice"}, self.config)), 0)
        
        # Missing @id, with file_id
        g_file = frontmatter_to_graph({"@type": "WebPage"}, self.config, file_id="doc")
        base = str(self.context.namespaces["wiki"])
        self.assertTrue((URIRef(f"{base}doc.md"), RDF.type, self.context.namespaces["schema"]["WebPage"]) in g_file)
        
        # Missing @id, type is Person, givenName & familyName
        g_person = frontmatter_to_graph({"@type": "Person", "givenName": "Alice", "familyName": "Smith"}, self.config)
        self.assertTrue((URIRef(f"{base}alice-smith.md"), RDF.type, self.context.namespaces["schema"]["Person"]) in g_person)

        # Missing @id, type is not Person, name is present
        g_page = frontmatter_to_graph({"@type": "WebPage", "name": "Some Page"}, self.config)
        self.assertTrue((URIRef(f"{base}some-page.md"), RDF.type, self.context.namespaces["schema"]["WebPage"]) in g_page)


class TestRDFLoadingAndResolution(unittest.TestCase):
    def test_resolve_blank_nodes_and_load_graph(self) -> None:
        """Test build_name_to_id_map, resolve_blank_nodes, and load_graph integration."""
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            
            # Create a person file that has an explicit @id (using valid YAML syntax with quoted @ keys)
            person1 = wiki_dir / "gregory.md"
            person1_content = """---
"@type": Person
"@id": "wiki:gregory"
name: Gregory Smith
givenName: Gregory
familyName: Smith
---
"""
            person1.write_text(person1_content, encoding="utf-8")
            
            # Create another person file with a blank node relation to Gregory
            person2 = wiki_dir / "bella.md"
            person2_content = """---
"@type": Person
"@id": "wiki:bella"
name: Bella
spouse:
  name: Gregory Smith
---
"""
            person2.write_text(person2_content, encoding="utf-8")
            
            config = WikiConfig(wiki_dir=wiki_dir)
            
            # 1. Test build_name_to_id_map
            name_map = build_name_to_id_map(wiki_dir, config.context)
            self.assertEqual(name_map.get("gregory smith"), "wiki:gregory")
            self.assertEqual(name_map.get("gregory"), "wiki:gregory")
            
            # 2. Test load_graph and blank node resolution
            graph = load_graph(config, infer=False)
            
            # Spouse blank node should resolve correctly
            subject = URIRef(config.namespaces["wiki"]["bella"])
            spouse_pred = config.namespaces["schema"]["spouse"]
            spouse_objs = list(graph.objects(subject, spouse_pred))
            self.assertEqual(len(spouse_objs), 1)
            self.assertEqual(spouse_objs[0], URIRef("wiki:gregory"))
            
            # Test graph stats
            stats = graph_stats(graph)
            self.assertGreater(stats["triples"], 0)


if __name__ == "__main__":
    unittest.main()
