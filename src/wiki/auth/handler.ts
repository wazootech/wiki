/** Compose auth providers into one request gate for a whole wiki site. */

import type { AuthBlock } from "../config.ts";
import { createCloudflareAccessProvider } from "./cloudflare.ts";
import { htmlResponse, isAuthPath, withNoStore } from "./http.ts";
import { createLocalProvider } from "./local.ts";
import { openSessionStore } from "./session.ts";
import type { AuthContext, AuthProvider, SessionStore } from "./types.ts";

export interface AuthHandlerHandle {
  readonly enabled: boolean;
  readonly responseHeaders: Readonly<Record<string, string>>;
  handle(request: Request): Promise<Response | null>;
  close(): void;
}

const PUBLIC_HEALTH_PATH = "/auth/health";

export async function createAuthHandler(
  config: AuthBlock,
  baseUrl: string,
): Promise<AuthHandlerHandle> {
  if (!config.enabled) {
    return {
      enabled: false,
      responseHeaders: {},
      handle: () => Promise.resolve(null),
      close: () => {},
    };
  }

  let provider: AuthProvider;
  switch (config.provider) {
    case "local":
      provider = await createLocalProvider(config);
      break;
    case "cloudflare-access":
      provider = await createCloudflareAccessProvider(config);
      break;
    default:
      throw new Error(`Unsupported auth provider: ${config.provider}`);
  }

  const sessionStore: SessionStore = await openSessionStore(
    config.session_file,
  );
  const context: AuthContext = {
    config,
    baseUrl,
    sessionStore,
    loginPath: "/auth/login",
    logoutPath: "/auth/logout",
  };

  return {
    enabled: true,
    responseHeaders: { "cache-control": "private, no-store" },
    async handle(request) {
      const url = new URL(request.url);
      if (isAuthPath(url, context, PUBLIC_HEALTH_PATH)) {
        return withNoStore(htmlResponse("ok\n"));
      }
      const special = await provider.handle(request, url, context);
      if (special !== null) return withNoStore(special);
      const identity = await provider.identity(request, url, context);
      if (identity !== null) return null;
      return withNoStore(await provider.challenge(request, url, context));
    },
    close() {
      sessionStore.close();
    },
  };
}
