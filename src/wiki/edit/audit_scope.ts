import { join } from "@std/path";
import { runCheck, runLint } from "../audit.ts";
import { DocumentBatch } from "../batch.ts";
import type { Config } from "../config.ts";
import { overlayKey } from "../fspath.ts";
import {
  buildPageManifest,
  detectOutputCollisions,
  iterDocumentFiles,
  validateRouteSafety,
} from "../paths.ts";
import { AuditReport, severityIssues } from "../schemas/reports.ts";
import type { StagedMove } from "./plan_support.ts";
import { remapIssue } from "./issues.ts";

export async function scopedAudit(
  config: Config,
  touched: readonly string[],
  lintRoutes: ReadonlySet<string>,
): Promise<{ report: AuditReport; documents: string[] }> {
  const existing = new Set(iterDocumentFiles(config).map(overlayKey));
  const documents = touched.filter((path) => existing.has(overlayKey(path)));

  let report = AuditReport.empty();
  // An empty batch means "the whole wiki" to DocumentBatch, so skip instead.
  if (documents.length > 0) {
    const batch = new DocumentBatch(config, documents);
    report = report.merge(
      await runCheck(config, {
        fileFilter: batch.routeFilter(),
        filePaths: batch.documentPaths(),
      }),
    );
  }

  if (lintRoutes.size > 0) {
    report = report.merge(await runLint(config, new Set(lintRoutes)));
  }

  const safety = validateRouteSafety(config);
  if (safety.length > 0) {
    report = report.merge(
      new AuditReport({
        ok: false,
        errors: severityIssues("route_safety", safety, "error"),
      }),
    );
  } else {
    const baseUrl = config.site.base_url;
    const outputDir = baseUrl === ""
      ? "_site"
      : join("_site", baseUrl.replace(/^\/+|\/+$/g, ""));
    const collisions = detectOutputCollisions(
      buildPageManifest(config, outputDir, baseUrl, config.site.url_style),
    );
    if (collisions.length > 0) {
      report = report.merge(
        new AuditReport({
          ok: false,
          errors: severityIssues("output_collision", collisions, "error"),
        }),
      );
    }
  }
  return { report, documents };
}

/** {@link remapIssue} over a whole report. */
export function remapReport(
  report: AuditReport,
  moves: readonly StagedMove[],
): AuditReport {
  if (moves.length === 0) return report;
  return new AuditReport({
    ok: report.ok,
    errors: report.errors.map((issue) => remapIssue(issue, moves)),
    warnings: report.warnings.map((issue) => remapIssue(issue, moves)),
  });
}
