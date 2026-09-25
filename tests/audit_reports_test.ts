/**
 * Port of `tests/test_audit_reports.py`.
 *
 * The Python file is three tests about the *report*, not about any one rule:
 * `merge` combines two passes, `apply_strict` promotes warnings, and the codes
 * a report carries are the config keys that produced them. The third is the one
 * with real content — it is the assertion that a user who sees
 * `code=broken_links` can find `lint.broken_links` in their config — so it is
 * kept as the file's centrepiece and the other two are asserted alongside it.
 */

import { assert, assertEquals, assertFalse } from "@std/assert";
import { runLint } from "../src/wiki/audit.ts";
import { Config } from "../src/wiki/config.ts";
import { Path } from "../src/wiki/fspath.ts";
import { AuditReport, type Issue } from "../src/wiki/schemas/reports.ts";

function tempRoot(): Path {
  return Path.of(Deno.makeTempDirSync({ prefix: "wiki-audit-reports-" }));
}

function cleanup(root: Path): void {
  try {
    Deno.removeSync(root.toString(), { recursive: true });
  } catch {
    // Windows keeps a handle open long enough to lose this race occasionally.
  }
}

function write(root: Path, relative: string, content: string): Path {
  const target = root.joinpath(...relative.split("/"));
  Deno.mkdirSync(target.parent.toString(), { recursive: true });
  Deno.writeTextFileSync(target.toString(), content);
  return target;
}

Deno.test("two passes merge into one report, and the order stands", () => {
  const first = new AuditReport({
    ok: false,
    errors: [{ code: "broken_links", message: "broken", severity: "error" }],
  });
  const second = new AuditReport({
    warnings: [{ code: "headings", message: "heading", severity: "warning" }],
  });

  const merged = first.merge(second);
  assertFalse(merged.ok);
  assertEquals(merged.errors.length, 1);
  assertEquals(merged.warnings.length, 1);
  assertEquals(merged.errors[0]!.code, "broken_links");

  // `merge` is not commutative in the ways that matter: a passing report merged
  // with a failing one fails, but the issue *order* is the order of the passes.
  assertFalse(second.merge(first).ok);
  assertEquals(second.merge(first).errors[0]!.code, "broken_links");
});

Deno.test("--strict promotes every warning and empties the warning list", () => {
  const report = new AuditReport({
    warnings: [{ code: "headings", message: "warn", severity: "warning" }],
  });

  const strict = report.applyStrict();
  assertFalse(strict.ok);
  assertEquals(strict.errors.length, 1);
  assertEquals(strict.warnings, []);

  // Nothing to promote means the same report, which is what Python's early
  // return does.
  const clean = new AuditReport();
  assertEquals(clean.applyStrict(), clean);
});

Deno.test("every issue code is the lint config key that controls it", () => {
  const root = tempRoot();
  try {
    // The fixture is the Python one: a page whose wikilink is broken and
    // another that links onward in wikilink syntax while `link.style` is
    // `standard`, so `broken_links` and `link_style` both have findings.
    write(
      root,
      "Page.md",
      "---\ntype: schema:WebPage\n---\n\n[[Missing]]",
    );
    write(
      root,
      "Wikilink_Page.md",
      "---\ntype: schema:WebPage\n---\n\nSee [[Other]].",
    );
    const config = new Config({
      wiki: { input: [root] },
      lint: { broken_links: "error", link_style: "error" },
      link: { style: "standard" },
    });

    const report = runLint(config);
    const codes = new Set<string>(
      report.errors.map((issue: Issue) => issue.code),
    );
    assert(codes.has("broken_links"), [...codes].join(", "));

    // Every code is a `lint:` key — that is the contract the Python test is
    // protecting, and it holds for the rules that reported here.
    const lintKeys = new Set(Object.keys({ ...config.lint }));
    for (const code of codes) {
      assert(lintKeys.has(code), `${code} is not a lint rule key`);
    }
  } finally {
    cleanup(root);
  }
});
