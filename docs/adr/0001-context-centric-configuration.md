# Context-centric configuration

**Status**: Superseded by [ADR-0004](0004-unified-check-and-wikiconfig.md)

To align with JSON-LD terminology, we decided to name the central CLI settings, directories, and namespace/prefix bindings "Context" instead of "Configuration" or "Settings". This reinforces the semantic nature of the LLM Wiki CLI, where namespace prefixes map directly to JSON-LD `@context` vocabularies, reducing terminology bloat for domain experts and developers alike.

> [!NOTE]
> Evolved in [ADR-0004](0004-unified-check-and-wikiconfig.md) to separate general CLI/directory configurations into `WikiConfig` while retaining the JSON-LD prefix mapping as `Context` inside it.
