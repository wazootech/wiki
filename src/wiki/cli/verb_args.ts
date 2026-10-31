import { EXIT_OK, usageError } from "./usage.ts";
import type { EditRunOptions } from "./edit.ts";

interface VerbArgs {
  readonly positionals: string[];
  readonly values: Map<string, string[]>;
  readonly flags: Set<string>;
  readonly run: EditRunOptions;
  readonly expect: string | undefined;
}

/**
 * The shared argument parser for the write verbs: the write options
 * every verb takes, plus the verb's own `valueOptions` and `flagOptions`.
 */
export function parseVerbArgs(
  args: readonly string[],
  help: string,
  spec: {
    readonly valueOptions: readonly string[];
    readonly flagOptions: readonly string[];
    readonly expect: boolean;
  },
): VerbArgs | number {
  const positionals: string[] = [];
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  let apply = false;
  let force = false;
  let format: "text" | "json" = "text";
  let expect: string | undefined;
  const valueOptions = new Set([
    ...spec.valueOptions,
    "-f",
    "--format",
    ...(spec.expect ? ["--expect"] : []),
  ]);
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === "--help" || token === "-h") {
      console.log(help);
      return EXIT_OK;
    }
    let name = token;
    let value: string | undefined;
    if (token.startsWith("--") && token.includes("=")) {
      name = token.slice(0, token.indexOf("="));
      value = token.slice(token.indexOf("=") + 1);
    }
    if (valueOptions.has(name)) {
      value ??= args[++i];
      if (value === undefined) {
        return usageError(`Error: Option '${name}' requires an argument.`);
      }
      if (name === "-f" || name === "--format") {
        if (value !== "text" && value !== "json") {
          return usageError(
            `Error: Invalid value for '-f' / '--format': '${value}' is not one of 'text', 'json'.`,
          );
        }
        format = value;
      } else if (name === "--expect") {
        expect = value;
      } else {
        values.set(name, [...(values.get(name) ?? []), value]);
      }
    } else if (token === "--apply") {
      apply = true;
    } else if (token === "--force") {
      force = true;
    } else if (token === "--json") {
      format = "json";
    } else if (spec.flagOptions.includes(token)) {
      flags.add(token);
    } else if (token.startsWith("-") && token !== "-") {
      return usageError(`Error: No such option: ${token}`);
    } else {
      positionals.push(token);
    }
  }
  return {
    positionals,
    values,
    flags,
    run: { apply, force, format },
    expect,
  };
}
