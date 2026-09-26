import { basename, dirname, join } from "@std/path";
import { isDirectory, pathExists, readText } from "../src/wiki/fspath.ts";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { parse as parseYaml } from "@std/yaml";
import { Config } from "../src/wiki/config.ts";

import {
  detectOriginRepo,
  fetchTemplate,
  inferGithubPagesUrls,
  type InitOptions,
  mapInitOptionsToConfig,
  normalizeBaseUrl,
  parseGithubRepo,
  renderWikiYaml,
  resolveInitOptions,
  scaffoldWiki,
} from "../src/wiki/init_scaffold.ts";

function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-init-scaffold-" });
}

function cleanup(root: string): void {
  Deno.removeSync(root, { recursive: true });
}

Deno.test("GitHub repository parsing and Pages URL inference cover shorthand and URL forms", () => {
  assertEquals(parseGithubRepo("wazootech/wiki"), ["wazootech", "wiki"]);
  assertEquals(
    parseGithubRepo("https://github.com/wazootech/wiki.git"),
    ["wazootech", "wiki"],
  );
  assertEquals(
    parseGithubRepo("git@github.com:wazootech/wiki.git"),
    ["wazootech", "wiki"],
  );
  assertEquals(
    inferGithubPagesUrls("wazootech", "wiki"),
    ["https://wazootech.github.io/wiki/", "/wiki"],
  );
  assertEquals(normalizeBaseUrl("manual///"), "/manual");
});

Deno.test("resolveInitOptions uses non-interactive defaults and maps explicit overrides", () => {
  const root = tempRoot();
  try {
    const defaults = resolveInitOptions({ cwd: root });
    assertEquals(defaults.graph_context_wiki, "https://wiki.example.org/");
    assertEquals(defaults.site_base_url, "/wiki");
    assertEquals(defaults.site_url_style, "dir");

    const explicit = resolveInitOptions({
      cwd: root,
      repo: "wazootech/wiki",
      graph_context_wiki: "https://example.org/manual",
      site_base_url: "manual/",
      site_url_style: " FILE ",
      graph_include_file_extension: false,
    });
    assertEquals(explicit.graph_context_wiki, "https://example.org/manual/");
    assertEquals(explicit.site_base_url, "/manual");
    assertEquals(explicit.site_url_style, "file");
    assertEquals(explicit.graph_include_file_extension, false);
  } finally {
    cleanup(root);
  }
});

Deno.test("detectOriginRepo reads a local origin and resolver infers Pages defaults", () => {
  const root = tempRoot();
  try {
    const init = new Deno.Command("git", {
      args: ["init"],
      cwd: root,
      stdout: "null",
      stderr: "null",
    }).outputSync();
    assertEquals(init.code, 0);
    const remote = new Deno.Command("git", {
      args: ["remote", "add", "origin", "git@github.com:wazootech/wiki.git"],
      cwd: root,
      stdout: "null",
      stderr: "null",
    }).outputSync();
    assertEquals(remote.code, 0);

    assertEquals(detectOriginRepo(root), "wazootech/wiki");
    const options = resolveInitOptions({ cwd: root });
    assertEquals(
      options.graph_context_wiki,
      "https://wazootech.github.io/wiki/",
    );
    assertEquals(options.site_base_url, "/wiki");
  } finally {
    cleanup(root);
  }
});

Deno.test("init option mapping preserves all supported nested config values", () => {
  const options: InitOptions = {
    graph_context_wiki: "https://wiki.example.org/",
    site_base_url: "/manual",
    site_url_style: "file",
    site_layout: "layouts/default.html",
    graph_content_predicate: "schema:articleBody",
    link_style: "wikilink",
    wiki_inputs: ["wiki", "archive"],
    graph_base_iri: "https://data.example.org/",
    graph_implicit_types: ["schema:TechArticle", "schema:WebPage"],
    graph_implicit_types_policy: "append",
    graph_include_file_extension: false,
    template: "ignored-init-only-option",
  };
  assertEquals(mapInitOptionsToConfig(options), {
    graph: {
      context: { wiki: "https://wiki.example.org/" },
      content_predicate: "schema:articleBody",
      base_iri: "https://data.example.org/",
      implicit_types: ["schema:TechArticle", "schema:WebPage"],
      implicit_types_policy: "append",
      include_file_extension: false,
    },
    site: {
      base_url: "/manual",
      url_style: "file",
      layout: "layouts/default.html",
    },
    link: { style: "wikilink" },
    wiki: { input: ["wiki", "archive"] },
  });
});

Deno.test("renderWikiYaml safely emits option values and parses as YAML", () => {
  const options: InitOptions = {
    graph_context_wiki: 'https://example.org/wiki/?q="quoted"',
    site_base_url: "/manual",
    site_url_style: "file",
    site_layout: "layouts/default.html",
    graph_content_predicate: "schema:articleBody",
    link_style: "standard",
    wiki_inputs: ["wiki", "content: #1"],
    graph_base_iri: "https://example.org/data/",
    graph_implicit_types: ["schema:TechArticle"],
    graph_implicit_types_policy: "append",
    graph_include_file_extension: false,
  };
  const rendered = renderWikiYaml(options);
  const parsed = parseYaml(rendered) as Record<string, Record<string, unknown>>;
  const graph = parsed.graph as Record<string, unknown>;
  const context = graph.context as Record<string, unknown>;
  assertEquals(context.wiki, options.graph_context_wiki);
  assertEquals(graph.content_predicate, options.graph_content_predicate);
  assertEquals(graph.include_file_extension, false);
  assertEquals(graph.implicit_types, ["schema:TechArticle"]);
  assertEquals(parsed.site?.layout, "layouts/default.html");
  assertEquals(parsed.wiki?.input, ["wiki", "content: #1"]);
  assertStringIncludes(rendered, "missing_layout_file: error");
  assertStringIncludes(rendered, 'wrap: "no"');

  const root = tempRoot();
  try {
    Deno.writeTextFileSync(join(root, "wiki.yml"), rendered);
    const config = Config.load(join(root, "wiki.yml"));
    assertEquals(config.site.url_style, "file");
    assertEquals(config.site.base_url, "/manual");
    assertEquals(config.link.style, "standard");
    assertEquals(config.graph.content_predicate, "schema:articleBody");
    assertEquals(config.graph.include_file_extension, false);
    assertEquals(config.graph.implicit_types, ["schema:TechArticle"]);
    assertEquals(config.wiki.input.map((path) => basename(path)), [
      "wiki",
      "content: #1",
    ]);
  } finally {
    cleanup(root);
  }
});

