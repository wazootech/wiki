import { join } from "@std/path";
import { isDirectory, pathExists, readText } from "../src/wiki/fspath.ts";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { fetchTemplate, scaffoldWiki } from "../src/wiki/init_scaffold.ts";
import { cleanup, tempRoot } from "./init_scaffold_support.ts";

Deno.test("failed local git init rolls back generated files and preserves existing paths", () => {
  const root = tempRoot();
  try {
    const gitignore = join(root, ".gitignore");
    Deno.writeTextFileSync(gitignore, "# keep\n");
    const wikiDirectory = join(root, "wiki");
    Deno.mkdirSync(wikiDirectory);

    const result = scaffoldWiki(root, {
      graph_context_wiki: "https://example.org/",
    }, {
      init_git: true,
      git_runner: (cwd) => {
        const gitDirectory = `${cwd}/.git`;
        Deno.mkdirSync(gitDirectory);
        Deno.writeTextFileSync(`${gitDirectory}/partial`, "partial init");
        return { code: 1, stderr: "controlled git failure" };
      },
    });

    assertEquals(result.ok, false);
    assertStringIncludes(
      result.error_message ?? "",
      "git init failed: controlled git failure",
    );
    assertEquals(readText(gitignore), "# keep\n");
    assertEquals(isDirectory(wikiDirectory), true);
    assertEquals(pathExists(join(root, "README.md")), false);
    assertEquals(pathExists(join(root, "wiki.yml")), false);
    assertEquals(pathExists(join(root, ".git")), false);
  } finally {
    cleanup(root);
  }
});

Deno.test("failed local git init removes only a scaffold-created target tree", () => {
  const parent = tempRoot();
  const root = join(parent, "new", "wiki-project");
  try {
    const result = scaffoldWiki(root, {
      graph_context_wiki: "https://example.org/",
    }, {
      init_git: true,
      git_runner: (cwd) => {
        const gitDirectory = `${cwd}/.git`;
        Deno.mkdirSync(gitDirectory);
        Deno.writeTextFileSync(`${gitDirectory}/partial`, "partial init");
        return { code: 1, stderr: "controlled git failure" };
      },
    });

    assertEquals(result.ok, false);
    assertStringIncludes(
      result.error_message ?? "",
      "git init failed: controlled git failure",
    );
    assertEquals(pathExists(root), false);
    assertEquals(pathExists(join(parent, "new")), false);
  } finally {
    cleanup(parent);
  }
});

Deno.test("optional local git init creates a repository after scaffolding", () => {
  const root = tempRoot();
  try {
    const result = scaffoldWiki(root, {
      graph_context_wiki: "https://example.org/",
    }, { init_git: true });
    assertEquals(result.ok, true);
    assertStringIncludes(result.message, "Ran git init.");
    assertEquals(isDirectory(join(root, ".git")), true);
    const status = new Deno.Command("git", {
      args: ["rev-parse", "--is-inside-work-tree"],
      cwd: root,
      stdout: "piped",
      stderr: "null",
    }).outputSync();
    assertEquals(status.code, 0);
    assertEquals(new TextDecoder().decode(status.stdout).trim(), "true");
  } finally {
    cleanup(root);
  }
});

Deno.test("template fetching copies visible files without copying Git metadata", () => {
  const root = tempRoot();
  try {
    const result = fetchTemplate(root, "generic", {
      cloneRepository: (destination) => {
        const template = join(destination, "templates", "generic");
        Deno.mkdirSync(template, { recursive: true });
        Deno.writeTextFileSync(
          join(template, "README.md"),
          "# Template\n",
        );
        Deno.writeTextFileSync(
          join(template, ".gitignore"),
          ".wiki/\n",
        );
        Deno.writeTextFileSync(
          join(template, ".hidden"),
          "do not copy\n",
        );
        const nested = join(template, "nested");
        Deno.mkdirSync(nested);
        Deno.writeTextFileSync(
          join(nested, "page.md"),
          "# Nested\n",
        );
        const git = join(destination, ".git");
        Deno.mkdirSync(git);
        Deno.writeTextFileSync(join(git, "config"), "private\n");
        return { code: 0, stderr: "" };
      },
    });
    assertEquals(result.ok, true);
    assertStringIncludes(
      result.message,
      "Initialized wiki from template 'generic'",
    );
    assertEquals(readText(join(root, "README.md")), "# Template\n");
    assertEquals(readText(join(root, ".gitignore")), ".wiki/\n");
    assertEquals(readText(join(root, "nested", "page.md")), "# Nested\n");
    assertEquals(pathExists(join(root, ".hidden")), false);
    assertEquals(pathExists(join(root, ".git")), false);
  } finally {
    cleanup(root);
  }
});

