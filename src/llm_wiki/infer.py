"""OWL-RL deductive reasoning expansion and custom axiom loading."""

from __future__ import annotations

import logging
from rdflib import Graph
import owlrl

from .config import Context

logger = logging.getLogger(__name__)


def apply_inference(graph: Graph, context: Context) -> Graph:
    """Apply OWL-RL deductive closure reasoning directly to the provided graph."""
    try:
        owlrl.DeductiveClosure(owlrl.OWLRL_Semantics).expand(graph)
    except Exception as e:
        logger.error("Failed to apply OWL-RL reasoning: %s", e)

    return graph

