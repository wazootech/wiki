import { errorText } from "../errors.ts";
import type { Wiki } from "../wiki.ts";
import { EXIT_FAILURE, EXIT_OK } from "./usage.ts";
import type { ParsedUpdateCommand } from "./sources_args.ts";

export function runInstallCommand(wiki: Wiki, url: string | null): number {
  try {
    const lockfile = wiki.install(url);
    const count = lockfile.sources.size;
    if (count === 0) {
      console.log("No sources to install.");
      return EXIT_OK;
    }
    console.log(`Locked ${count} source${count === 1 ? "" : "s"}.`);
    for (const [name, locked] of lockfile.sources) {
      console.log(
        `  ${name}: ${locked.resolved_ref.slice(0, 12)} (${locked.fetched_at})`,
      );
    }
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}

export function runUpdateCommand(
  wiki: Wiki,
  parsed: ParsedUpdateCommand,
): number {
  try {
    const result = wiki.update(parsed.name, { dryRun: parsed.dryRun });
    if (result.updates.length === 0) {
      console.log("No sources to update.");
      return EXIT_OK;
    }
    if (result.changed.length === 0) {
      console.log("All sources are up to date.");
      return EXIT_OK;
    }
    for (const update of result.changed) {
      const action = parsed.dryRun ? "would update" : "updated";
      console.log(
        `${action} ${update.name}: ${update.previous_ref} -> ${update.current_ref}`,
      );
    }
    if (!parsed.dryRun) {
      const count = result.changed.length;
      console.log(
        `Updated ${count} source${count === 1 ? "" : "s"} in wiki.lock.`,
      );
    }
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}

export function runRemoveCommand(wiki: Wiki, name: string): number {
  try {
    wiki.remove(name);
    console.log(`Removed source '${name}'.`);
    return EXIT_OK;
  } catch (error) {
    console.error(
      `Error: ${errorText(error)}`,
    );
    return EXIT_FAILURE;
  }
}
