import { assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO_ROOT = dirname(dirname(fromFileUrl(import.meta.url)));
const VERIFY_SCRIPT = join(REPO_ROOT, "skills/wiki/scripts/verify.sh");

/**
 * Locate a bash to run `verify.sh` with.
 *
 * The hardcoded `/usr/bin/bash` is a POSIX path. On Windows it resolves to
 * nothing -- `C:\usr\bin\bash` does not exist -- and Deno fails the spawn with
 * NotFound before the script is ever read, which surfaced as five unrelated
 * test failures. Git for Windows installs bash under `bin/`, so look there too.
 *
 * Resolution order: an explicit override, the bare name (letting the OS search
 * PATH), then the Git for Windows locations.
 */
function resolveBash(): string {
  const override = Deno.env.get("WIKI_TEST_BASH");
  if (override) return override;
  const candidates = [
    "bash",
    "/usr/bin/bash",
    "/bin/bash",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  for (const candidate of candidates) {
    try {
      const { success } = new Deno.Command(candidate, {
        args: ["--version"],
        stdout: "null",
        stderr: "null",
      }).outputSync();
      if (success) return candidate;
    } catch {
      // Not on PATH, or not executable here. Try the next candidate.
    }
  }
  throw new Error(
    "No bash found to run verify.sh. Set WIKI_TEST_BASH to its path.",
  );
}

function createStub(root: string, name: string, content: string): void {
  const bin = join(root, "bin");
  Deno.mkdirSync(bin, { recursive: true });
  const path = join(bin, name);
  Deno.writeTextFileSync(path, content);
  Deno.chmodSync(path, 0o755);
}

async function runVerifier(options: {
  readonly wikiVersion?: string;
  readonly wikiFormat?: string;
  readonly wikiHelp?: boolean;
  readonly denoVersion?: string;
} = {}): Promise<Deno.CommandOutput> {
  const root = Deno.makeTempDirSync({ prefix: "wiki-verify-" });
  const bin = join(root, "bin");
  const wikiVersion = options.wikiVersion ?? "0.2.0";
  const wikiFormat = options.wikiFormat ??
    "Format markdown wiki pages with the Deno formatter.";
  const wikiHelp = options.wikiHelp ?? true;
  const denoVersion = options.denoVersion ?? "0.2.0";

  createStub(
    root,
    "wiki",
    [
      "#!/usr/bin/env bash",
      'if [[ "$1" == "--version" ]]; then',
      `  printf '%s\\n' 'wiki, version ${wikiVersion}'`,
      'elif [[ "$1" == "fmt" && "$2" == "--help" ]]; then',
      `  printf '%s\\n' '${wikiFormat}'`,
      'elif [[ "$1" == "--help" ]]; then',
      wikiHelp ? "  printf '%s\\n' 'Commands: fmt check'" : "  exit 1",
      "fi",
    ].join("\n"),
  );
  createStub(
    root,
    "deno",
    [
      "#!/usr/bin/env bash",
      'case "$*" in',
      `  *--version) printf '%s\\n' 'wiki, version ${denoVersion}' ;;`,
      "  *'fmt --help') printf '%s\\n' 'Format markdown wiki pages with the Deno formatter.' ;;",
      "  *--help) printf '%s\\n' 'Commands: fmt check' ;;",
      "  *) exit 0 ;;",
      "esac",
    ].join("\n"),
  );

  try {
    return await new Deno.Command(resolveBash(), {
      args: [VERIFY_SCRIPT],
      cwd: REPO_ROOT,
      // PATH is `:`-separated on POSIX and `;`-separated on Windows. The
      // stubs live in `bin`, and verify.sh has to find `deno` and `wiki`
      // through the same PATH it hands to `command -v`.
      env: {
        PATH: Deno.build.os === "windows"
          ? `${bin};${Deno.env.get("PATH") ?? ""}`
          : `${bin}:/usr/bin:/bin`,
      },
      stdout: "piped",
      stderr: "piped",
    }).output();
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

Deno.test("verify prefers the Deno source checkout over the retired Python CLI on PATH", async () => {
  const result = await runVerifier({
    wikiVersion: "0.1.23",
    wikiFormat: "Format markdown with mdformat.",
  });
  assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
  assertStringIncludes(
    new TextDecoder().decode(result.stdout),
    "wiki ready via Deno source checkout",
  );
});

Deno.test("verify rejects the retired CLI when the source checkout is also stale", async () => {
  const result = await runVerifier({
    wikiVersion: "0.1.23",
    wikiFormat: "Format markdown with mdformat.",
    denoVersion: "0.1.23",
  });
  assertEquals(result.code, 2);
  assertStringIncludes(
    new TextDecoder().decode(result.stderr),
    "stale wiki on PATH",
  );
});

Deno.test("verify requires the Deno formatter signature at the cutover version", async () => {
  const result = await runVerifier({
    wikiVersion: "0.2.0",
    wikiFormat: "Format markdown with mdformat.",
    denoVersion: "0.1.23",
  });
  assertEquals(result.code, 2);
});

Deno.test("verify accepts the Deno CLI at the cutover version", async () => {
  const result = await runVerifier();
  assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
  assertStringIncludes(
    new TextDecoder().decode(result.stdout),
    "wiki ready on PATH",
  );
});

Deno.test("verify checks the Deno identity on its source checkout fallback", async () => {
  const result = await runVerifier({ wikiHelp: false });
  assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
  assertStringIncludes(
    new TextDecoder().decode(result.stdout),
    "wiki ready via Deno source checkout",
  );
});
