/**
 * Presentation for audit results: what a run prints, and on which stream.
 *
 * Port of `cli_output.py`. The Python helpers call `sys.exit` directly, which is
 * the one thing the port cannot copy: a library that exits the process cannot be
 * called twice in a test, and `cli.ts` needs the code to return from `main`
 * rather than throw. So each function here *returns* the exit code it would have
 * exited with, and nothing else about the layout changes.
 *
 * Every line goes to **stderr**. That is not an accident of Click's `err=True`:
 * `check` and `lint` are diagnostics, so their output must not pollute a pipe
 * that a caller is reading a report from. `stdout` stays empty, which is why the
 * oracle's own stdout is empty for both commands.
 *
 * The double `apply_strict` in {@link exitAuditReport} is the Python behaviour
 * and harmless — `Wiki.check`/`lint` already promoted the warnings, and the
 * second pass finds none — but it is load-bearing for any caller that reaches
 * the presenter without having set `strict` on the report itself.
 */

import type { AuditReport } from "./schemas/reports.ts";

/** Click writes diagnostics to stderr; so does the port. */
function emit(line: string): void {
  console.error(line);
}

/**
 * Print an audit report and return the exit code, as `exit_audit_report` does.
 *
 * `strict` promotes warnings to errors here as well as in the caller, so a
 * report built without the flag is presented with it.
 */
export function exitAuditReport(
  report: AuditReport,
  options: { readonly verbose: boolean; readonly strict: boolean },
): number {
  const presented = options.strict ? report.applyStrict() : report;
  const [errors, warnings] = presented.messages();
  return exitCheckResults({
    conforms: presented.ok,
    errors,
    warnings,
    verbose: options.verbose,
  });
}

/**
 * The exit-code contract shared by the audit presenters.
 *
 * A passing report with no errors exits 0 — and still prints warnings when
 * `-v` asked for them, because "verbose" means "tell me what you tolerated".
 * Anything else prints errors, then warnings, then exits 1 unless the report
 * itself was ok, which is how a warning-only run stays a success.
 */
export function exitCheckResults(options: {
  readonly conforms: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly verbose: boolean;
}): number {
  const { conforms, errors, warnings, verbose } = options;

  if (conforms && errors.length === 0) {
    if (verbose && warnings.length > 0) {
      emit("Warnings:");
      for (const warning of warnings) emit(`  - ${warning}`);
    }
    return 0;
  }

  if (errors.length > 0) {
    emit("Errors:");
    for (const error of errors) emit(`  - ${error}`);
  }

  if (verbose && warnings.length > 0) {
    emit("Warnings:");
    for (const warning of warnings) emit(`  - ${warning}`);
  }

  return conforms ? 0 : 1;
}

/** Print errors (and verbose warnings) without deciding an exit code. */
export function printCheckMessages(
  errors: readonly string[],
  warnings: readonly string[],
  verbose: boolean,
): void {
  if (errors.length > 0) {
    emit("Errors:");
    for (const error of errors) emit(`  - ${error}`);
  }
  if (verbose && warnings.length > 0) {
    emit("Warnings:");
    for (const warning of warnings) emit(`  - ${warning}`);
  }
}