Deno.test("scaffold writes the starter files while preserving an existing gitignore", () => {
  const root = tempRoot();
  try {
    const gitignore = join(root, ".gitignore");
    Deno.writeTextFileSync(gitignore, "# custom ignore\n.env\n");
    const result = scaffoldWiki(root, {
      graph_context_wiki: "https://example.org/wiki/",
      site_base_url: "/manual",
    });

    assertEquals(result.ok, true);
    assertEquals(
      result.config_path,
      join(root, "wiki.yml"),
    );
    assertEquals(
      result.written_paths.map((path) => basename(path)),
      ["README.md", "wiki", "wiki.yml"],
    );
    assertEquals(readText(gitignore), "# custom ignore\n.env\n");
    assertEquals(isDirectory(join(root, "wiki")), true);
    assertStringIncludes(readText(join(root, "README.md")), "# My Wiki");
    assertStringIncludes(readText(gitignore), ".env");
    const parsed = parseYaml(readText(join(root, "wiki.yml"))) as Record<
      string,
      unknown
    >;
    const graph = parsed.graph as Record<string, unknown>;
    const context = graph.context as Record<string, unknown>;
    assertEquals(context.wiki, "https://example.org/wiki/");
    assertEquals(
      Config.load(join(root, "wiki.yml")).graph.context?.wiki,
      "https://example.org/wiki/",
    );
  } finally {
    cleanup(root);
  }
});

Deno.test("scaffold refuses existing configs, README files, and nonempty wiki directories without overwriting", () => {
  const configRoot = tempRoot();
  const readmeRoot = tempRoot();
  const wikiRoot = tempRoot();
  try {
    const config = join(configRoot, "wiki.toml");
    Deno.writeTextFileSync(config, "existing config\n");
    const configResult = scaffoldWiki(configRoot, {
      graph_context_wiki: "https://example.org/",
    });
    assertEquals(configResult.ok, false);
    assertStringIncludes(configResult.error_message ?? "", "already exists");
    assertEquals(readText(config), "existing config\n");
    assertEquals(pathExists(join(readmeRoot, "README.md")), false);

    const readme = join(readmeRoot, "README.md");
    Deno.writeTextFileSync(readme, "keep me\n");
    const readmeResult = scaffoldWiki(readmeRoot, {
      graph_context_wiki: "https://example.org/",
    });
    assertEquals(readmeResult.ok, false);
    assertStringIncludes(
      readmeResult.error_message ?? "",
      "README.md already exists",
    );
    assertEquals(readText(readme), "keep me\n");
    assertEquals(pathExists(join(readmeRoot, "wiki.yml")), false);

    const page = join(wikiRoot, "wiki", "Keep.md");
    Deno.mkdirSync(dirname(page), { recursive: true });
    Deno.writeTextFileSync(page, "# Keep\n");
    const wikiResult = scaffoldWiki(wikiRoot, {
      graph_context_wiki: "https://example.org/",
    });
    assertEquals(wikiResult.ok, false);
    assertStringIncludes(wikiResult.error_message ?? "", "wiki/ is not empty");
    assertEquals(readText(page), "# Keep\n");
    assertEquals(pathExists(join(wikiRoot, "README.md")), false);
  } finally {
    cleanup(configRoot);
    cleanup(readmeRoot);
    cleanup(wikiRoot);
  }
});

Deno.test("scaffold creates a default gitignore and reports every created path", () => {
  const root = tempRoot();
  try {
    const result = scaffoldWiki(root, {
      graph_context_wiki: "https://example.org/",
    });

    assertEquals(result.ok, true);
    assertEquals(result.written_paths.map((path) => basename(path)), [
      ".gitignore",
      "README.md",
      "wiki",
      "wiki.yml",
    ]);
    assertStringIncludes(readText(join(root, ".gitignore")), ".wiki/");
    assertStringIncludes(readText(join(root, ".gitignore")), "_site/");
  } finally {
    cleanup(root);
  }
});

Deno.test("render failure rolls back created files but preserves a pre-existing empty wiki directory", () => {
  const root = tempRoot();
  const wikiDirectory = join(root, "wiki");
  try {
    Deno.mkdirSync(wikiDirectory);
    const result = scaffoldWiki(root, {
      graph_context_wiki: "https://example.org/",
      site_url_style: "invalid",
    });

    assertEquals(result.ok, false);
    assertStringIncludes(result.error_message ?? "", "Invalid site_url_style");
    assertEquals(isDirectory(wikiDirectory), true);
    assertEquals([...Deno.readDirSync(wikiDirectory)].length, 0);
    assertEquals(pathExists(join(root, ".gitignore")), false);
    assertEquals(pathExists(join(root, "README.md")), false);
    assertEquals(pathExists(join(root, "wiki.yml")), false);
  } finally {
    cleanup(root);
  }
});

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
        const template = join(destination, "generic");
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
