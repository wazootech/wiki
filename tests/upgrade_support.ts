import type {
  UpgradeDependencies,
  UpgradeOptions,
} from "../src/wiki/upgrade.ts";

const outdatedMetadata = {
  scope: "wazoo",
  name: "wiki",
  latest: "0.1.4",
  versions: {
    "0.1.2": {},
    "0.1.3": {},
    "0.1.4": {},
  },
};

export function harness(overrides: Partial<UpgradeDependencies> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const fetched: string[] = [];
  const commands: { executable: string; args: readonly string[] }[] = [];
  const prompts: string[] = [];
  let targetLookups = 0;
  const dependencies: UpgradeDependencies = {
    fetchMetadata: (url) => {
      fetched.push(url);
      return Promise.resolve(Response.json(outdatedMetadata));
    },
    runCommand: (executable, args) => {
      commands.push({ executable, args });
      return Promise.resolve({ code: 0, stdout: "installed\n", stderr: "" });
    },
    confirm: (message) => {
      prompts.push(message);
      return Promise.resolve(true);
    },
    findInstallTarget: () => {
      targetLookups++;
      return Promise.resolve({ kind: "global", root: "/tmp/deno" });
    },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    currentVersion: "0.1.2",
    denoExecutable: Deno.execPath(),
    ...overrides,
  };
  return {
    dependencies,
    stdout,
    stderr,
    fetched,
    commands,
    prompts,
    targetLookups: () => targetLookups,
  };
}

export const check: UpgradeOptions = {
  checkOnly: true,
  yes: false,
  verbose: false,
};
export const promptUpgrade: UpgradeOptions = {
  checkOnly: false,
  yes: false,
  verbose: false,
};
export const automaticUpgrade: UpgradeOptions = {
  checkOnly: false,
  yes: true,
  verbose: false,
};

/**
 * Lay out a Python prefix with the binary at `scriptRel` and, when `record`
 * is given, a `wazootech_wiki` dist-info under `siteRel` whose RECORD holds
 * those lines. Returns the binary's path.
 */
export async function pythonPrefix(
  scriptRel: string,
  siteRel: string,
  record?: readonly string[],
  distInfo = "wazootech_wiki-0.2.0.dist-info",
): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "wiki-pypi-" });
  const binary = `${root}/${scriptRel}`;
  await Deno.mkdir(binary.slice(0, binary.lastIndexOf("/")), {
    recursive: true,
  });
  await Deno.writeFile(binary, new Uint8Array());
  if (record) {
    const info = `${root}/${siteRel}/${distInfo}`;
    await Deno.mkdir(info, { recursive: true });
    await Deno.writeTextFile(`${info}/RECORD`, record.join("\n") + "\n");
  }
  return binary;
}
