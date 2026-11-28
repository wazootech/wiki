import * as sys from "../src/wiki/sys.ts";
import { Buffer } from "node:buffer";
import { connect } from "node:net";
import { test } from "node:test";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { listen } from "../src/wiki/site/listen.ts";

/** Sends raw bytes, so no client rewrites the request target first. */
function exchange(port: number, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => socket.write(request));
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString()));
    socket.on("error", reject);
  });
}

async function ask(line: string): Promise<string> {
  const { server, address } = await listen(
    (request) => Promise.resolve(new Response(`[${request.url}]`)),
    "127.0.0.1",
    0,
  );
  try {
    return await exchange(
      address.port,
      `${line} HTTP/1.1\r\nHost: preview.test\r\nConnection: close\r\n\r\n`,
    );
  } finally {
    await server.shutdown();
  }
}

test("a path starting with two slashes does not replace the host", async () => {
  assertStringIncludes(
    await ask("GET //other.test/page"),
    "[http://preview.test//other.test/page]",
  );
});

test("a backslash after the slash does not replace the host", async () => {
  assertStringIncludes(
    await ask("GET /\\other.test/page"),
    "[http://preview.test//other.test/page]",
  );
});

test("TRACE is refused without reaching the handler", async () => {
  const reply = await ask("TRACE /");
  assertStringIncludes(reply, "405");
  assert(!reply.includes("[http"));
});

test("an aborted command resolves as a failed run", async () => {
  const output = await new sys.Command(sys.execPath(), {
    args: [sys.version.deno ? "eval" : "-e", "setTimeout(() => {}, 20000)"],
    signal: AbortSignal.timeout(300),
  }).output();
  assertEquals(output.success, false);
});
