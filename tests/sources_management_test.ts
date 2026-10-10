import { dirname, join } from "@std/path";
import { pathExists, readText } from "../src/wiki/fspath.ts";
import { gitSymlinksUnavailable } from "./support/symlink_support.ts";
import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { Config } from "../src/wiki/config.ts";

import { loadLockfile } from "../src/wiki/schemas/sources.ts";
import { install, remove, update } from "../src/wiki/sources.ts";

function withTempDir(body: (root: string) => void): void {
  const root = Deno.makeTempDirSync({ prefix: "wiki-sources-" });
  try {
    body(root);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

function git(args: string[], cwd: string): string {
  const result = new Deno.Command("git", {
    args,
    cwd: cwd,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  const decoder = new TextDecoder();
  const stdout = decoder.decode(result.stdout);
  if (result.code !== 0) {
    throw new Error(decoder.decode(result.stderr) || stdout);
  }
  return stdout.trim();
}

function initRepo(
  root: string,
  name: string,
  files: Record<string, string>,
): string {
  const repo = join(root, name);
  Deno.mkdirSync(repo, { recursive: true });
  git(["init", "--initial-branch=main"], repo);
  for (const [relative, content] of Object.entries(files)) {
    const file = join(repo, relative);
    Deno.mkdirSync(dirname(file), { recursive: true });
    Deno.writeTextFileSync(file, content);
  }
  git(["add", "."], repo);
  git([
    "-c",
    "user.name=Wiki Tests",
    "-c",
    "user.email=wiki-tests@example.invalid",
    "commit",
    "-m",
    "initial",
  ], repo);
  return repo;
}

function commitFile(repo: string, relative: string, content: string): string {
  const file = join(repo, relative);
  Deno.writeTextFileSync(file, content);
  git(["add", relative], repo);
  git([
    "-c",
    "user.name=Wiki Tests",
    "-c",
    "user.email=wiki-tests@example.invalid",
    "commit",
    "-m",
    "update",
  ], repo);
  return git(["rev-parse", "HEAD"], repo);
}

function rootConfig(
  root: string,
  sources: readonly { name: string; url: string }[] = [],
): Config {
  const entries = sources.map(({ name, url }) =>
    `  - name: ${name}\n    type: git\n    url: ${url}`
  );
  Deno.writeTextFileSync(
    join(root, "wiki.yml"),
    `wiki:\n  input: wiki\n${
      entries.length ? `sources:\n${entries.join("\n")}\n` : ""
    }`,
  );
  return Config.load(root);
}

Deno.test("source install and removal preserve comments in wiki.yml", () => {
  withTempDir((root) => {
    const existing = initRepo(root, "existing", { "page.md": "# Existing\n" });
    const added = initRepo(root, "added", { "page.md": "# Added\n" });
    const wikiRoot = join(root, "wiki-root");
    Deno.mkdirSync(wikiRoot);
    const configPath = join(wikiRoot, "wiki.yml");
    Deno.writeTextFileSync(
      configPath,
      `# root comment\n` +
        `wiki:\n` +
        `  input: [wiki] # inline wiki comment\n` +
        `# sources block comment\n` +
        `sources:\n` +
        `  # existing source comment\n` +
        `  - name: existing\n` +
        `    type: git\n` +
        `    url: ${existing} # existing source URL comment\n` +
        `    # existing source trailing comment\n` +
        `# site block comment\n` +
        `site:\n` +
        `  base_url: /wiki # inline site comment\n`,
    );
    const config = Config.load(wikiRoot);

    install(config, added);
    remove(config, "added");

    const result = readText(configPath);
    for (
      const comment of [
        "# root comment",
        "# inline wiki comment",
        "# sources block comment",
        "# existing source comment",
        "# existing source URL comment",
        "# existing source trailing comment",
        "# site block comment",
        "# inline site comment",
      ]
    ) {
      assertStringIncludes(result, comment);
    }
    assertEquals(Config.load(wikiRoot).sources.map((source) => source.name), [
      "existing",
    ]);
  });
});

Deno.test("install from URL adds config entry and locks a local Git source", () => {
  withTempDir((root) => {
    const repo = initRepo(root, "source", { "page.md": "# Source\n" });
    const rootDir = join(root, "wiki-root");
    Deno.mkdirSync(rootDir);
    const config = rootConfig(rootDir);
    const expectedRef = git(["rev-parse", "HEAD"], repo);

    const lockfile = install(config, repo);
    assertEquals([...lockfile.sources.keys()], ["source"]);
    assertEquals(lockfile.sources.get("source")?.resolved_ref, expectedRef);
    assertEquals(lockfile.sources.get("source")?.required_by, []);
    assertEquals(config.sources.map((source) => source.name), ["source"]);
    assert(
      pathExists(
        join(rootDir, ".wiki", "sources", "source", "repo", "page.md"),
      ),
    );
    assertEquals(loadLockfile(join(rootDir, "wiki.lock")).sources.size, 1);
    assertStringIncludes(readText(join(rootDir, "wiki.yml")), "url: ");
  });
});

Deno.test("update dry-run reports the new ref without changing the lock", () => {
  withTempDir((root) => {
    const repo = initRepo(root, "source", { "page.md": "# v1\n" });
    const wikiRoot = join(root, "wiki-root");
    Deno.mkdirSync(wikiRoot);
    const config = rootConfig(wikiRoot, [{
      name: "source",
      url: repo,
    }]);
    const installed = install(config);
    const oldRef = installed.sources.get("source")!.resolved_ref;
    const lockBefore = readText(join(wikiRoot, "wiki.lock"));
    const newRef = commitFile(repo, "page.md", "# v2\n");

    const dryRun = update(config, undefined, { dry_run: true });
    assertEquals(dryRun.count, 1);
    assertEquals(dryRun.changed.map((entry) => entry.name), ["source"]);
    assertEquals(dryRun.updates[0]?.previous_ref, oldRef.slice(0, 12));
    assertEquals(dryRun.updates[0]?.current_ref, newRef.slice(0, 12));
    assertEquals(readText(join(wikiRoot, "wiki.lock")), lockBefore);

    const applied = update(config);
    assertEquals(applied.changed.map((entry) => entry.name), ["source"]);
    assertEquals(
      loadLockfile(join(wikiRoot, "wiki.lock")).sources.get("source")
        ?.resolved_ref,
      newRef,
    );
  });
});

Deno.test("install resolves transitive sources and records parent links", () => {
  withTempDir((root) => {
    const dep = initRepo(root, "dependency", { "dep.md": "# Dependency\n" });
    const parent = initRepo(root, "parent", {
      "wiki.yml":
        `wiki:\n  input: wiki\nsources:\n  - name: dependency\n    type: git\n    url: ${dep}\n`,
      "parent.md": "# Parent\n",
    });
    const wikiRoot = join(root, "wiki-root");
    Deno.mkdirSync(wikiRoot);
    const config = rootConfig(wikiRoot, [{
      name: "parent",
      url: parent,
    }]);

    const lockfile = install(config);
    assertEquals([...lockfile.sources.keys()], ["parent", "dependency"]);
    assertEquals(lockfile.sources.get("parent")?.required_by, []);
    assertEquals(lockfile.sources.get("dependency")?.required_by, ["parent"]);
    assert(
      pathExists(
        join(wikiRoot, ".wiki", "sources", "dependency", "repo", "dep.md"),
      ),
    );
  });
});

Deno.test("remove cascades orphan caches while preserving shared dependencies", () => {
  withTempDir((root) => {
    const shared = initRepo(root, "shared", { "shared.md": "# Shared\n" });
    const sourceA = initRepo(root, "source-a", {
      "wiki.yml":
        `sources:\n  - name: shared\n    type: git\n    url: ${shared}\n`,
    });
    const sourceB = initRepo(root, "source-b", {
      "wiki.yml":
        `sources:\n  - name: shared\n    type: git\n    url: ${shared}\n`,
    });
    const wikiRoot = join(root, "wiki-root");
    Deno.mkdirSync(wikiRoot);
    const config = rootConfig(wikiRoot, [
      { name: "source-a", url: sourceA },
      { name: "source-b", url: sourceB },
    ]);
    install(config);

    remove(config, "source-a");
    let lockfile = loadLockfile(join(wikiRoot, "wiki.lock"));
    assert(!lockfile.sources.has("source-a"));
    assertEquals(lockfile.sources.get("shared")?.required_by, ["source-b"]);
    assert(!pathExists(join(wikiRoot, ".wiki", "sources", "source-a")));
    assert(pathExists(join(wikiRoot, ".wiki", "sources", "shared")));

    remove(config, "source-b");
    lockfile = loadLockfile(join(wikiRoot, "wiki.lock"));
    assertEquals(lockfile.sources.size, 0);
    assert(!pathExists(join(wikiRoot, ".wiki", "sources", "shared")));
    assertEquals(rootConfig(wikiRoot).sources.length, 0);
  });
});

Deno.test("remove recursively deletes orphaned dependency chains", () => {
  withTempDir((root) => {
    const leaf = initRepo(root, "leaf", { "leaf.md": "# Leaf\n" });
    const middle = initRepo(root, "middle", {
      "wiki.yml": `sources:\n  - name: leaf\n    type: git\n    url: ${leaf}\n`,
    });
    const top = initRepo(root, "top", {
      "wiki.yml":
        `sources:\n  - name: middle\n    type: git\n    url: ${middle}\n`,
    });
    const wikiRoot = join(root, "wiki-root");
    Deno.mkdirSync(wikiRoot);
    const config = rootConfig(wikiRoot, [{ name: "top", url: top }]);
    install(config);

    remove(config, "top");

    const lockfile = loadLockfile(join(wikiRoot, "wiki.lock"));
    assertEquals(lockfile.sources.size, 0);
    for (const name of ["top", "middle", "leaf"]) {
      assert(!pathExists(join(wikiRoot, ".wiki", "sources", name)));
    }
  });
});

Deno.test("remove rejects path-traversing names without touching external data", () => {
  withTempDir((root) => {
    const wikiRoot = join(root, "wiki-root");
    Deno.mkdirSync(wikiRoot);
    const outside = join(root, "outside");
    Deno.mkdirSync(outside);
    Deno.writeTextFileSync(join(outside, "keep.txt"), "keep\n");
    const config = rootConfig(wikiRoot);
    assertThrows(
      () => remove(config, "../outside"),
      Error,
      "Unsafe source name",
    );
    assertEquals(readText(join(outside, "keep.txt")), "keep\n");
  });
});

Deno.test("failed clone retains Git stderr in the install error", () => {
  withTempDir((root) => {
    const wikiRoot = join(root, "wiki-root");
    Deno.mkdirSync(wikiRoot);
    const config = rootConfig(wikiRoot, [{
      name: "missing",
      url: join(root, "does-not-exist"),
    }]);
    const error = assertThrows(
      () => install(config),
      Error,
      "Failed to clone",
    );
    assertStringIncludes(error.message, "fatal:");
    // The point of the case is that git's own stderr survives into the error.
    // Its wording is not stable across platforms or versions: git on Windows
    // says "does not appear to be a git repository" where Linux says "does not
    // exist". Assert on the path being echoed back and on a fatal marker,
    // which hold for both, rather than on one platform's phrasing.
    assertStringIncludes(error.message, "does-not-exist");
  });
});

Deno.test("install rejects a transitive source path escaping its clone", () => {
  withTempDir((root) => {
    // The `path` of a transitive source comes from the *cloned remote repo's*
    // config, so `../../..` would escape the clone dir into the victim's
    // `.wiki/sources` cache — and `resolve()` would then serve it as a wiki
    // input. The install must fail closed instead.
    const evil = initRepo(root, "evil", { "evil.md": "# Evil\n" });
    const parent = initRepo(root, "parent", {
      "wiki.yml":
        `wiki:\n  input: wiki\nsources:\n  - name: evil\n    type: git\n    url: ${evil}\n    path: ../../..\n`,
      "parent.md": "# Parent\n",
    });
    const wikiRoot = join(root, "wiki-root");
    Deno.mkdirSync(wikiRoot);
    const config = rootConfig(wikiRoot, [{ name: "parent", url: parent }]);

    const error = assertThrows(() => install(config), Error);
    assertStringIncludes(error.message, "escapes the cloned repository");
  });
});

Deno.test({
  name:
    "install rejects a transitive source path via a symlink escaping its clone",
  ignore: gitSymlinksUnavailable(),
  fn: () => {
    withTempDir((root) => {
      // A symlink inside the clone pointing outside it is the same escape
      // through a different mechanism: the lexical `join` stays in-tree,
      // but the resolved path does not.
      const evilDir = join(root, "evil");
      Deno.mkdirSync(evilDir, { recursive: true });
      git(["init", "--initial-branch=main"], evilDir);
      Deno.writeTextFileSync(join(evilDir, "evil.md"), "# Evil\n");
      Deno.symlinkSync("..", join(evilDir, "link"));
      git(["add", "."], evilDir);
      git(
        [
          "-c",
          "user.name=Wiki Tests",
          "-c",
          "user.email=wiki-tests@example.invalid",
          "commit",
          "-m",
          "initial",
        ],
        evilDir,
      );
      const parent = initRepo(root, "parent", {
        "wiki.yml":
          `wiki:\n  input: wiki\nsources:\n  - name: evil\n    type: git\n    url: ${evilDir}\n    path: link\n`,
        "parent.md": "# Parent\n",
      });
      const wikiRoot = join(root, "wiki-root");
      Deno.mkdirSync(wikiRoot);
      const config = rootConfig(wikiRoot, [{ name: "parent", url: parent }]);

      const error = assertThrows(() => install(config), Error);
      assertStringIncludes(error.message, "escapes the cloned repository");
    });
  },
});

Deno.test("install accepts a transitive source rooted at its clone", () => {
  withTempDir((root) => {
    // The fix must not break the legitimate cases: no `path` (the repo root
    // itself) and `path: "."` both select the clone dir. Directory names come
    // from `label`, never from `path`: Windows strips a trailing dot from a
    // path component, so a dir named `parent-.` yields a clone destination
    // (`wiki-root-./.wiki/sources/...`) that fails with `Invalid argument`.
    const dep = initRepo(root, "dependency", { "dep.md": "# Dependency\n" });
    const cases = [
      { label: "root", path: null },
      { label: "dot", path: "." },
    ] as const;
    for (const { label, path } of cases) {
      const parent = initRepo(root, `parent-${label}`, {
        "wiki.yml":
          `wiki:\n  input: wiki\nsources:\n  - name: dep\n    type: git\n    url: ${dep}\n` +
          (path === null ? "" : `    path: ${path}\n`),
        "parent.md": "# Parent\n",
      });
      const wikiRoot = join(root, `wiki-root-${label}`);
      Deno.mkdirSync(wikiRoot);
      const config = rootConfig(wikiRoot, [{
        name: "parent",
        url: parent,
      }]);
      const lockfile = install(config);
      assertEquals([...lockfile.sources.keys()], ["parent", "dep"]);
    }
  });
});
