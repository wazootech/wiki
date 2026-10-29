import { errorText } from "../errors.ts";
import type { WikiInitOptions } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK } from "./usage.ts";

export async function runInitCommand(
  options: WikiInitOptions,
): Promise<number> {
  try {
    const { Wiki: WikiSession } = await import("../wiki.ts");
    const result = WikiSession.init({
      ...options,
      cwd: Deno.cwd(),
      prompt_context_wiki: (defaultValue) => {
        let interactive = false;
        try {
          interactive = Deno.stdin.isTerminal();
        } catch {
          interactive = false;
        }
        if (!interactive) {
          console.error(
            "Non-interactive stdin detected — using the default wiki namespace " +
              `IRI ${defaultValue}. Pass --repo or --graph-context-wiki to control it.`,
          );
          return defaultValue;
        }
        return prompt(
          "Custom wiki namespace IRI (graph.context.wiki)",
          defaultValue,
        )?.trim() || defaultValue;
      },
    });
    if (!result.ok) {
      console.error(
        `Error: ${result.error_message ?? "Initialization failed."}`,
      );
      return EXIT_FAILURE;
    }
    console.log(result.message);
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}
