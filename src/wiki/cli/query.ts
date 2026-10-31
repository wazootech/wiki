import { errorText } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK } from "./usage.ts";
import type { ParsedQueryCommand } from "./query_args.ts";

export async function runQueryCommand(
  wiki: Wiki,
  parsed: ParsedQueryCommand,
): Promise<number> {
  let sparqlQuery: string;
  if (parsed.queryArgs.length > 0) {
    sparqlQuery = parsed.queryArgs.join(" ");
  } else if (Deno.stdin.isTerminal()) {
    console.error("Error: No query provided.");
    return EXIT_FAILURE;
  } else {
    sparqlQuery = await new Response(Deno.stdin.readable).text();
  }

  if (parsed.pretty && parsed.output !== null) {
    console.error(
      "Error: --pretty writes to stdout only; do not use -o/--output.",
    );
    return EXIT_FAILURE;
  }
  if (parsed.pretty && parsed.jq !== null) {
    console.error("Error: --pretty is incompatible with --jq.");
    return EXIT_FAILURE;
  }
  if (parsed.pretty && parsed.format !== "table") {
    console.error(
      "Error: --pretty only supports table format (default -f table).",
    );
    return EXIT_FAILURE;
  }

  try {
    if (parsed.verbose) {
      const { graphStats, usesNamedGraphs } = await import("../graph.ts");
      const graphOptions = {
        infer: !parsed.noInference,
        reload: parsed.reload,
        diskCache: parsed.cache,
      };
      const graph = usesNamedGraphs(sparqlQuery)
        ? await wiki.dataset(graphOptions)
        : await wiki.graph(graphOptions);
      const stats = graphStats(graph);
      console.log(
        `Graph stats: ${stats.triples} triples, ${stats.subjects} subjects\n`,
      );
    }

    const result = await wiki.query(sparqlQuery, {
      format: parsed.format,
      noInference: parsed.noInference,
      reload: parsed.reload,
      cache: parsed.cache,
      jq: parsed.jq,
      pretty: parsed.pretty,
    });
    if (parsed.output !== null) {
      await Deno.writeTextFile(parsed.output, result);
      console.log(`Written results to ${parsed.output}`);
    } else {
      console.log(result);
    }
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Query Execution Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}
