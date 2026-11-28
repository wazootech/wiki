import { listen } from "../src/wiki/site/listen.ts";
import { test } from "node:test";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { createCloudflareAccessProvider } from "../src/wiki/auth/cloudflare.ts";
import type { AccessJwk } from "../src/wiki/auth/cloudflare_jwks.ts";
import type { AuthContext } from "../src/wiki/auth/types.ts";
import type { AuthBlock } from "../src/wiki/config.ts";

const CONFIG: AuthBlock = {
  enabled: true,
  provider: "cloudflare-access",
  session_ttl_seconds: 3600,
  cookie_name: "wiki_session",
  users_file: null,
  session_file: null,
  team_domain: "example",
  audience: "32eafc7626e974616deaf0dc3ce63d7bcbed58a2731e84d06bc3cdf1b53c4228",
};

const URL_OBJECT = new URL("https://wiki.example.org/");

const CONTEXT: AuthContext = {
  config: CONFIG,
  baseUrl: "/wiki",
  sessionStore: {
    create: () => Promise.resolve(""),
    get: () => Promise.resolve(null),
    delete: () => Promise.resolve(),
    close: () => {},
  },
  loginPath: "/auth/login",
  logoutPath: "/auth/logout",
};

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function signJwt(
  privateKey: CryptoKey,
  payload: Record<string, unknown>,
  kid = "test-key",
): Promise<string> {
  const header = encodeJson({ alg: "RS256", typ: "JWT", kid });
  const body = encodeJson(payload);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  );
  return `${header}.${body}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function generateKeys(): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  if (!("privateKey" in pair)) throw new Error("Expected a key pair");
  return pair;
}

async function jwkFor(
  publicKey: CryptoKey,
  kid = "test-key",
): Promise<AccessJwk> {
  const exported = await crypto.subtle.exportKey("jwk", publicKey);
  return { ...exported, kid, alg: "RS256", use: "sig" };
}

function claims(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "https://example.cloudflareaccess.com",
    aud: [CONFIG.audience],
    exp: now + 300,
    nbf: now,
    email: "alice@example.com",
    ...overrides,
  };
}

interface TestServer {
  readonly jwksUrl: string;
  fetches(): number;
  close(): Promise<void>;
}

/** Serves `keys` as it is at request time, so a test can rotate it. */
async function startJwksServer(...keys: AccessJwk[]): Promise<TestServer> {
  return await serveKeys(keys);
}

async function serveKeys(keys: AccessJwk[]): Promise<TestServer> {
  let fetches = 0;
  const { server, address } = await listen(
    () => {
      fetches += 1;
      return Promise.resolve(Response.json({ keys }));
    },
    "127.0.0.1",
    0,
  );
  return {
    jwksUrl: `http://127.0.0.1:${address.port}/certs`,
    fetches: () => fetches,
    close: () => server.shutdown(),
  };
}

async function identityFor(jwksUrl: string, assertion: string) {
  const provider = await createCloudflareAccessProvider(CONFIG, jwksUrl);
  const request = new Request("https://wiki.example.org/", {
    headers: { "Cf-Access-Jwt-Assertion": assertion },
  });
  return await provider.identity(request, URL_OBJECT, CONTEXT);
}

test("cloudflare-access accepts a valid assertion", async () => {
  const keys = await generateKeys();
  const server = await startJwksServer(await jwkFor(keys.publicKey));
  try {
    const assertion = await signJwt(keys.privateKey, claims({ name: "Alice" }));
    const identity = await identityFor(server.jwksUrl, assertion);
    assertEquals(identity, { id: "alice@example.com", name: "Alice" });
  } finally {
    await server.close();
  }
});

test("cloudflare-access rejects a wrong audience", async () => {
  const keys = await generateKeys();
  const server = await startJwksServer(await jwkFor(keys.publicKey));
  try {
    const assertion = await signJwt(
      keys.privateKey,
      claims({ aud: ["another-application"] }),
    );
    const identity = await identityFor(server.jwksUrl, assertion);
    assertEquals(identity, null);
  } finally {
    await server.close();
  }
});

test("cloudflare-access has no local endpoints and a plain challenge", async () => {
  const provider = await createCloudflareAccessProvider(
    CONFIG,
    "http://127.0.0.1:1/certs",
  );
  assertEquals(provider.id, "cloudflare-access");
  assertEquals(
    await provider.handle(
      new Request("https://wiki.example.org/auth/login"),
      URL_OBJECT,
      CONTEXT,
    ),
    null,
  );
  const response = await provider.challenge(
    new Request("https://wiki.example.org/"),
    URL_OBJECT,
    CONTEXT,
  );
  assertEquals(response.status, 401);
  assertEquals(response.headers.get("location"), null);
  assertStringIncludes(await response.text(), "Cloudflare Access");
});

test("cloudflare-access checks issuer, expiry, and not-before", async () => {
  const keys = await generateKeys();
  const server = await startJwksServer(await jwkFor(keys.publicKey));
  const now = Math.floor(Date.now() / 1000);
  const identityWith = async (overrides: Record<string, unknown>) =>
    await identityFor(
      server.jwksUrl,
      await signJwt(keys.privateKey, claims(overrides)),
    );
  try {
    for (const rejected of [
      { iss: "https://other.cloudflareaccess.com" },
      { iss: undefined },
      { exp: now - 1 },
      { nbf: now + 600 },
      { nbf: "now" },
    ])
      assertEquals(await identityWith(rejected), null);
    // Slight clock skew passes, and `nbf` is optional.
    for (const accepted of [{ nbf: now + 30 }, { nbf: undefined }]) {
      assertEquals(await identityWith(accepted), { id: "alice@example.com" });
    }
  } finally {
    await server.close();
  }
});

test("cloudflare-access identifies a service token", async () => {
  const keys = await generateKeys();
  const server = await startJwksServer(await jwkFor(keys.publicKey));
  try {
    const assertion = await signJwt(
      keys.privateKey,
      claims({ email: undefined, sub: "", common_name: "robot.access" }),
    );
    assertEquals(await identityFor(server.jwksUrl, assertion), {
      id: "robot.access",
    });
  } finally {
    await server.close();
  }
});

test("cloudflare-access refreshes once for a rotated key", async () => {
  const first = await generateKeys();
  const second = await generateKeys();
  const published = [await jwkFor(first.publicKey, "first")];
  const server = await serveKeys(published);
  try {
    const identityWith = async (key: CryptoKey, kid: string) =>
      await identityFor(server.jwksUrl, await signJwt(key, claims(), kid));
    const alice = { id: "alice@example.com" };

    assertEquals(await identityWith(first.privateKey, "first"), alice);
    published.push(await jwkFor(second.publicKey, "second"));
    assertEquals(
      await Promise.all([
        identityWith(second.privateKey, "second"),
        identityWith(second.privateKey, "second"),
      ]),
      [alice, alice],
    );
    assertEquals(server.fetches(), 2);

    // Further unknown key IDs wait out the cooldown instead of refetching.
    assertEquals(await identityWith(second.privateKey, "forged"), null);
    assertEquals(server.fetches(), 2);
  } finally {
    await server.close();
  }
});
