export const JSR_METADATA_URL = "https://jsr.io/@wazoo/wiki/meta.json";
export const JSR_PACKAGE = "@wazoo/wiki";
export const GITHUB_RELEASES_URL =
  "https://github.com/wazootech/wiki/releases/latest";

/** How to upgrade the binary a `wazootech-wiki` wheel installed. */
export const PYPI_UPGRADE =
  "For a PyPI install, run pip install -U wazootech-wiki, or uv tool upgrade wazootech-wiki for a uv tool install.";

/**
 * How to upgrade an install that `deno install` cannot replace.
 *
 * Shared by the not-published and not-global paths so both give the same
 * advice: the npm and standalone channels are available regardless of
 * whether JSR publication has happened.
 */
export const ALTERNATE_CHANNELS = [
  "For an npm install, run npm update -g wazootech-wiki (global) or npm update wazootech-wiki (project-local).",
  PYPI_UPGRADE,
  `Otherwise download the latest release from ${GITHUB_RELEASES_URL}.`,
];

/**
 * The deferral shown whenever JSR holds no published version to compare
 * against. Two response shapes reach this: a 404 (never registered) and a
 * registered-but-unpublished package, which JSR serves as 200 with an empty
 * `versions` map.
 */
export function notPublishedMessage(): string {
  return [
    `${JSR_PACKAGE} is not published on JSR yet, so there is no version to compare against.`,
    "Self-upgrade becomes available with the first JSR release; no action is needed now.",
    ...ALTERNATE_CHANNELS,
  ].join("\n");
}

export interface UpgradeOptions {
  readonly checkOnly: boolean;
  readonly yes: boolean;
  readonly verbose: boolean;
}

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Why `wiki upgrade` declines to run, when JSR cannot answer.
 *
 * `unreachable` is a transient condition and keeps its error; `not-published`
 * is a deliberate deferral until the first JSR release, so the command steps
 * aside instead of failing. Both exit 0, and both say so on stdout: a caller
 * that cannot tell "deferred" from "up to date" by exit code alone still sees
 * which happened in the message.
 */
export type DeferredReason = "not-published" | "unreachable";

export type InstallTarget =
  | { readonly kind: "global"; readonly root: string }
  | { readonly kind: "standalone"; readonly path: string }
  | { readonly kind: "pypi"; readonly path: string }
  | { readonly kind: "non-global" };

export interface UpgradeDependencies {
  readonly fetchMetadata: (url: string) => Promise<Response>;
  readonly runCommand: (
    executable: string,
    args: readonly string[],
  ) => Promise<CommandResult>;
  readonly confirm: (message: string) => Promise<boolean>;
  readonly findInstallTarget: () => Promise<InstallTarget>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly currentVersion: string;
  readonly denoExecutable: string;
}
