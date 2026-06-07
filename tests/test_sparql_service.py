"""Tests for SPARQL 1.1 Service Description generation."""

from __future__ import annotations

import unittest

from rdflib import Graph

from wiki.sparql_service import SD, build_service_description_graph, serialize_service_description


class SparqlServiceDescriptionTests(unittest.TestCase):
    def test_builds_required_endpoint_triple(self) -> None:
        endpoint = "http://example.org/sparql"
        graph = build_service_description_graph(endpoint)
        rows = list(graph.triples((None, SD.endpoint, None)))
        self.assertEqual(len(rows), 1)
        self.assertEqual(str(rows[0][2]), endpoint)

    def test_serializes_turtle_by_default(self) -> None:
        graph = build_service_description_graph("http://example.org/sparql")
        body, content_type = serialize_service_description(graph, "")
        self.assertEqual(content_type, "text/turtle; charset=utf-8")
        self.assertIn(b"sd:endpoint", body)

    def test_serializes_rdf_xml_when_requested(self) -> None:
        graph = build_service_description_graph("http://example.org/sparql")
        body, content_type = serialize_service_description(graph, "application/rdf+xml")
        self.assertEqual(content_type, "application/rdf+xml; charset=utf-8")
        parsed = Graph().parse(data=body.decode("utf-8"), format="xml")
        self.assertEqual(len(list(parsed.triples((None, SD.endpoint, None)))), 1)


if __name__ == "__main__":
    unittest.main()
