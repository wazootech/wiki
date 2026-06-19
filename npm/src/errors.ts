import type { WikiCommandResult } from "./types";

export class WikiCommandError extends Error {
  readonly result: WikiCommandResult;

  constructor(result: WikiCommandResult) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
    super(`wiki command failed: ${detail}`);
    this.name = "WikiCommandError";
    this.result = result;
  }
}

export class WikiSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiSetupError";
  }
}
