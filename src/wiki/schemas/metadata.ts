/**
 * Metadata RDF view descriptors for the serve UI.
 *
 * Port of `src/wiki/schemas/metadata.py`. The order of {@link METADATA_VIEWS} is
 * the order the serve UI offers the tabs in, so it is preserved verbatim.
 */

/** One way of rendering a page's RDF metadata in the serve UI. */
export interface MetadataView {
  readonly id: string;
  readonly format: string;
  readonly mode: string;
  readonly label: string;
  readonly lexer: string;
}

/** The metadata views the serve UI exposes, in tab order. */
export const METADATA_VIEWS: readonly MetadataView[] = [
  {
    id: "json-ld-compacted",
    format: "json-ld",
    mode: "compacted",
    label: "JSON-LD",
    lexer: "json",
  },
  {
    id: "turtle",
    format: "turtle",
    mode: "expanded",
    label: "Turtle",
    lexer: "turtle",
  },
  { id: "n3", format: "n3", mode: "expanded", label: "N3", lexer: "n3" },
  {
    id: "xml",
    format: "xml",
    mode: "expanded",
    label: "RDF/XML",
    lexer: "xml",
  },
  { id: "nt", format: "nt", mode: "expanded", label: "NT", lexer: "nt" },
  {
    id: "trig",
    format: "trig",
    mode: "expanded",
    label: "TriG",
    lexer: "trig",
  },
  {
    id: "nquads",
    format: "nquads",
    mode: "expanded",
    label: "NQ",
    lexer: "nt",
  },
];
