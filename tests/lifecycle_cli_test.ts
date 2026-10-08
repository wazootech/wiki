import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl } from "@std/path";

const CLI_ENTRY = fromFileUrl(new URL("../src/wiki/cli.ts", import.meta.url));
const DECODER = new TextDecoder();

interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function runCli(
  args: readonly string[],
  cwd: string,
): Promise<CliResult> {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-all", CLI_ENTRY, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: result.code,
    stdout: DECODER.decode(result.stdout),
    stderr: DECODER.decode(result.stderr),
  };
}

function createRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-cli-lifecycle-" });
}

function cleanup(root: string): void {
  Deno.removeSync(root, { recursive: true });
}

Deno.test(
  "init scaffolds a wiki and honors repo-derived defaults",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = createRoot();
    try {
      const result = await runCli(["init", "--repo", "wazootech/wiki"], root);
      assertEquals(result.code, 0, result.stderr);
      assertStringIncludes(result.stdout, "Initialized wiki config");
      assertEquals(result.stderr, "");
      assert(Deno.statSync(`${root}/wiki.yml`).isFile);
      assert(Deno.statSync(`${root}/README.md`).isFile);
      assert(Deno.statSync(`${root}/wiki`).isDirectory);
      const config = Deno.readTextFileSync(`${root}/wiki.yml`);
      assertStringIncludes(config, "https://wazootech.github.io/wiki/");
    } finally {
      cleanup(root);
    }
  },
);

Deno.test(
  "non-interactive init selects the default namespace and explains how to override it",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = createRoot();
    try {
      const result = await runCli(["init"], root);
      assertEquals(result.code, 0, result.stderr);
      assertStringIncludes(
        result.stderr,
        "Non-interactive stdin detected — using the default wiki namespace",
      );
      assertStringIncludes(result.stderr, "--repo or --graph-context-wiki");
      assertStringIncludes(
        Deno.readTextFileSync(`${root}/wiki.yml`),
        'wiki: "https://wiki.example.org/"',
      );
    } finally {
      cleanup(root);
    }
  },
);

Deno.test(
  "init template refuses an existing README without overwriting it",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = createRoot();
    try {
      Deno.writeTextFileSync(`${root}/README.md`, "keep me\n");
      const result = await runCli(["init", "--template", "generic"], root);
      assertEquals(result.code, 1);
      assertStringIncludes(result.stderr, "README.md already exists");
      assertEquals(Deno.readTextFileSync(`${root}/README.md`), "keep me\n");
      assertEquals([...Deno.readDirSync(root)].length, 1);
    } finally {
      cleanup(root);
    }
  },
);

Deno.test(
  "source lifecycle commands and install alias run on an empty config",
  { permissions: { run: true, read: true, write: true } },
  async () => {
    const root = createRoot();
    try {
      Deno.writeTextFileSync(`${root}/wiki.yml`, "wiki:\n  input: [wiki]\n");
      Deno.mkdirSync(`${root}/wiki`);
      for (const command of ["install", "i"]) {
        const result = await runCli(["-c", "wiki.yml", command], root);
        assertEquals(result.code, 0, result.stderr);
        assertEquals(result.stdout, "No sources to install.\n");
        assertEquals(result.stderr, "");
      }
      const update = await runCli(["-c", "wiki.yml", "update"], root);
      assertEquals(update.code, 0, update.stderr);
      assertEquals(update.stdout, "No sources to update.\n");

      const remove = await runCli(
        ["-c", "wiki.yml", "remove", "missing"],
        root,
      );
      assertEquals(remove.code, 0, remove.stderr);
      assertEquals(remove.stdout, "Removed source 'missing'.\n");
    } finally {
      cleanup(root);
    }
  },
);

Deno.test(
  "upgrade help is local and documents check, confirmation, and verbosity flags",
  { permissions: { run: true } },
  async () => {
    const result = await runCli(["upgrade", "--help"], Deno.cwd());
    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(result.stdout, "wiki upgrade [OPTIONS]");
    assertStringIncludes(result.stdout, "-c, --check");
    assertStringIncludes(result.stdout, "-y, --yes");
    assertStringIncludes(result.stdout, "-v, --verbose");
    assertEquals(result.stderr, "");
  },
);
