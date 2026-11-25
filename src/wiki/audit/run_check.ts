import { basename, join } from "@std/path";
import { errorText } from "../errors.ts";
import { buildAssetManifest } from "../assets.ts";
import type { Config } from "../config.ts";
import { collectFrontmatterSchemaFindings } from "../frontmatter_schema.ts";
import { lintShapeDefinitions } from "../shape_lint.ts";
import {
  buildPageManifest,
  detectOutputCollisions,
  validateRouteSafety,
} from "../paths.ts";
import { AuditReport, severityIssues } from "../schemas/reports.ts";
import { checkShaclAll, checkShaclFile, loadWikiShapes } from "../shacl.ts";
import {
  addErrors,
  applyIssues,
  checkLayoutFrontmatter,
  type RunCheckOptions,
  safeRoute,
} from "./check_support.ts";

/**
 * Run the integrity checks: shape definitions, SHACL, route safety, output
 * collisions, layout, and JSON Schema frontmatter.
 *
 * The order of the appended errors is the order the CLI prints them, so it is
 * part of the contract: ill-formed shapes first (a shape that validates nothing
 * makes the SHACL verdict below meaningless, so SHACL is skipped while any
 * remain as errors), then SHACL (a violation can make
 * every later finding noise), then route safety, which *replaces* the collision check rather than
 * joining it — an unsafe route makes the manifest meaningless, so the collision
 * pass is skipped instead of reporting confusion on top of it.
 */
export async function runCheck(
  config: Config,
  options: RunCheckOptions = {},
): Promise<AuditReport> {
  const fileFilter = options.fileFilter ?? null;
  const filePaths = options.filePaths ?? null;
  let report = AuditReport.empty();

  // Ill-formed shapes come first. SHACL with a broken shape reports nothing
  // trustworthy (a misspelled constraint never fires, so a green pass means
  // nothing), so when shape_definition fails as an error, SHACL is skipped and
  // a shacl_skipped warning says so.
  const shapes = await lintShapeDefinitions(
    config,
    filePaths === null ? fileFilter : null,
    { filePaths },
  );
  report = applyIssues(
    report,
    "shape_definition",
    shapes.definitions,
    config.check,
  );
  report = applyIssues(report, "shape_unused", shapes.unused, config.check);
  const skipShacl = config.check.shape_definition === "error" &&
    shapes.definitions.length > 0;
  if (skipShacl) {
    report = new AuditReport({
      ok: report.ok,
      errors: report.errors,
      warnings: [...report.warnings, {
        code: "shacl_skipped",
        message: "SHACL validation skipped: fix the shape_definition " +
          "errors first, or the SHACL verdict would be meaningless.",
        severity: "warning",
      }],
    });
  }

  if (filePaths !== null) {
    // One shapes graph for every file: extracting it scans the whole corpus,
    // and per file that made a scoped check O(files × corpus) (#414).
    const shapesGraph = filePaths.length > 0
      ? await loadWikiShapes(config)
      : undefined;
    for (const filePath of filePaths) {
      const result = await checkShaclFile(filePath, config, shapesGraph);
      if (result === null) {
        report = addErrors(report, [{
          code: "missing_metadata",
          message: `No valid document metadata found in ${basename(filePath)}`,
          path: filePath,
          route: safeRoute(config, filePath),
          severity: "error",
        }]);
      } else if (!result.conforms && !skipShacl) {
        report = addErrors(report, [{
          code: "shacl_violation",
          message: `SHACL Validation Violation in ${
            basename(filePath)
          }:\n${result.resultsText}`,
          path: filePath,
          route: safeRoute(config, filePath),
          severity: "error",
          results: result.results,
        }]);
      }
    }

    const [missingSchemaIssues, schemaValidationIssues] =
      await collectFrontmatterSchemaFindings(config, null, { filePaths });
    report = applyIssues(
      report,
      "missing_schema_ref",
      missingSchemaIssues,
      config.check,
    );
    report = applyIssues(
      report,
      "frontmatter_schema",
      schemaValidationIssues,
      config.check,
    );
    return report;
  }

  try {
    const shacl = skipShacl ? null : await checkShaclAll(config);
    if (shacl !== null && !shacl.conforms) {
      report = addErrors(report, [{
        code: "shacl_violation",
        message: `SHACL Validation Violation:\n${shacl.resultsText}`,
        severity: "error",
        results: shacl.results,
      }]);
    }
  } catch (error) {
    // A crash in the validator is a finding, not an exception: `check` has
    // other things to report and a traceback would lose them.
    report = addErrors(report, [{
      code: "shacl_system_error",
      message: `SHACL validation system error: ${errorText(error)}`,
      severity: "error",
    }]);
  }

  const safetyIssues = validateRouteSafety(config);
  if (safetyIssues.length > 0) {
    report = addErrors(
      report,
      severityIssues("route_safety", safetyIssues, "error"),
    );
  } else {
    const baseUrl = config.site.base_url;
    const ownedOutputDir = baseUrl === ""
      ? "_site"
      : join("_site", baseUrl.replace(/^\/+|\/+$/g, ""));
    const collisionIssues = detectOutputCollisions([
      ...buildPageManifest(
        config,
        ownedOutputDir,
        baseUrl,
        config.site.url_style,
      ),
      ...buildAssetManifest(config, ownedOutputDir, baseUrl),
    ]);
    if (collisionIssues.length > 0) {
      report = addErrors(
        report,
        severityIssues("output_collision", collisionIssues, "error"),
      );
    }
  }

  const layoutIssues = checkLayoutFrontmatter(config, fileFilter);
  report = applyIssues(
    report,
    "missing_layout_file",
    layoutIssues,
    config.check,
  );

  const [missingSchemaIssues, schemaValidationIssues] =
    await collectFrontmatterSchemaFindings(config, fileFilter);
  report = applyIssues(
    report,
    "missing_schema_ref",
    missingSchemaIssues,
    config.check,
  );
  report = applyIssues(
    report,
    "frontmatter_schema",
    schemaValidationIssues,
    config.check,
  );

  return report;
}
