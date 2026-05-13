import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from rdflib import Graph, URIRef, RDF, Literal
from rdflib.namespace import XSD

from wiki_cli.config import WikiConfig
from wiki_cli.graph import (
    frontmatter_to_graph,
    kebab_case,
    resolve_predicate,
    resolve_object,
    build_person_name_map,
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

        # 4. Datetime object mapping
        from datetime import date
        bday_pred = self.context.namespaces["schema"]["birthDate"]
        resolve_object("birthDate", date(1990, 1, 1), graph, subject, self.context)
        self.assertTrue((subject, bday_pred, Literal(date(1990, 1, 1), datatype=XSD.date)) in graph)

        # 5. String with unregistered prefix (falls back to Literal)
        unreg_pred = self.context.namespaces["schema"]["unregistered"]
        resolve_object("unregistered", "bogus:value", graph, subject, self.context)
        self.assertTrue((subject, unreg_pred, Literal("bogus:value")) in graph)

        # 6. Generic object stringification fallback
        tuple_pred = self.context.namespaces["schema"]["tup"]
        resolve_object("tup", (1, 2), graph, subject, self.context)
        self.assertTrue((subject, tuple_pred, Literal("(1, 2)")) in graph)

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

    def test_native_microdata_parsing(self) -> None:
        """Test that the dynamically registered microdata parser extracts triples via format='microdata'."""
        html_content = """
        <div itemscope itemtype="https://schema.org/Person">
            <span itemprop="name">John Microdata</span>
            <a itemprop="url" href="https://microdata.io">Page</a>
        </div>
        """
        g = Graph()
        # Invoke native plugin
        g.parse(data=html_content, format="microdata")
        
        # Verify contents were extracted
        self.assertGreater(len(g), 0)
        found_name = False
        for s, p, o in g:
            if str(p) == "https://schema.org/name" and str(o) == "John Microdata":
                found_name = True
            if str(p) == "https://schema.org/url":
                self.assertEqual(str(o), "https://microdata.io")
        
        self.assertTrue(found_name, "Failed to find Microdata name literal in graph.")

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
        base = str(self.context.namespaces["wiki"])
        
        # Empty dict or missing type -> Empty graph
        self.assertEqual(len(frontmatter_to_graph({}, self.config)), 0)
        
        # Missing type -> Empty graph
        self.assertEqual(len(frontmatter_to_graph({"name": "Alice"}, self.config)), 0)
        
        # Missing @id, with file_id -> uses file_id without .md
        g_file = frontmatter_to_graph({"@type": "WebPage"}, self.config, file_id="doc")
        self.assertTrue((URIRef(f"{base}doc"), RDF.type, self.context.namespaces["schema"]["WebPage"]) in g_file)
        
        # Missing @id, with file_id and uri_ext=True -> uses file_id with .md
        g_file_ext = frontmatter_to_graph({"@type": "WebPage"}, self.config, file_id="doc", uri_ext=True)
        self.assertTrue((URIRef(f"{base}doc.md"), RDF.type, self.context.namespaces["schema"]["WebPage"]) in g_file_ext)
        
        # Missing @id, no file_id -> Empty graph (no Person special-case fallback anymore)
        self.assertEqual(len(frontmatter_to_graph({"@type": "Person", "givenName": "Alice", "familyName": "Smith"}, self.config)), 0)
        self.assertEqual(len(frontmatter_to_graph({"@type": "WebPage", "name": "Some Page"}, self.config)), 0)
        self.assertEqual(len(frontmatter_to_graph({"@type": "Person", "name": "Cher"}, self.config)), 0)


class TestRDFLoadingAndResolution(unittest.TestCase):
    def test_resolve_blank_nodes_and_load_graph(self) -> None:
        """Test build_person_name_map, resolve_blank_nodes, and load_graph integration."""
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
            
            config = WikiConfig(input_dirs=[wiki_dir])
            
            # 1. Test build_person_name_map
            name_map = build_person_name_map(config.input_dirs, config.context)
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

    def test_multi_type_and_implicit_id_mapping(self) -> None:
        """Test multi-type arrays in frontmatter and implicit ID mapping fallback in loading sequence."""
        config = WikiConfig()
        ctx = config.context
        
        # 1. Verify multi-type parsing logic executes and adds multiple types
        data = {
            "@type": ["Person", "Developer"],
            "@id": "wiki:multi",
            "name": "Multi Guy"
        }
        g = frontmatter_to_graph(data, ctx)
        subj = URIRef(ctx.namespaces["wiki"]["multi"])
        types = list(g.objects(subj, RDF.type))
        self.assertEqual(len(types), 2)
        self.assertIn(ctx.namespaces["schema"]["Person"], types)
        self.assertIn(ctx.namespaces["schema"]["Developer"], types)

        # 2. Verify implicit fallback ID generation inside name-to-id mapper (uses file stem)
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            implicit_person = wiki_dir / "jimmy-neutron.md"
            implicit_content = """---
"@type": Person
givenName: Jimmy
familyName: Neutron
---
"""
            implicit_person.write_text(implicit_content, encoding="utf-8")
            name_map = build_person_name_map([wiki_dir], ctx)
            
            # The fallback format uses the file stem: {wiki_base}{stem} (no .md by default)
            expected_fallback = f"{config.wiki_base}jimmy-neutron"
            self.assertEqual(name_map.get("jimmy neutron"), expected_fallback)

            # 3. Verify implicit fallback for Person with only standalone name
            single_person = wiki_dir / "zendaya.md"
            single_person.write_text("---\n\"@type\": Person\nname: Zendaya\n---\n", encoding="utf-8")
            name_map_2 = build_person_name_map([wiki_dir], ctx)
            self.assertEqual(name_map_2.get("zendaya"), f"{config.wiki_base}zendaya")

    def test_load_graph_advanced_sources(self) -> None:
        """Test the unified graph loader handles multiple input dirs and gracefully ignores broken internal Turtle."""
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            imports = root / "imports"
            wiki.mkdir()
            imports.mkdir()

            # Create faulty import file to exercise exception catcher in standalone loader
            bad_ttl = imports / "error.ttl"
            bad_ttl.write_text("UNPARSABLE NONSENSE", encoding="utf-8")

            # A valid wiki file hosting a MALFORMED turtle codeblock AND a valid body payload
            valid_md = wiki / "safe.md"
            valid_md.write_text("""---
"@type": WebPage
name: Safe Page
---
This is body text loaded by content_predicate.
```turtle
@prefix : <#> .
:broken syntax !!!!!!
```
""", encoding="utf-8")

            # A secondary file in the imports dir with valid body payload to verify both loops
            extra_md = imports / "raw_discovery.md"
            extra_md.write_text("""---
"@type": Person
"@id": "wiki:raw_agent"
name: Raw Agent
---
Raw Body Text.
""", encoding="utf-8")

            config = WikiConfig(input_dirs=[wiki, imports])
            config.content_predicate = "schema:text"
            
            # Load graph should not crash due to bad TTLs or broken syntax, and must ingest everything
            g = load_graph(config, infer=False)
            
            self.assertGreater(len(g), 0)
            # Verify bodies parsed successfully from all locations
            body_text_full = " ".join(str(o) for o in g.objects(None, config.context.namespaces["schema"]["text"]))
            self.assertIn("This is body text loaded by content_predicate.", body_text_full)
            self.assertIn("Raw Body Text.", body_text_full)
            
            # Must find entity from wiki dir
            self.assertTrue((None, None, Literal("Safe Page")) in g)
            # Must find entity from imports dir
            raw_agent_uri = config.context.namespaces["wiki"]["raw_agent"]
            self.assertTrue((raw_agent_uri, RDF.type, config.context.namespaces["schema"]["Person"]) in g)


    def test_load_graph_logs_warnings_on_bad_files(self) -> None:
        """Test that load_graph emits warnings for unparseable content instead of silent pass."""
        import logging
        from wiki_cli.graph import logger as graph_logger

        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            wiki = root / "wiki"
            wiki.mkdir()

            # Valid wiki file
            valid_md = wiki / "good.md"
            valid_md.write_text("""---
"@type": WebPage
name: Good Page
---
""", encoding="utf-8")

            # Invalid .ttl file — triggers warning
            bad_ttl = wiki / "broken.ttl"
            bad_ttl.write_text("UNPARSABLE GARBAGE", encoding="utf-8")

            config = WikiConfig(input_dirs=[wiki])

            with self.assertLogs(graph_logger, level="WARNING") as log_cm:
                g = load_graph(config, infer=False)

            # Should have logged a warning about the broken.ttl file
            warning_messages = [r.getMessage() for r in log_cm.records]
            self.assertTrue(
                any("broken.ttl" in msg for msg in warning_messages),
                f"No warning about broken.ttl found in: {warning_messages}"
            )

            # Graph should still be loadable with valid content
            self.assertGreater(len(g), 0)


    def test_html_microdata_loaded_as_data(self) -> None:
        """Test that .html files are loaded as microdata via _EXT_FORMAT_MAP."""
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            html_file = wiki_dir / "data.html"
            html_file.write_text("""<html><body>
<div itemscope itemtype="https://schema.org/Person">
    <span itemprop="name">HTML Person</span>
    <span itemprop="email">html@example.org</span>
</div>
</body></html>""", encoding="utf-8")

            config = WikiConfig(input_dirs=[wiki_dir])
            g = load_graph(config, infer=False)
            self.assertGreater(len(g), 0)
            found = any(
                str(o) == "HTML Person"
                for s, p, o in g
                if str(p) == "https://schema.org/name"
            )
            self.assertTrue(found, "Microdata from .html file not found in graph")

    def test_uri_ext_config_appends_md(self) -> None:
        """Test that uri_ext=True produces .md in auto-generated page URIs."""
        with TemporaryDirectory() as tmpdir:
            wiki_dir = Path(tmpdir)
            (wiki_dir / "test.md").write_text("""---
type: WebPage
name: Test Page
---
""", encoding="utf-8")

            config = WikiConfig(input_dirs=[wiki_dir], uri_ext=True)
            g = load_graph(config, infer=False)
            expected = URIRef("https://wiki.example.org/test.md")
            self.assertTrue((expected, None, None) in g)


if __name__ == "__main__":
    unittest.main()
