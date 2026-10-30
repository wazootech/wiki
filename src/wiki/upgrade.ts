import type {
  CommandResult,
  InstallTarget,
  UpgradeDependencies,
  UpgradeOptions,
} from "./upgrade/types.ts";
import { compareVersions, parseVersion } from "./upgrade/versions.ts";
import {
  DeferredUpgradeError,
  errorMessage,
  readLatestVersion,
} from "./upgrade/latest.ts";
import { commandDescription } from "./upgrade/process.ts";
import {
  defaultDependencies,
  updateUnavailableMessage,
} from "./upgrade/install_target.ts";

export {
  type CommandResult,
  GITHUB_RELEASES_URL,
  type InstallTarget,
  JSR_METADATA_URL,
  JSR_PACKAGE,
  type UpgradeDependencies,
  type UpgradeOptions,
} from "./upgrade/types.ts";
export { isPypiInstall } from "./upgrade/pypi.ts";

export async function runUpgrade(
  options: UpgradeOptions,
  dependencies: Partial<UpgradeDependencies> = {},
): Promise<number> {
  const deps = { ...defaultDependencies, ...dependencies };
  let latest: string;
  try {
    latest = await readLatestVersion(deps.fetchMetadata);
  } catch (error) {
    // A deferred or unreachable registry is a no-op, not a failure: there is
    // no update to apply either way, so installing nothing is correct and
    // exiting non-zero would make every CI caller red for a condition that
    // resolves itself at the first JSR release. The reason is printed so a
    // caller can tell this apart from "you're up to date".
    if (error instanceof DeferredUpgradeError) {
      deps.stdout(error.message);
      return 0;
    }
    deps.stderr(`Error: ${errorMessage(error)}`);
    return 1;
  }

  const current = parseVersion(deps.currentVersion);
  if (!current) {
    deps.stderr(
      `Error: cannot determine current version (${deps.currentVersion}).`,
    );
    return 1;
  }
  const newest = parseVersion(latest);
  if (!newest) {
    deps.stderr(`Error: invalid latest version returned by JSR (${latest}).`);
    return 1;
  }
  const outdated = compareVersions(current, newest) < 0;
  if (outdated) {
    deps.stdout(`Update available: ${deps.currentVersion} -> ${latest}`);
  } else {
    deps.stdout(`You're up to date (${deps.currentVersion}).`);
  }

  if (options.checkOnly) return outdated ? 1 : 0;
  if (!outdated) return 0;

  if (!options.yes) {
    let confirmed: boolean;
    try {
      confirmed = await deps.confirm("Upgrade now?");
    } catch (error) {
      deps.stderr(`Error: ${errorMessage(error)}.`);
      return 1;
    }
    if (!confirmed) {
      deps.stdout("Upgrade cancelled.");
      return 0;
    }
  }

  let target: InstallTarget;
  try {
    target = await deps.findInstallTarget();
  } catch (error) {
    deps.stderr(
      `Upgrade failed: cannot determine installation target: ${
        errorMessage(error)
      }`,
    );
    return 1;
  }
  if (target.kind !== "global") {
    deps.stderr(`Error: ${updateUnavailableMessage(target, latest)}`);
    return 1;
  }

  const packageSpecifier = `jsr:@wazoo/wiki@${latest}/cli`;
  const commandArgs = [
    "install",
    "--global",
    "--force",
    "--no-config",
    "--allow-all",
    "--name",
    "wiki",
    "--root",
    target.root,
    packageSpecifier,
  ];
  if (options.verbose) {
    deps.stdout(
      `Running: ${commandDescription(deps.denoExecutable, commandArgs)}`,
    );
  }

  let result: CommandResult;
  try {
    result = await deps.runCommand(deps.denoExecutable, commandArgs);
  } catch (error) {
    deps.stderr(`Upgrade failed: ${errorMessage(error)}`);
    return 1;
  }
  if (options.verbose) {
    if (result.stdout) deps.stdout(result.stdout.trimEnd());
    if (result.stderr) deps.stderr(result.stderr.trimEnd());
  }
  if (result.code !== 0) {
    const details = [result.stderr.trim(), result.stdout.trim()].filter(Boolean)
      .join("\n");
    deps.stderr(
      `Upgrade failed (Deno exited with code ${result.code})${
        details ? `: ${details}` : "."
      }`,
    );
    return 1;
  }
  deps.stdout(`Upgraded to ${latest}.`);
  return 0;
}