Deno.test("template fetching falls back to a legacy root template when templates/ is absent", () => {
  const root = tempRoot();
  try {
    const result = fetchTemplate(root, "generic", {
      cloneRepository: (destination) => {
        const template = join(destination, "generic");
        Deno.mkdirSync(template, { recursive: true });
        Deno.writeTextFileSync(join(template, "README.md"), "# Legacy\n");
        return { code: 0, stderr: "" };
      },
    });
    assertEquals(result.ok, true);
    assertStringIncludes(
      result.message,
      "Initialized wiki from template 'generic'",
    );
    assertEquals(readText(join(root, "README.md")), "# Legacy\n");
  } finally {
    cleanup(root);
  }
});

Deno.test("template fetching prefers templates/ over a legacy root template", () => {
  const root = tempRoot();
  try {
    const result = fetchTemplate(root, "generic", {
      cloneRepository: (destination) => {
        const legacy = join(destination, "generic");
        Deno.mkdirSync(legacy, { recursive: true });
        Deno.writeTextFileSync(join(legacy, "README.md"), "root\n");
        const preferred = join(destination, "templates", "generic");
        Deno.mkdirSync(preferred, { recursive: true });
        Deno.writeTextFileSync(join(preferred, "README.md"), "templates\n");
        return { code: 0, stderr: "" };
      },
    });
    assertEquals(result.ok, true);
    assertEquals(readText(join(root, "README.md")), "templates\n");
  } finally {
    cleanup(root);
  }
});

Deno.test("template fetching reports clone failures without changing files", () => {
  const root = tempRoot();
  try {
    const result = fetchTemplate(root, "generic", {
      cloneRepository: () => ({ code: 1, stderr: "offline" }),
    });
    assertEquals(result.ok, false);
    assertStringIncludes(result.error_message ?? "", "Failed to clone");
    assertStringIncludes(result.error_message ?? "", "offline");
    assertEquals([...Deno.readDirSync(root)].length, 0);
  } finally {
    cleanup(root);
  }
});

Deno.test("template fetching refuses path traversal and existing destinations before cloning", () => {
  const root = tempRoot();
  try {
    let cloneCount = 0;
    const cloneRepository = (): { code: number; stderr: string } => {
      cloneCount++;
      return { code: 0, stderr: "" };
    };
    const traversal = fetchTemplate(root, "../generic", { cloneRepository });
    assertEquals(traversal.ok, false);
    assertStringIncludes(
      traversal.error_message ?? "",
      "Invalid template name",
    );
    assertEquals(cloneCount, 0);

    Deno.writeTextFileSync(join(root, "README.md"), "keep me\n");
    const conflictResult = fetchTemplate(root, "generic", { cloneRepository });
    assertEquals(conflictResult.ok, false);
    assertStringIncludes(
      conflictResult.error_message ?? "",
      "README.md already exists",
    );
    assertEquals(cloneCount, 0);
    assertEquals(readText(join(root, "README.md")), "keep me\n");
  } finally {
    cleanup(root);
  }
});

Deno.test("a freshly scaffolded wiki passes lint --strict and check --strict (#376)", () => {
  const root = tempRoot();
  try {
    const result = scaffoldWiki(root, {
      graph_context_wiki: "https://example.org/",
    });
    assertEquals(result.ok, true);
    assertEquals(isDirectory(join(root, "assets")), false);
    const entry = new URL("../src/wiki/cli.ts", import.meta.url).pathname
      .replace(/^\/([A-Za-z]:)/, "$1");
    for (const command of ["lint", "check"]) {
      const out = new Deno.Command(Deno.execPath(), {
        args: ["run", "--quiet", "--allow-all", entry, command, "--strict"],
        cwd: root,
        stdout: "piped",
        stderr: "piped",
      }).outputSync();
      const text = new TextDecoder().decode(out.stdout) +
        new TextDecoder().decode(out.stderr);
      assertEquals(out.code, 0, `${command} --strict:\n${text}`);
    }
  } finally {
    cleanup(root);
  }
});
