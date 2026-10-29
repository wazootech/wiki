import { errorText, ValueError } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK } from "./usage.ts";
import type { ParsedExportCommand } from "./export_args.ts";

export async function runExportCommand(
  wiki: Wiki,
  parsed: ParsedExportCommand,
): Promise<number> {
  let result: Awaited<ReturnType<Wiki["export"]>>;
  try {
    result = await wiki.export(
      parsed.files.length > 0 ? parsed.files : null,
      { format: parsed.format, mode: parsed.mode },
    );
  } catch (error) {
    if (error instanceof ValueError) {
      console.error(`Error: ${error.message}`);
      return EXIT_FAILURE;
    }
    throw error;
  }

  if (!result.ok) {
    console.error(`Error: ${result.error_message ?? "Export failed."}`);
    return EXIT_FAILURE;
  }

  if (parsed.output !== null) {
    try {
      await Deno.writeTextFile(parsed.output, result.output);
    } catch (error) {
      console.error(
        `Error: ${errorText(error)}`,
      );
      return EXIT_FAILURE;
    }
    const rawFormats = new Set(["turtle", "xml", "n3", "nt", "trig", "nquads"]);
    if (rawFormats.has(parsed.format) && parsed.files.length <= 1) {
      console.log(`Written ${parsed.format} output to ${parsed.output}`);
    } else {
      const description = parsed.files.length > 1 ? "payload array" : "payload";
      console.log(`Written ${description} to ${parsed.output}`);
    }
    return EXIT_OK;
  }

  console.log(result.output);
  return EXIT_OK;
}
