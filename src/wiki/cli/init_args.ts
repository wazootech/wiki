import { LEGACY_LINK_STYLE_MAP, LINK_STYLES } from "../schemas/wiki_config.ts";
import type { WikiInitOptions } from "../wiki.ts";
import { EXIT_OK, usageError } from "./usage.ts";

export function parseInitCommandArgs(
  args: readonly string[],
): WikiInitOptions | number {
  const values: Record<string, unknown> = {
    wiki_inputs: [],
    graph_implicit_types: [],
  };
  const valueOptions: Readonly<Record<string, string>> = {
    "--repo": "repo",
    "--graph-context-wiki": "graph_context_wiki",
    "--site-base-url": "site_base_url",
    "--site-url-style": "site_url_style",
    "--site-layout": "site_layout",
    "--graph-content-predicate": "graph_content_predicate",
    "--link-style": "link_style",
    "--graph-base-iri": "graph_base_iri",
    "--graph-implicit-types-policy": "graph_implicit_types_policy",
    "--template": "template",
  };
  const choices: Readonly<Record<string, readonly string[]>> = {
    "--site-url-style": ["file", "dir"],
    // Derived from the schema so the flag, the scaffold, and the config
    // validator cannot disagree about which link styles exist. The retired
    // spellings are accepted too, because `link.style` in a config file has
    // always honoured them -- the flag and the file must not disagree about
    // which values are legal. `normalizeInitLinkStyle` then rewrites them.
    "--link-style": [...LINK_STYLES, ...Object.keys(LEGACY_LINK_STYLE_MAP)]
      .sort(),
    "--graph-implicit-types-policy": ["fallback", "append"],
  };
  // What a "Choose from" error names. Retired spellings stay accepted but are
  // never advertised, so the message still points at the canonical value.
  const advisedChoices: Readonly<Record<string, readonly string[]>> = {
    "--link-style": [...LINK_STYLES].sort(),
  };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === "--help" || token === "-h") {
      console.log(
        `Usage: wiki init [OPTIONS]\n\nScaffold a new wiki project in the current directory.\n\nOptions:\n  --git                               Run git init after scaffolding.\n  --repo TEXT                         Infer GitHub Pages defaults from owner/repo.\n  --graph-context-wiki TEXT           Override graph.context.wiki.\n  --site-base-url TEXT                Override site.base_url.\n  --site-url-style [file|dir]          Override site.url_style.\n  --site-layout TEXT                  Override site.layout.\n  --graph-content-predicate TEXT      Override graph.content_predicate.\n  --link-style [standard|wikilink]     Override link.style.\n  --input TEXT                        Override wiki.input (repeatable).\n  --graph-base-iri TEXT               Override graph.base_iri.\n  --graph-implicit-types TEXT         Default type for untyped documents (repeatable).\n  --graph-implicit-types-policy TEXT  Strategy for applying implicit types.\n  --graph-include-file-extension      Include .md in graph document URIs.\n  --no-graph-include-file-extension   Omit .md from graph document URIs.\n  --template TEXT                     Use a starter template from wiki-templates.\n  --help                              Show this message and exit.`,
      );
      return EXIT_OK;
    }
    if (token === "--git") {
      values["init_git"] = true;
      continue;
    }
    if (token === "--graph-include-file-extension") {
      values["graph_include_file_extension"] = true;
      continue;
    }
    if (token === "--no-graph-include-file-extension") {
      values["graph_include_file_extension"] = false;
      continue;
    }

    const equalsAt = token.indexOf("=");
    const option = equalsAt < 0 ? token : token.slice(0, equalsAt);
    const field = option === "--input"
      ? "wiki_inputs"
      : option === "--graph-implicit-types"
      ? "graph_implicit_types"
      : valueOptions[option];
    if (field === undefined) {
      return usageError(`Error: No such option: ${token}`);
    }
    let value = equalsAt < 0 ? undefined : token.slice(equalsAt + 1);
    if (value === undefined) {
      value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return usageError(`Error: Option '${option}' requires an argument.`);
      }
      index += 1;
    }
    const allowed = choices[option];
    if (allowed !== undefined && !allowed.includes(value)) {
      const suggested = advisedChoices[option] ?? allowed;
      return usageError(
        `Error: Invalid value for '${option}': '${value}'. Choose from ${
          suggested.map((item) => `'${item}'`).join(", ")
        }.`,
      );
    }
    if (field === "wiki_inputs" || field === "graph_implicit_types") {
      (values[field] as string[]).push(value);
    } else {
      values[field] = value;
    }
  }
  for (const field of ["wiki_inputs", "graph_implicit_types"]) {
    if ((values[field] as string[]).length === 0) delete values[field];
  }
  return values as WikiInitOptions;
}
