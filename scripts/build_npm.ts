/**
 * Builds the JavaScript the `wazootech-wiki` npm package ships, into `dist/`.
 *
 *     bun scripts/build_npm.ts
 *
 * The engine and its JSR dependencies are bundled, because npm cannot install
 * them without registry configuration. Packages in `dependencies` stay external,
 * so npm installs them and their license files in the usual way.
 */
import { readFileSync, rmSync } from "node:fs";
import { fromFileUrl } from "@std/path";

const root = fromFileUrl(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8")) as {
  dependencies: Record<string, string>;
};

rmSync(`${root}dist`, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [`${root}src/wiki/cli.ts`],
  outdir: `${root}dist`,
  target: "node",
  format: "esm",
  // Keeps `--version` from loading the whole engine.
  splitting: true,
  // `bin/wiki.js` calls `main` itself. Left alone, the `import.meta.main`
  // guard compiles to a check that is true under Node and would run it twice.
  define: { "import.meta.main": "false" },
  // A prefix match per package, so `ajv/dist/2020.js` stays external too.
  external: Object.keys(pkg.dependencies).flatMap((
    name,
  ) => [name, `${name}/*`]),
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`built ${result.outputs.length} files into dist/`);
