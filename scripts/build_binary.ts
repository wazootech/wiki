/**
 * Compiles the standalone `wiki` executable for one platform.
 *
 *     bun scripts/build_binary.ts <target-triple> <output-path>
 *
 * The triples are the keys of `TARGETS` in `scripts/build_wheel.py`.
 */
import { fromFileUrl } from "@std/path";

const BUN_TARGETS: Record<string, string> = {
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
  "aarch64-pc-windows-msvc": "bun-windows-arm64",
};

const [triple, output] = process.argv.slice(2);
const target = triple === undefined ? undefined : BUN_TARGETS[triple];
if (target === undefined || output === undefined) {
  console.error(
    `usage: bun scripts/build_binary.ts <${Object.keys(BUN_TARGETS).join(
      "|",
    )}> <output-path>`,
  );
  process.exit(2);
}

const compile = Bun.spawnSync(
  [
    process.execPath,
    "build",
    "--compile",
    `--target=${target}`,
    // A compiled Bun program would otherwise read `.env` and `bunfig.toml` from
    // the folder it runs in, and a `bunfig.toml` preload there would execute.
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
    // ESLint loads `jiti` only for TypeScript config files, which Wiki never
    // reads, and it is not installed.
    "--external=jiti",
    "--external=jiti/package.json",
    `--outfile=${output}`,
    "src/wiki/cli.ts",
  ],
  {
    cwd: fromFileUrl(new URL("../", import.meta.url)),
    stdio: ["inherit", "inherit", "inherit"],
  },
);
process.exit(compile.exitCode);
