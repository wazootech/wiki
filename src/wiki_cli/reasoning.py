"""OWL-RL deductive reasoning expansion and custom axiom loading."""

from __future__ import annotations

import logging
from rdflib import Graph
import owlrl

from .context import Context

logger = logging.getLogger(__name__)


def get_reasoning_graph(graph: Graph) -> Graph:
    """Extract all triples deemed relevant for OWL/RDFS reasoning via SPARQL CONSTRUCT."""
    query = """
    CONSTRUCT {
        ?s ?p ?o .
    }
    WHERE {
        ?s ?p ?o .
    }
    """
    # This provides a pivot point to filter irrelevant data before feeding to owlrl reasoner if required
    reasoning_graph = graph.query(query).graph
    if reasoning_graph is None:
        reasoning_graph = Graph()
    return reasoning_graph


def apply_inference(graph: Graph, context: Context) -> Graph:
    """Apply OWL-RL deductive closure reasoning directly to the provided graph."""
    # Extract the data into the reasoning funnel via SPARQL
    reasoning_graph = get_reasoning_graph(graph)
    
    # Ensure source prefixes are present for consistent reasoning outputs
    for prefix, ns in graph.namespaces():
        reasoning_graph.bind(prefix, ns)

    try:
        owlrl.DeductiveClosure(owlrl.OWLRL_Semantics).expand(reasoning_graph)
    except Exception as e:
        logger.error("Failed to apply OWL-RL reasoning: %s", e)
        return graph # Fallback to original on failure

    return reasoning_graph
