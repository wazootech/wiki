import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { dirname, resolve } from "@std/path";
import {
  createStaticSiteHandler,
  type StaticSiteHandlerHandle,
} from "../src/wiki/site/server.ts";

function writeFile(siteDir: string, path: string, content: string): string {
  const fullPath = resolve(siteDir, path);
  Deno.mkdirSync(dirname(fullPath), { recursive: true });
  Deno.writeTextFileSync(fullPath, content);
  return fullPath;
}

async function withHandler<T>(
  siteDir: string,
  options: Omit<
    Parameters<typeof createStaticSiteHandler>[0],
    "siteDir" | "port"
  >,
  test: (handle: StaticSiteHandlerHandle, base: string) => Promise<T>,
): Promise<T> {
  const handle = createStaticSiteHandler({ siteDir, ...options });
  try {
    return await test(handle, "http://preview.test");
  } finally {
    handle.close();
  }
}

function request(
  handle: StaticSiteHandlerHandle,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return handle.handleRequest(new Request(`http://preview.test${path}`, init));
}

Deno.test(
  "serves generated directory-style pages under the configured base URL",
  async () => {
    const siteDir = Deno.makeTempDirSync();
    writeFile(siteDir, "index.html", "<h1>Home</h1>");
    writeFile(siteDir, "guide/index.html", "<h1>Guide</h1>");
    try {
      await withHandler(
        siteDir,
        { baseUrl: "/preview", urlStyle: "dir" },
        async (handle) => {
          const home = await request(handle, "/preview/");
          assertEquals(home.status, 200);
          assertEquals(
            home.headers.get("content-type"),
            "text/html; charset=utf-8",
          );
          assertStringIncludes(await home.text(), "Home");

          const page = await request(handle, "/preview/guide");
          assertEquals(page.status, 200);
          assertStringIncludes(await page.text(), "Guide");
          assertEquals(
            (await request(handle, "/previewish/guide")).status,
            404,
          );
          assertEquals((await request(handle, "/missing/guide")).status, 404);
          assertEquals((await request(handle, "/preview/missing")).status, 404);
        },
      );
    } finally {
      Deno.removeSync(siteDir, { recursive: true });
    }
  },
);

Deno.test(
  "serves file-style pages and static assets with MIME types",
  async () => {
    const siteDir = Deno.makeTempDirSync();
    writeFile(siteDir, "index.html", "<h1>Home</h1>");
    writeFile(siteDir, "guide.html", "<h1>Guide</h1>");
    writeFile(siteDir, "assets/site.css", "body { color: black; }");
    try {
      await withHandler(
        siteDir,
        { baseUrl: "/preview", urlStyle: "file" },
        async (handle) => {
          assertStringIncludes(
            await (await request(handle, "/preview/guide.html")).text(),
            "Guide",
          );
          assertStringIncludes(
            await (await request(handle, "/preview/guide")).text(),
            "Guide",
          );
          const asset = await request(handle, "/preview/assets/site.css");
          assertEquals(asset.status, 200);
          assertEquals(
            asset.headers.get("content-type"),
            "text/css; charset=utf-8",
          );
          assertStringIncludes(await asset.text(), "color: black");
        },
      );
    } finally {
      Deno.removeSync(siteDir, { recursive: true });
    }
  },
);

Deno.test("supports root base URL, HEAD, and method rejection", async () => {
  const siteDir = Deno.makeTempDirSync();
  writeFile(siteDir, "index.html", "<h1>Root</h1>");
  try {
    await withHandler(siteDir, { baseUrl: "/" }, async (handle) => {
      const head = await request(handle, "/", { method: "HEAD" });
      assertEquals(head.status, 200);
      assertEquals(head.headers.get("content-length"), "13");
      assertEquals(await head.text(), "");
      const post = await request(handle, "/", { method: "POST" });
      assertEquals(post.status, 405);
      assertEquals(post.headers.get("allow"), "GET, HEAD");
    });
  } finally {
    Deno.removeSync(siteDir, { recursive: true });
  }
});

Deno.test(
  "serves the site root when the configured base URL is empty",
  async () => {
    const siteDir = Deno.makeTempDirSync();
    writeFile(siteDir, "index.html", "<h1>Root</h1>");
    try {
      await withHandler(siteDir, { baseUrl: "" }, async (handle) => {
        const response = await request(handle, "/");
        assertEquals(response.status, 200);
        assertStringIncludes(await response.text(), "Root");
        assertEquals((await request(handle, "/preview/")).status, 404);
      });
    } finally {
      Deno.removeSync(siteDir, { recursive: true });
    }
  },
);

Deno.test("rejects encoded path separators", async () => {
  const siteDir = Deno.makeTempDirSync();
  writeFile(siteDir, "index.html", "<h1>Safe</h1>");
  try {
    await withHandler(siteDir, { baseUrl: "/preview" }, async (handle) => {
      assertEquals((await request(handle, "/preview/a%2Fb")).status, 404);
    });
  } finally {
    Deno.removeSync(siteDir, { recursive: true });
  }
});

Deno.test(
  "does not follow symlinks outside the static site root",
  async () => {
    const siteDir = Deno.makeTempDirSync();
    const outsideDir = Deno.makeTempDirSync();
    writeFile(siteDir, "index.html", "<h1>Safe</h1>");
    writeFile(outsideDir, "secret.txt", "secret");
    Deno.symlinkSync(
      resolve(outsideDir, "secret.txt"),
      resolve(siteDir, "secret.txt"),
    );
    try {
      await withHandler(siteDir, { baseUrl: "/preview" }, async (handle) => {
        assertEquals(
          (await request(handle, "/preview/secret.txt")).status,
          404,
        );
      });
    } finally {
      Deno.removeSync(siteDir, { recursive: true });
      Deno.removeSync(outsideDir, { recursive: true });
    }
  },
);

Deno.test(
  "optional polling endpoint detects file changes and closes its poller",
  async () => {
    const siteDir = Deno.makeTempDirSync();
    writeFile(siteDir, "index.html", "<html><body>first</body></html>");
    const handle = createStaticSiteHandler({
      siteDir,
      baseUrl: "/preview",
      watch: true,
      pollIntervalMs: 10,
    });
    try {
      const before = await request(handle, "/preview/__watch");
      assertEquals((await before.json()).build, 0);
      const html = await request(handle, "/preview/");
      assertStringIncludes(await html.text(), 'fetch("/preview/__watch"');

      writeFile(
        siteDir,
        "index.html",
        "<html><body>updated content</body></html>",
      );
      let build = 0;
      for (let attempt = 0; attempt < 50 && build === 0; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const response = await request(handle, "/preview/__watch");
        build = (await response.json()).build;
      }
      assert(build > 0);
    } finally {
      handle.close();
      Deno.removeSync(siteDir, { recursive: true });
    }
  },
);

Deno.test("rejects invalid base URLs, URL styles, hosts, and ports", () => {
  const siteDir = Deno.makeTempDirSync();
  try {
    assertThrows(() =>
      createStaticSiteHandler({ siteDir, baseUrl: "https://example.com" })
    );
    assertThrows(() => createStaticSiteHandler({ siteDir, port: 65_536 }));
    assertThrows(() => createStaticSiteHandler({ siteDir, host: " " }));
    assertThrows(() =>
      createStaticSiteHandler({ siteDir, urlStyle: "other" as never })
    );
  } finally {
    Deno.removeSync(siteDir, { recursive: true });
  }
});
