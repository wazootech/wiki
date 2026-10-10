/**
 * Whether this host allows creating symlinks.
 *
 * Windows refuses `CreateSymbolicLink` unless the process holds
 * `SeCreateSymbolicLinkPrivilege`, which by default only Administrators and
 * processes in Developer Mode have. Without it every symlink assertion fails
 * with `ERROR_PRIVILEGE_NOT_HELD` (os error 1314) -- an environment limit, not
 * a defect in the code under test.
 *
 * Callers skip on `false` rather than failing, and say so in the test name, so
 * an unrunnable case is visible instead of masquerading as a passing one.
 */
let cached: boolean | undefined;

/** Probe once per process by actually attempting a symlink. */
export function canCreateSymlinks(): boolean {
  if (cached !== undefined) return cached;
  const dir = Deno.makeTempDirSync({ prefix: "wiki-symlink-probe-" });
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  try {
    const target = `${dir}${separator}target`;
    Deno.writeTextFileSync(target, "x");
    Deno.symlinkSync(target, `${dir}${separator}link`);
    cached = true;
  } catch {
    cached = false;
  } finally {
    try {
      Deno.removeSync(dir, { recursive: true });
    } catch { /* the probe's own leftovers are not worth failing over */ }
  }
  return cached;
}

/** A Deno.test `ignore` flag, so the skip is declared rather than hidden. */
export function symlinksUnavailable(): boolean {
  return !canCreateSymlinks();
}

/**
 * Whether a git clone on this host checks symlinks out as symlinks.
 *
 * Git for Windows defaults `core.symlinks` to `false`, so a cloned symlink
 * lands as a plain file holding its target path, even where the process can
 * create symlinks itself. Tests that clone a repo containing a symlink need
 * both.
 */
export function gitSymlinksUnavailable(): boolean {
  if (symlinksUnavailable()) return true;
  const output = new Deno.Command("git", {
    args: ["config", "--get", "core.symlinks"],
    stdout: "piped",
    stderr: "null",
  }).outputSync();
  return new TextDecoder().decode(output.stdout).trim() === "false";
}
