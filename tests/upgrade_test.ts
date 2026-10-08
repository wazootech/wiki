import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  type CommandResult,
  type InstallTarget,
  JSR_METADATA_URL,
  runUpgrade,
  type UpgradeDependencies,
  type UpgradeOptions,
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

function harness(overrides: Partial<UpgradeDependencies> = {}) {
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

const check: UpgradeOptions = { checkOnly: true, yes: false, verbose: false };
const promptUpgrade: UpgradeOptions = {
  checkOnly: false,
  yes: false,
  verbose: false,
};
const automaticUpgrade: UpgradeOptions = {
  checkOnly: false,
  yes: true,
  verbose: false,
};

Deno.test("upgrade check reports an available version and returns outdated status", async () => {
  const state = harness();
  const code = await runUpgrade(check, state.dependencies);

  assertEquals(code, 1);
  assertEquals(state.fetched, [JSR_METADATA_URL]);
  assertEquals(state.stdout, ["Update available: 0.1.2 -> 0.1.4"]);
  assertEquals(state.stderr, []);
  assertEquals(state.commands, []);
  assertEquals(state.prompts, []);
  assertEquals(state.targetLookups(), 0);
});

Deno.test("upgrade check is successful when already current", async () => {
  const state = harness({
    currentVersion: "0.1.4",
  });
  const code = await runUpgrade(check, state.dependencies);

  assertEquals(code, 0);
  assertEquals(state.stdout, ["You're up to date (0.1.4)."]);
  assertEquals(state.commands, []);
  assertEquals(state.prompts, []);
});

Deno.test("metadata fallback selects the highest stable non-yanked version", async () => {
  const state = harness({
    fetchMetadata: () =>
      Promise.resolve(Response.json({
        versions: {
          "0.1.9": {},
          "0.1.8": { yanked: true },
          "0.2.0-beta.2": {},
          "0.2.0-beta.10": {},
        },
      })),
    currentVersion: "0.1.2",
  });
  const code = await runUpgrade(check, state.dependencies);

  assertEquals(code, 1);
  assertEquals(state.stdout, ["Update available: 0.1.2 -> 0.1.9"]);
});

Deno.test("upgrade steps aside when JSR cannot answer", async () => {
  const network = harness({
    fetchMetadata: () => Promise.reject(new Error("offline")),
  });
  assertEquals(await runUpgrade(check, network.dependencies), 0);
  assertStringIncludes(network.stdout[0]!, "Cannot reach JSR");
  assertStringIncludes(network.stdout[0]!, "offline");

  const notPublished = harness({
    fetchMetadata: () =>
      Promise.resolve(new Response("not found", { status: 404 })),
  });
  assertEquals(await runUpgrade(check, notPublished.dependencies), 0);
  assertStringIncludes(
    notPublished.stdout[0]!,
    "@wazoo/wiki is not published on JSR yet",
  );
  // Not a dead end: while JSR is unpublished the npm and standalone channels
  // still work, so the message must say how to upgrade through them.
  assertStringIncludes(notPublished.stdout[0]!, "npm update -g wazootech-wiki");
  assertStringIncludes(
    notPublished.stdout[0]!,
    "https://github.com/wazootech/wiki/releases/latest",
  );
});

Deno.test("a deferred registry never installs anything", async () => {
  // The no-op has to stay a no-op: no install target is even resolved, so a
  // deferred check cannot mutate the user's installation on its way out.
  const state = harness({
    fetchMetadata: () =>
      Promise.resolve(new Response("not found", { status: 404 })),
    findInstallTarget: () => {
      throw new Error("findInstallTarget must not run when deferred");
    },
    runCommand: () => {
      throw new Error("runCommand must not run when deferred");
    },
  });
  assertEquals(
    await runUpgrade(
      { checkOnly: false, yes: true, verbose: false },
      state.dependencies,
    ),
    0,
  );
  assertStringIncludes(state.stdout[0]!, "no version to compare against");
});

Deno.test("upgrade steps aside on non-404 JSR HTTP failures", async () => {
  const state = harness({
    fetchMetadata: () =>
      Promise.resolve(
        new Response("unavailable", {
          status: 503,
          statusText: "Service Unavailable",
        }),
      ),
  });

  assertEquals(await runUpgrade(check, state.dependencies), 0);
  assertStringIncludes(state.stdout[0]!, "HTTP 503 Service Unavailable");
});

Deno.test("upgrade defers on a registered but unpublished JSR package", async () => {
  // The live shape. The package is registered and linked to its repository,
  // so JSR answers 200 rather than 404 and simply has no versions yet; the
  // deferral has to key off that, not off the status code alone.
  const state = harness({
    fetchMetadata: () =>
      Promise.resolve(Response.json({ latest: null, versions: {} })),
  });
  assertEquals(await runUpgrade(check, state.dependencies), 0);
  assertStringIncludes(state.stdout[0]!, "@wazoo/wiki is not published on JSR");
  assertStringIncludes(state.stdout[0]!, "npm update -g wazootech-wiki");
});

Deno.test("upgrade check rejects malformed JSR metadata", async () => {
  const state = harness({
    fetchMetadata: () => Promise.resolve(Response.json({ latest: null })),
  });
  assertEquals(await runUpgrade(check, state.dependencies), 1);
  assertStringIncludes(state.stderr[0]!, "Invalid JSR package metadata");
});

Deno.test("declining the default confirmation never invokes the installer", async () => {
  const state = harness({
    confirm: (message) => {
      state.prompts.push(message);
      return Promise.resolve(false);
    },
  });
  const code = await runUpgrade(promptUpgrade, state.dependencies);

  assertEquals(code, 0);
  assertEquals(state.prompts, ["Upgrade now?"]);
  assertEquals(state.commands, []);
  assertEquals(state.stdout.at(-1), "Upgrade cancelled.");
});

Deno.test("non-interactive confirmation failure fails closed", async () => {
  const state = harness({
    confirm: () =>
      Promise.reject(new Error("confirmation required; rerun with --yes")),
  });
  const code = await runUpgrade(promptUpgrade, state.dependencies);

  assertEquals(code, 1);
  assertStringIncludes(state.stderr[0]!, "confirmation required");
  assertEquals(state.commands, []);
});

Deno.test("confirmation installs the exact JSR version into the existing global root", async () => {
  const state = harness();
  const code = await runUpgrade(promptUpgrade, state.dependencies);

  assertEquals(code, 0);
  assertEquals(state.commands.length, 1);
  assertEquals(state.commands[0]!.executable, Deno.execPath());
  assertEquals(state.commands[0]!.args, [
    "install",
    "--global",
    "--force",
    "--no-config",
    "--allow-all",
    "--name",
    "wiki",
    "--root",
    "/tmp/deno",
    "jsr:@wazoo/wiki@0.1.4/cli",
  ]);
  assertEquals(state.stdout.at(-1), "Upgraded to 0.1.4.");
});

Deno.test("--yes skips confirmation and still uses the injected command runner", async () => {
  const state = harness();
  const code = await runUpgrade(automaticUpgrade, state.dependencies);

  assertEquals(code, 0);
  assertEquals(state.prompts, []);
  assertEquals(state.commands.length, 1);
});

Deno.test("non-global and standalone installs are not overwritten", async () => {
  const targets: InstallTarget[] = [
    { kind: "non-global" },
    { kind: "standalone", path: "/tmp/wiki" },
  ];
  for (const target of targets) {
    const state = harness({
      findInstallTarget: () => Promise.resolve(target),
    });
    const code = await runUpgrade(automaticUpgrade, state.dependencies);
    assertEquals(code, 1);
    assertEquals(state.commands, []);
    assertEquals(state.prompts, []);
    assertStringIncludes(
      state.stderr.join("\n"),
      target.kind === "standalone"
        ? "standalone wiki binary"
        : "not installed as a global Deno command",
    );
    if (target.kind === "non-global") {
      assertStringIncludes(
        state.stderr.join("\n"),
        "npm update -g wazootech-wiki",
      );
    }
  }
});

Deno.test("installer failure is surfaced and returns failure", async () => {
  const result: CommandResult = {
    code: 1,
    stdout: "",
    stderr: "permission denied",
  };
  const state = harness({
    runCommand: () => Promise.resolve(result),
  });
  const code = await runUpgrade(automaticUpgrade, state.dependencies);

  assertEquals(code, 1);
  assertStringIncludes(state.stderr[0]!, "Upgrade failed");
  assertStringIncludes(state.stderr[0]!, "permission denied");
  assertEquals(state.stdout.at(-1), "Update available: 0.1.2 -> 0.1.4");
});

Deno.test("verbose mode exposes installer invocation and output", async () => {
  const state = harness({
    runCommand: () =>
      Promise.resolve({
        code: 0,
        stdout: "installed package\n",
        stderr: "installer detail\n",
      }),
  });
  const code = await runUpgrade(
    { ...automaticUpgrade, verbose: true },
    state.dependencies,
  );

  assertEquals(code, 0);
  assertStringIncludes(state.stdout.join("\n"), "deno");
  assertStringIncludes(state.stdout.join("\n"), "jsr:@wazoo/wiki@0.1.4/cli");
  assertStringIncludes(state.stdout.join("\n"), "installed package");
  assertStringIncludes(state.stderr.join("\n"), "installer detail");
});
