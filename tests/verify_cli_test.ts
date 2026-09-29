import { assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO_ROOT = dirname(dirname(fromFileUrl(import.meta.url)));
const VERIFY_SCRIPT = join(REPO_ROOT, "skills/wiki/scripts/verify.sh");

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
  const wikiVersion = options.wikiVersion ?? "0.1.24";
  const wikiFormat = options.wikiFormat ?? "Format markdown wiki pages with the Deno formatter.";
  const wikiHelp = options.wikiHelp ?? true;
  const denoVersion = options.denoVersion ?? "0.1.24";

  createStub(
    root,
    "wiki",
    [
      "#!/usr/bin/env bash",
      "if [[ \"$1\" == \"--version\" ]]; then",
      `  printf '%s\\n' 'wiki, version ${wikiVersion}'`,
      "elif [[ \"$1\" == \"fmt\" && \"$2\" == \"--help\" ]]; then",
      `  printf '%s\\n' '${wikiFormat}'`,
      "elif [[ \"$1\" == \"--help\" ]]; then",
      wikiHelp ? "  printf '%s\\n' 'Commands: fmt check'" : "  exit 1",
      "fi",
    ].join("\n"),
  );
  createStub(
    root,
    "deno",
    [
      "#!/usr/bin/env bash",
      "case \"$*\" in",
      `  *--version) printf '%s\\n' 'wiki, version ${denoVersion}' ;;`,
      "  *'fmt --help') printf '%s\\n' 'Format markdown wiki pages with the Deno formatter.' ;;",
      "  *--help) printf '%s\\n' 'Commands: fmt check' ;;",
      "  *) exit 0 ;;",
      "esac",
    ].join("\n"),
  );

  try {
    return await new Deno.Command("/usr/bin/bash", {
      args: [VERIFY_SCRIPT],
      cwd: REPO_ROOT,
      env: { PATH: `${bin}:/usr/bin:/bin` },
      stdout: "piped",
      stderr: "piped",
    }).output();
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

Deno.test("verify rejects the retired Python CLI even when it exposes fmt", async () => {
  const result = await runVerifier({
    wikiVersion: "0.1.23",
    wikiFormat: "Format markdown with mdformat.",
  });
  assertEquals(result.code, 2);
  assertStringIncludes(new TextDecoder().decode(result.stderr), "stale wiki on PATH");
});

Deno.test("verify requires the Deno formatter signature at the cutover version", async () => {
  const result = await runVerifier({
    wikiVersion: "0.1.24",
    wikiFormat: "Format markdown with mdformat.",
  });
  assertEquals(result.code, 2);
});

Deno.test("verify accepts the Deno CLI at the cutover version", async () => {
  const result = await runVerifier();
  assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
  assertStringIncludes(new TextDecoder().decode(result.stdout), "wiki ready on PATH");
});

Deno.test("verify checks the Deno identity on its source checkout fallback", async () => {
  const result = await runVerifier({ wikiHelp: false });
  assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
  assertStringIncludes(
    new TextDecoder().decode(result.stdout),
    "wiki ready via Deno source checkout",
  );
});
