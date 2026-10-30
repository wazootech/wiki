import { dirname, join, normalize } from "@std/path";

/**
 * The site-packages directories a Python install could pair with `binDir`:
 * `<prefix>/lib/python3.X/{site,dist}-packages` (POSIX venvs, `--user`, uv
 * tools, Debian), `<prefix>/Lib/site-packages` (Windows), and
 * `<prefix>/site-packages` (the Windows `--user` scheme).
 */
function siteDirectoriesFor(binDir: string): string[] {
  const prefix = dirname(binDir);
  const sites = [
    join(prefix, "Lib", "site-packages"),
    join(prefix, "site-packages"),
  ];
  for (const lib of ["lib", "lib64"]) {
    try {
      for (const entry of Deno.readDirSync(join(prefix, lib))) {
        if (!entry.isDirectory || !entry.name.startsWith("python")) continue;
        sites.push(join(prefix, lib, entry.name, "site-packages"));
        sites.push(join(prefix, lib, entry.name, "dist-packages"));
      }
    } catch {
      // No such directory: not a POSIX prefix.
    }
  }
  return sites;
}

function samePath(left: string, right: string): boolean {
  const a = normalize(left);
  const b = normalize(right);
  return Deno.build.os === "windows"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

/**
 * Whether `executable` is the binary a `wazootech-wiki` wheel installed.
 *
 * The wheel puts the binary in the Python scripts directory, and pip records
 * its installed path, relative to site-packages, in the dist-info `RECORD`.
 * A match there is proof rather than a guess from the directory name, so a
 * standalone binary someone copied into a scripts directory is not mistaken
 * for a pip install.
 */
export function isPypiInstall(executable: string): boolean {
  let resolved = executable;
  try {
    resolved = Deno.realPathSync(executable);
  } catch {
    // Keep the path as given.
  }
  for (const site of siteDirectoriesFor(dirname(resolved))) {
    let entries: Deno.DirEntry[];
    try {
      entries = [...Deno.readDirSync(site)];
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/^wazootech_wiki-[^/\\]+\.dist-info$/.test(entry.name)) continue;
      let record: string;
      try {
        record = Deno.readTextFileSync(join(site, entry.name, "RECORD"));
      } catch {
        continue;
      }
      for (const line of record.split(/\r?\n/)) {
        const path = line.split(",")[0];
        if (path && samePath(join(site, path), resolved)) return true;
      }
    }
  }
  return false;
}
