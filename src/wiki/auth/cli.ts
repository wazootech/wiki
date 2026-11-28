/** CLI surface for password hashing and the standalone auth gateway. */

import * as sys from "../sys.ts";
import { join, resolve } from "@std/path";
import { errorText } from "../errors.ts";
import { startStaticSiteServer } from "../site/server.ts";
import type { Wiki } from "../wiki.ts";
import {
  AUTH_EXIT_OK,
  AUTH_EXIT_USAGE,
  AUTH_HELP_LINES,
  authUsageError,
  HASH_HELP_LINES,
  parseServeOptions,
} from "./cli_options.ts";
import { createAuthHandler } from "./handler.ts";
import { hashPassword } from "./local_users.ts";

export async function runAuthHashCommand(
  args: readonly string[],
): Promise<number> {
  if (args[0] === "--help" || args[0] === "-h") {
    console.log(HASH_HELP_LINES.join("\n"));
    return AUTH_EXIT_OK;
  }
  const password = args[0];
  if (password === undefined) {
    return authUsageError("Error: Password required.");
  }
  if (args.length > 1) return authUsageError("Error: Too many arguments.");
  try {
    console.log(await hashPassword(password));
    return AUTH_EXIT_OK;
  } catch (error) {
    return authUsageError(`Error: ${errorText(error)}`);
  }
}

export async function runAuthServeCommand(
  wiki: Wiki,
  args: readonly string[],
): Promise<number> {
  const parsed = parseServeOptions(args);
  if (typeof parsed === "number") return parsed;
  if (!wiki.config.site.auth.enabled) {
    return authUsageError(
      "Error: site.auth.enabled must be true to use `wiki auth serve`.",
    );
  }

  const baseUrl = parsed.baseUrl ?? wiki.config.site.base_url;
  const urlStyle = parsed.urlStyle ??
    wiki.config.site.url_style as "dir" | "file";
  const siteDir = resolve(
    parsed.siteDir ?? join(wiki.config.config_root, "_site"),
  );
  const auth = await createAuthHandler(wiki.config.site.auth, baseUrl);
  let server: Awaited<ReturnType<typeof startStaticSiteServer>> | null = null;
  try {
    server = await startStaticSiteServer({
      siteDir,
      host: parsed.host,
      port: parsed.port,
      baseUrl,
      urlStyle,
      responseHeaders: auth.responseHeaders,
      requestHandler: (request, peer) => auth.handle(request, peer),
    });
    console.log(`Auth-gated wiki ready at ${server.url}`);
    console.log("Press Ctrl+C to stop.");
    const onInterrupt = () => void server?.close();
    sys.addSignalListener("SIGINT", onInterrupt);
    try {
      await server.server.finished;
    } finally {
      sys.removeSignalListener("SIGINT", onInterrupt);
    }
    return AUTH_EXIT_OK;
  } catch (error) {
    return authUsageError(`Error: ${errorText(error)}`);
  } finally {
    auth.close();
    await server?.close();
  }
}

export async function runAuthCommand(
  args: readonly string[],
  wikiLoader: () => Promise<Wiki | number>,
): Promise<number> {
  const command = args[0];
  if (command === "--help" || command === "-h" || command === undefined) {
    console.log(AUTH_HELP_LINES.join("\n"));
    return command === undefined ? AUTH_EXIT_USAGE : AUTH_EXIT_OK;
  }
  if (command === "hash") return await runAuthHashCommand(args.slice(1));
  if (command === "serve") {
    const wiki = await wikiLoader();
    if (typeof wiki === "number") return wiki;
    return await runAuthServeCommand(wiki, args.slice(1));
  }
  return authUsageError(`Error: No such auth command '${command}'.`);
}
