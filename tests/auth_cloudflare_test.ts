import { assertEquals, assertStringIncludes } from "@std/assert";
import { createCloudflareAccessProvider } from "../src/wiki/auth/cloudflare.ts";
import type { AccessJwk } from "../src/wiki/auth/cloudflare_jwt.ts";
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
  audience: "https://wiki.example.org",
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
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function signJwt(
  privateKey: CryptoKey,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = encodeJson({ alg: "RS256", typ: "JWT", kid: "test-key" });
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

async function jwkFor(publicKey: CryptoKey): Promise<AccessJwk> {
  const exported = await crypto.subtle.exportKey("jwk", publicKey);
  return { ...exported, kid: "test-key", alg: "RS256", use: "sig" };
}

interface TestServer {
  readonly jwksUrl: string;
  close(): Promise<void>;
}

async function startJwksServer(jwk: AccessJwk): Promise<TestServer> {
  const abort = new AbortController();
  let resolveUrl: (url: string) => void = () => {};
  const ready = new Promise<string>((resolve) => {
    resolveUrl = resolve;
  });
  const server = Deno.serve({
    hostname: "127.0.0.1",
    port: 0,
    signal: abort.signal,
    onListen: ({ port }) => resolveUrl(`http://127.0.0.1:${port}/certs`),
  }, () => Response.json({ keys: [jwk] }));
  const jwksUrl = await ready;
  return {
    jwksUrl,
    async close() {
      abort.abort();
      await server.finished;
    },
  };
}

async function identityFor(
  jwksUrl: string,
  assertion: string,
) {
  const provider = await createCloudflareAccessProvider(CONFIG, jwksUrl);
  const request = new Request("https://wiki.example.org/", {
    headers: { "Cf-Access-Jwt-Assertion": assertion },
  });
  return await provider.identity(request, URL_OBJECT, CONTEXT);
}

Deno.test("cloudflare-access accepts a valid assertion", async () => {
  const keys = await generateKeys();
  const server = await startJwksServer(await jwkFor(keys.publicKey));
  try {
    const assertion = await signJwt(keys.privateKey, {
      aud: [CONFIG.audience],
      exp: Math.floor(Date.now() / 1000) + 300,
      email: "alice@example.com",
      name: "Alice",
    });
    const identity = await identityFor(server.jwksUrl, assertion);
    assertEquals(identity, { id: "alice@example.com", name: "Alice" });
  } finally {
    await server.close();
  }
});

Deno.test("cloudflare-access rejects a wrong audience", async () => {
  const keys = await generateKeys();
  const server = await startJwksServer(await jwkFor(keys.publicKey));
  try {
    const assertion = await signJwt(keys.privateKey, {
      aud: ["https://other.example.org"],
      exp: Math.floor(Date.now() / 1000) + 300,
      email: "alice@example.com",
    });
    const identity = await identityFor(server.jwksUrl, assertion);
    assertEquals(identity, null);
  } finally {
    await server.close();
  }
});

Deno.test("cloudflare-access has no local endpoints and a plain challenge", async () => {
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
