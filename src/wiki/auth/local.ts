/** Standalone username/password provider for hosted wikis. */

import type { AuthBlock } from "../config.ts";
import {
  authPath,
  clearCookie,
  constantTimeEquals,
  htmlResponse,
  isAuthPath,
  isSecure,
  readCookie,
  redirect,
} from "./http.ts";
import { renderSignedOutPage } from "./login_page.ts";
import { createLoginHandler } from "./local_login.ts";
import { loadUsers } from "./local_users.ts";
import { hashToken } from "./tokens.ts";
import type { AuthProvider } from "./types.ts";

export async function createLocalProvider(
  config: AuthBlock,
): Promise<AuthProvider> {
  const users = await loadUsers(config.users_file!);
  const csrfName = `${config.cookie_name}_csrf`;
  const handleLogin = createLoginHandler(users, csrfName);

  return {
    id: "local",
    async handle(request, url, context, peer) {
      if (isAuthPath(url, context, context.loginPath)) {
        return await handleLogin(request, url, context, peer);
      }
      if (
        isAuthPath(url, context, context.logoutPath) &&
        request.method === "POST"
      ) {
        const csrf = readCookie(request, csrfName);
        const form = await request.formData();
        const submitted = form.get("csrf");
        if (
          csrf === null || typeof submitted !== "string" ||
          !constantTimeEquals(csrf, submitted)
        ) {
          return htmlResponse("Invalid CSRF token.\n", 403);
        }
        const token = readCookie(request, context.config.cookie_name);
        if (token !== null) {
          await context.sessionStore.delete(await hashToken(token));
        }
        const response = htmlResponse(renderSignedOutPage(
          authPath(context, context.loginPath),
        ));
        response.headers.append(
          "set-cookie",
          clearCookie(context.config.cookie_name, isSecure(request, url)),
        );
        response.headers.append(
          "set-cookie",
          clearCookie(csrfName, isSecure(request, url)),
        );
        return response;
      }
      return null;
    },
    async identity(request, _url, context) {
      const token = readCookie(request, context.config.cookie_name);
      if (token === null) return null;
      return await context.sessionStore.get(await hashToken(token));
    },
    challenge(request, url, context) {
      const target = `${url.pathname}${url.search}`;
      const login = authPath(context, context.loginPath);
      const next = `${login}?next=${encodeURIComponent(target)}`;
      return Promise.resolve(
        request.method === "GET" || request.method === "HEAD"
          ? redirect(next, 302)
          : htmlResponse("Sign in required.\n", 401),
      );
    },
  };
}
