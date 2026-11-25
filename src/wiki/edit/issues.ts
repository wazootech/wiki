import { basename } from "@std/path";
import type { CheckIssue } from "../check_report.ts";
import type { Config } from "../config.ts";
import { overlayKey } from "../fspath.ts";
import type { AuditReport, Issue } from "../schemas/reports.ts";
import type { StagedMove } from "./plan_support.ts";

/** A pre-move finding, re-anchored to where the moved page now lives. */
export function remapIssue(issue: Issue, moves: readonly StagedMove[]): Issue {
  for (const move of moves) {
    const onRoute = move.oldRoute !== null && issue.route === move.oldRoute;
    const onPath = typeof issue.path === "string" &&
      overlayKey(issue.path) === overlayKey(move.fromPath);
    // Lint findings often carry no route or path, only a message that opens
    // with the page's route or file name (`In Beta:`, `In Beta.md:3:`).
    const prefixes: Array<readonly [string, string]> = [
      [`In ${basename(move.fromPath)}:`, `In ${basename(move.toPath)}:`],
    ];
    if (move.oldRoute !== null && move.newRoute !== null) {
      prefixes.push([`In ${move.oldRoute}:`, `In ${move.newRoute}:`]);
    }
    const prefixed = prefixes.find(([old]) => issue.message.startsWith(old));
    if (!onRoute && !onPath && prefixed === undefined) continue;
    let message = issue.message;
    if (prefixed !== undefined) {
      message = prefixed[1] + message.slice(prefixed[0].length);
    }
    if (onRoute || onPath) {
      message = message.replaceAll(
        basename(move.fromPath),
        basename(move.toPath),
      );
    }
    const remapIri = (value: string | null | undefined) => {
      if (!value || move.oldIri === null || move.newIri === null) return value;
      const rest = value.slice(move.oldIri.length);
      return value.startsWith(move.oldIri) && /^(?:$|[.#])/.test(rest)
        ? move.newIri + rest
        : value;
    };
    return {
      ...issue,
      message,
      ...(onRoute ? { route: move.newRoute } : {}),
      ...(onPath ? { path: move.toPath } : {}),
      ...(issue.results === undefined ? {} : {
        results: issue.results.map((result) => ({
          ...result,
          focusNode: remapIri(result.focusNode) ?? null,
        })),
      }),
    };
  }
  return issue;
}

/**
 * Identity of a finding for the before/after comparison.
 *
 * Structured SHACL and JSON Schema results are compared by what failed (field,
 * constraint, shape, schema keyword), not by message text, which embeds
 * values that change with any edit. One issue can carry several results, so it
 * yields one key per result.
 */
function issueKeys(issue: Issue): string[] {
  const anchor = issue.route ?? (issue.path ? overlayKey(issue.path) : "");
  const results = issue.results ?? [];
  if (results.length === 0) {
    // A wikilink quoted in a message (`link_style`) is the link's text, which
    // a move rewrites; the finding (a wikilink on that line) is the same one.
    const message = issue.message.replace(/\[\[[^\]]*\]\]/g, "[[]]");
    return [[issue.code, anchor, message].join("\0")];
  }
  return results.map((result) =>
    [
      issue.code,
      anchor,
      result.check,
      result.focusNode ?? "",
      result.resultPath ?? "",
      result.sourceConstraintComponent ?? "",
      (result.sourceShapes ?? []).map((shape) => shape.iri).join(","),
      result.schema ?? "",
      result.keyword ?? "",
      JSON.stringify(result.instancePath ?? []),
    ].join("\0")
  );
}

/** Issues in `after` whose keys outnumber their occurrences in `before`. */
export function newIssues(before: AuditReport, after: AuditReport): Issue[] {
  const counts = new Map<string, number>();
  for (const issue of [...before.errors, ...before.warnings]) {
    for (const key of issueKeys(issue)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const introduced: Issue[] = [];
  for (const issue of [...after.errors, ...after.warnings]) {
    let fresh = false;
    for (const key of issueKeys(issue)) {
      const remaining = counts.get(key) ?? 0;
      if (remaining > 0) counts.set(key, remaining - 1);
      else fresh = true;
    }
    if (fresh) introduced.push(issue);
  }
  return introduced;
}

export function checkIssue(config: Config, issue: Issue): CheckIssue {
  return {
    code: issue.code,
    severity: issue.severity ?? "error",
    message: issue.message,
    path: issue.path
      ? config.relativeToRoot(issue.path).replaceAll("\\", "/")
      : null,
    route: issue.route ?? null,
  };
}
