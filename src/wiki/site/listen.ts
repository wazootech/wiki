/** An HTTP server for a `Request` to `Response` handler, on `node:http`. */
import { Buffer } from "node:buffer";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import type { ConnectionInfo, SiteServer } from "./server.ts";

type Handler = (
  request: Request,
  info: ConnectionInfo,
) => Promise<Response>;

function requestOf(message: IncomingMessage, authority: string): Request {
  const headers = new Headers();
  for (let i = 0; i < message.rawHeaders.length; i += 2) {
    headers.append(message.rawHeaders[i]!, message.rawHeaders[i + 1]!);
  }
  const method = message.method ?? "GET";
  const url = new URL(
    message.url ?? "/",
    `http://${headers.get("host") ?? authority}`,
  );
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  const body = Readable.toWeb(message) as ReadableStream<Uint8Array>;
  return new Request(
    url,
    { method, headers, body, duplex: "half" } as RequestInit,
  );
}

/** listen starts serving and resolves once the port is bound. */
export function listen(
  handler: Handler,
  host: string,
  port: number,
): Promise<{ server: SiteServer; address: AddressInfo }> {
  const server = createServer(async (message, reply) => {
    try {
      const response = await handler(requestOf(message, `${host}:${port}`), {
        remoteAddr: { hostname: message.socket.remoteAddress ?? "" },
      });
      const body = Buffer.from(await response.arrayBuffer());
      reply.statusCode = response.status;
      for (const [name, value] of response.headers) {
        if (name !== "set-cookie") reply.setHeader(name, value);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.setHeader("set-cookie", cookies);
      reply.end(body);
    } catch (error) {
      console.error(error);
      if (!reply.headersSent) reply.statusCode = 500;
      reply.end("Internal Server Error");
    }
  });
  const finished = new Promise<void>((resolve) => server.on("close", resolve));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve({
        server: {
          finished,
          shutdown() {
            server.close();
            server.closeIdleConnections();
            return finished;
          },
        },
        address: server.address() as AddressInfo,
      });
    });
  });
}
