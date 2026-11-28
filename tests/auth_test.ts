import * as sys from "../src/wiki/sys.ts";
import { test } from "node:test";
import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { dirname, join } from "@std/path";
import { Config } from "../src/wiki/config.ts";
import { createAuthHandler } from "../src/wiki/auth/handler.ts";
import { hashPassword } from "../src/wiki/auth/local_users.ts";
import { isSecure, safeNext } from "../src/wiki/auth/http.ts";
import { clientKey } from "../src/wiki/auth/rate_limit.ts";
import { createStaticSiteHandler } from "../src/wiki/site/server.ts";

function tempRoot(): string {
  return sys.makeTempDirSync({ prefix: "wiki-auth-" });
}

function write(root: string, relative: string, content: string): string {
  const path = join(root, ...relative.split("/"));
  sys.mkdirSync(dirname(path), { recursive: true });
  sys.writeTextFileSync(path, content);
  return path;
}

function cookieValue(setCookie: string | null, name: string): string {
  if (setCookie === null) throw new Error("Missing set-cookie header");
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  if (match === null) throw new Error(`Missing cookie ${name}`);
  return decodeURIComponent(match[1]!);
}

test("site.auth defaults to disabled with safe defaults", () => {
  const config = Config.forRoot(tempRoot());
  assertEquals(config.site.auth.enabled, false);
  assertEquals(config.site.auth.provider, "local");
  assertEquals(config.site.auth.session_ttl_seconds, 604800);
  assertEquals(config.site.auth.cookie_name, "wiki_session");
});

test("site.auth resolves paths and rejects an unknown provider", () => {
  const root = tempRoot();
  try {
    write(root, "users.json", "[]");
    const config = Config.forRoot(root, {
      site: {
        auth: {
          enabled: true,
          provider: "local",
          users_file: "users.json",
          session_file: "sessions.json",
        },
      },
    });
    assertEquals(config.site.auth.users_file, join(root, "users.json"));
    assertEquals(config.site.auth.session_file, join(root, "sessions.json"));

    assertThrows(
      () =>
        Config.forRoot(root, {
          site: { auth: { enabled: true, provider: "magic" } },
        }),
      Error,
      "provider",
    );
  } finally {
    sys.removeSync(root, { recursive: true });
  }
});

test("local auth gates the whole site until sign-in", async () => {
  const root = tempRoot();
  try {
    const hash = await hashPassword("correct horse battery");
    write(root, "users.json", JSON.stringify([{ username: "ethan", hash }]));
    write(root, "site/index.html", "<h1>Private wiki</h1>");
    const config = Config.forRoot(root, {
      site: {
        auth: {
          enabled: true,
          provider: "local",
          users_file: "users.json",
          session_file: "sessions.json",
        },
      },
    });
    const auth = await createAuthHandler(config.site.auth, "");
    const preview = createStaticSiteHandler({
      siteDir: join(root, "site"),
      baseUrl: "",
      requestHandler: (request) => auth.handle(request),
      responseHeaders: auth.responseHeaders,
    });
    try {
      const challenge = await preview.handleRequest(
        new Request("http://localhost/"),
      );
      assertEquals(challenge.status, 302);
      assertEquals(challenge.headers.get("location"), "/auth/login?next=%2F");
      assertEquals(
        challenge.headers.get("cache-control"),
        "private, no-store",
      );

      const login = await preview.handleRequest(
        new Request("http://localhost/auth/login"),
      );
      assertEquals(login.status, 200);
      const csrf = cookieValue(
        login.headers.get("set-cookie"),
        "wiki_session_csrf",
      );

      const form = new FormData();
      form.set("csrf", csrf);
      form.set("next", "/");
      form.set("username", "ethan");
      form.set("password", "correct horse battery");
      const signedIn = await preview.handleRequest(
        new Request("http://localhost/auth/login", {
          method: "POST",
          body: form,
          headers: { cookie: `wiki_session_csrf=${csrf}` },
        }),
      );
      assertEquals(signedIn.status, 303);
      const session = cookieValue(
        signedIn.headers.get("set-cookie"),
        "wiki_session",
      );

      const page = await preview.handleRequest(
        new Request("http://localhost/", {
          headers: { cookie: `wiki_session=${session}` },
        }),
      );
      assertEquals(page.status, 200);
      assertStringIncludes(await page.text(), "Private wiki");
      assertEquals(page.headers.get("cache-control"), "private, no-store");

      const logoutForm = new FormData();
      logoutForm.set("csrf", csrf);
      const signedOut = await preview.handleRequest(
        new Request("http://localhost/auth/logout", {
          method: "POST",
          body: logoutForm,
          headers: {
            cookie: `wiki_session=${session}; wiki_session_csrf=${csrf}`,
          },
        }),
      );
      assertEquals(signedOut.status, 200);
      assert(sys.statSync(join(root, "sessions.json")).isFile);

      const blocked = await preview.handleRequest(
        new Request("http://localhost/", {
          headers: { cookie: `wiki_session=${session}` },
        }),
      );
      assertEquals(blocked.status, 302);
    } finally {
      preview.close();
      auth.close();
    }
  } finally {
    sys.removeSync(root, { recursive: true });
  }
});

test("safeNext rejects redirects that leave the site", () => {
  for (
    const hostile of [
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "https://evil.example",
    ]
  ) assertEquals(safeNext(hostile, ""), "/");
  assertEquals(safeNext("/notes?q=1", ""), "/notes?q=1");
});

test("isSecure honours TLS terminated by a proxy", () => {
  const url = new URL("http://wiki.example.org/");
  const proxied = new Request(url, {
    headers: { "x-forwarded-proto": "https" },
  });
  assertEquals(isSecure(proxied, url), true);
  assertEquals(isSecure(new Request(url), url), false);
});

test("clientKey trusts forwarded addresses only from loopback", () => {
  const request = new Request("http://localhost/", {
    headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.7" },
  });
  assertEquals(clientKey(request, "192.0.2.4"), "192.0.2.4");
  assertEquals(clientKey(request, "127.0.0.1"), "203.0.113.7");
  assertEquals(clientKey(request, "::1"), "203.0.113.7");
  assertEquals(clientKey(request), "local");
});

test("local sign-in keeps the CSRF cookie and limits parallel guesses", async () => {
  const root = tempRoot();
  try {
    const hash = await hashPassword("correct horse battery");
    write(root, "users.json", JSON.stringify([{ username: "ethan", hash }]));
    const config = Config.forRoot(root, {
      site: { auth: { enabled: true, users_file: "users.json" } },
    });
    const auth = await createAuthHandler(config.site.auth, "");
    try {
      const login = "http://localhost/auth/login";
      const headers = { cookie: "wiki_session_csrf=kept" };
      const page = await auth.handle(new Request(login, { headers }));
      assertEquals(page!.headers.get("set-cookie"), null);
      assertStringIncludes(await page!.text(), 'value="kept"');

      const guess = (index: number) => {
        const body = new FormData();
        body.set("csrf", "kept");
        body.set("username", "ethan");
        body.set("password", "wrong password");
        const request = new Request(login, {
          method: "POST",
          body,
          // A direct client cannot dodge the limit by varying this header.
          headers: { ...headers, "x-forwarded-for": `198.51.100.${index}` },
        });
        return auth.handle(request, "192.0.2.200");
      };
      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, index) => guess(index)),
      );
      const statuses = responses.map((response) => response!.status).sort();
      assertEquals(statuses, [401, 401, 401, 401, 401, 429, 429, 429]);
    } finally {
      auth.close();
    }
  } finally {
    sys.removeSync(root, { recursive: true });
  }
});
