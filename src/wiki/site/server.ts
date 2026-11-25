/**
 * Static HTTP preview server for an already-built Wiki site.
 *
 * `siteDir` is the directory containing the generated site root (including
 * `index.html`). `baseUrl` mounts that directory at a URL prefix; it does not
 * name a subdirectory inside `siteDir`.
 */

import type {
  StaticSiteServerHandle,
  StaticSiteServerOptions,
} from "./server/types.ts";
import { createStaticSiteHandler } from "./server/handler.ts";

export {
  type StaticSiteHandlerHandle,
  type StaticSiteServerHandle,
  type StaticSiteServerOptions,
  type StaticUrlStyle,
} from "./server/types.ts";
export { createStaticSiteHandler } from "./server/handler.ts";

export function startStaticSiteServer(
  options: StaticSiteServerOptions,
): StaticSiteServerHandle {
  const preview = createStaticSiteHandler(options);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8080;
  const server = Deno.serve(
    { hostname: host, port, onListen: () => {} },
    preview.handleRequest,
  );
  const address = server.addr;
  const hostname = address.hostname.includes(":")
    ? `[${address.hostname}]`
    : address.hostname;
  const url = `http://${hostname}:${address.port}`;
  let closePromise: Promise<void> | undefined;
  return {
    server,
    url,
    close() {
      if (closePromise === undefined) {
        preview.close();
        closePromise = server.shutdown();
      }
      return closePromise;
    },
  };
}
