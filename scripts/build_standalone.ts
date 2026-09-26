import { createHash } from "node:crypto";
import { dirname, fromFileUrl, join } from "@std/path";

const ROOT = dirname(dirname(fromFileUrl(import.meta.url)));
const DIST_DIR = join(ROOT, "dist/standalone");
const BUILD_DIR = join(ROOT, "build/standalone");
const ENTRYPOINT = join(ROOT, "src/wiki/cli.ts");

export const TARGETS = {
  "x86_64-unknown-linux-gnu": {
    slug: "linux-x64",
    os: "linux",
    executable: "wiki",
    archive: "tar.gz",
  },
  "x86_64-pc-windows-msvc": {
    slug: "windows-x64",
    os: "windows",
    executable: "wiki.exe",
    archive: "zip",
  },
  "aarch64-apple-darwin": {
    slug: "macos-arm64",
    os: "macos",
    executable: "wiki",
    archive: "tar.gz",
  },
} as const;

export type CompileTarget = keyof typeof TARGETS;

export function artifactName(version: string, target: CompileTarget): string {
  return `wazootech-wiki-${version}-${TARGETS[target].slug}`;
}

function parseArgs(args: string[]): {
  target: CompileTarget;
  smokeCheck: boolean;
} {
  let target: string | undefined;
  let smokeCheck = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--target") {
      target = args[index + 1];
      if (target === undefined) throw new Error("--target requires a value");
      index += 1;
    } else if (arg === "--smoke-check") {
      smokeCheck = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: deno run -A scripts/build_standalone.ts --target <Deno target triple> [--smoke-check]\n\n" +
          "Supported targets: " + Object.keys(TARGETS).join(", "),
      );
      Deno.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (target === undefined || !(target in TARGETS)) {
    throw new Error(
      `--target must be one of: ${Object.keys(TARGETS).join(", ")}`,
    );
  }
  return { target: target as CompileTarget, smokeCheck };
}

async function run(
  command: string,
  args: string[],
  options: Deno.CommandOptions = {},
): Promise<void> {
  const status = await new Deno.Command(command, {
    args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    ...options,
  }).spawn().status;
  if (!status.success) {
    throw new Error(
      `Command failed (${status.code}): ${command} ${args.join(" ")}`,
    );
  }
}

async function output(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const result = await new Deno.Command(command, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    code: result.code,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
}

function ensureSuccess(
  label: string,
  result: { code: number; stdout: string; stderr: string },
): void {
  if (result.code !== 0) {
    throw new Error(
      `${label} failed (${result.code}).\n${result.stdout}${result.stderr}`,
    );
  }
}

async function version(): Promise<string> {
  const config = JSON.parse(
    await Deno.readTextFile(join(ROOT, "deno.json")),
  ) as {
    version?: unknown;
  };
  if (
    typeof config.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(config.version)
  ) {
    throw new Error("deno.json must contain a valid X.Y.Z version");
  }
  const source = await Deno.readTextFile(join(ROOT, "src/wiki/version.ts"));
  const match = /^export const VERSION = "([^"]+)";$/m.exec(source);
  if (match?.[1] !== config.version) {
    throw new Error("src/wiki/version.ts VERSION must match deno.json");
  }
  return config.version;
}

async function checksum(path: string): Promise<string> {
  const hash = createHash("sha256");
  const file = await Deno.open(path, { read: true });
  const buffer = new Uint8Array(1024 * 1024);
  try {
    while (true) {
      const count = await file.read(buffer);
      if (count === null) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    file.close();
  }
  return hash.digest("hex");
}

async function compile(
  target: CompileTarget,
  executable: string,
): Promise<void> {
  const status = await Deno.stat(join(ROOT, "deno.json"));
  if (!status.isFile) throw new Error("deno.json is missing");
  await run(Deno.execPath(), [
    "compile",
    "--allow-all",
    "--target",
    target,
    "--include",
    join(ROOT, "src/wiki/templates"),
    "--include",
    join(ROOT, "src/wiki/index.html"),
    "--output",
    executable,
    ENTRYPOINT,
  ], { cwd: ROOT });
}

async function smokeTest(
  executable: string,
  expectedVersion: string,
): Promise<void> {
  const cwd = await Deno.makeTempDir({ prefix: "wiki-standalone-smoke-" });
  try {
    const versionResult = await output(executable, ["--version"], cwd);
    ensureSuccess("wiki --version", versionResult);
    if (versionResult.stdout.trim() !== `wiki, version ${expectedVersion}`) {
      throw new Error(
        `Unexpected version output: ${versionResult.stdout.trim()}`,
      );
    }

    const helpResult = await output(executable, ["--help"], cwd);
    ensureSuccess("wiki --help", helpResult);
    if (
      !helpResult.stdout.includes("Commands:") ||
      !helpResult.stdout.includes("check")
    ) {
      throw new Error("wiki --help did not list the command table");
    }

    const init = await output(
      executable,
      ["init", "--repo", "wazootech/wiki"],
      cwd,
    );
    ensureSuccess("wiki init", init);
    const check = await output(
      executable,
      ["-c", "wiki.yml", "check", "--strict"],
      cwd,
    );
    ensureSuccess("wiki check --strict", check);
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
}

async function createArchive(
  executable: string,
  archivePath: string,
  target: CompileTarget,
): Promise<void> {
  const { os } = TARGETS[target];
  if (os === "windows") {
    await run("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Compress-Archive -LiteralPath $env:WIKI_STANDALONE_EXE -DestinationPath $env:WIKI_STANDALONE_ARCHIVE -Force",
    ], {
      env: {
        WIKI_STANDALONE_EXE: executable,
        WIKI_STANDALONE_ARCHIVE: archivePath,
      },
      cwd: ROOT,
    });
    return;
  }
  await run("tar", [
    "-czf",
    archivePath,
    "-C",
    dirname(executable),
    "wiki",
  ], { cwd: ROOT });
}

async function build(
  target: CompileTarget,
  smokeCheck: boolean,
): Promise<void> {
  const projectVersion = await version();
  const spec = TARGETS[target];
  const base = artifactName(projectVersion, target);
  const outputDir = join(BUILD_DIR, spec.slug);
  await Deno.remove(outputDir, { recursive: true }).catch(() => {});
  await Deno.mkdir(outputDir, { recursive: true });
  await Deno.mkdir(DIST_DIR, { recursive: true });

  const executable = join(outputDir, spec.executable);
  const archivePath = join(DIST_DIR, `${base}.${spec.archive}`);
  await Deno.remove(archivePath).catch(() => {});
  await compile(target, executable);
  if (spec.os !== "windows") await Deno.chmod(executable, 0o755);
  if (smokeCheck) await smokeTest(executable, projectVersion);
  await createArchive(executable, archivePath, target);
  const info = await Deno.stat(archivePath);
  console.log(`Built: ${archivePath}`);
  console.log(`Size:  ${info.size.toLocaleString()} bytes`);
  console.log(`SHA256: ${await checksum(archivePath)}`);
}

if (import.meta.main) {
  try {
    const args = parseArgs(Deno.args);
    await build(args.target, args.smokeCheck);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exitCode = 1;
  }
}
