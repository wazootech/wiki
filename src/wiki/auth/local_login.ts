/** Login page and password-check handler for the local auth provider. */

import {
  authPath,
  constantTimeEquals,
  cookie,
  htmlResponse,
  isSecure,
  readCookie,
  redirect,
  safeNext,
} from "./http.ts";
import { renderLoginPage } from "./login_page.ts";
import {
  clearFailures,
  clientKey,
  isRateLimited,
  recordFailure,
} from "./rate_limit.ts";
import type { LocalUser } from "./local_users.ts";
import { verifyPassword } from "./local_users.ts";
import { randomToken } from "./tokens.ts";
import type { AuthContext, AuthProvider } from "./types.ts";

export function createLoginHandler(
  users: readonly LocalUser[],
  csrfName: string,
): AuthProvider["handle"] {
  const loginPage = (
    request: Request,
    context: AuthContext,
    url: URL,
    error?: string,
    submittedCsrf?: string,
  ): Response => {
    const existing = readCookie(request, csrfName) || null;
    const csrf = submittedCsrf ?? existing ?? randomToken(16);
    const response = htmlResponse(
      renderLoginPage({
        action: authPath(context, context.loginPath),
        logoutPath: authPath(context, context.logoutPath),
        csrf,
        next: safeNext(url.searchParams.get("next"), context.baseUrl),
        ...(error === undefined ? {} : { error }),
      }),
      error === undefined ? 200 : 401,
    );
    if (existing === null) {
      response.headers.append(
        "set-cookie",
        cookie(csrfName, csrf, isSecure(request, url)),
      );
    }
    return response;
  };

  return async (request, url, context, peer) => {
    if (request.method === "GET") return loginPage(request, context, url);
    if (request.method !== "POST") return new Response(null, { status: 405 });

    const form = await request.formData();
    const csrf = readCookie(request, csrfName);
    const submitted = form.get("csrf");
    if (
      csrf === null ||
      typeof submitted !== "string" ||
      !constantTimeEquals(csrf, submitted)
    ) {
      return htmlResponse("Invalid CSRF token.\n", 403);
    }

    const key = clientKey(request, peer);
    if (isRateLimited(key)) {
      return htmlResponse("Too many failed sign-in attempts.\n", 429);
    }

    // Count the attempt before the slow hash so parallel guesses cannot pass.
    recordFailure(key);

    const username = form.get("username");
    const password = form.get("password");
    const user =
      typeof username === "string"
        ? users.find((candidate) => candidate.username === username)
        : undefined;
    const valid =
      user !== undefined &&
      typeof password === "string" &&
      (await verifyPassword(user, password));
    if (!valid) {
      const error = "Invalid username or password.";
      return loginPage(request, context, url, error, csrf);
    }

    clearFailures(key);
    const token = await context.sessionStore.create(
      { id: user!.username, name: user!.username },
      context.config.session_ttl_seconds,
    );
    const next = form.get("next");
    const response = redirect(
      safeNext(typeof next === "string" ? next : null, context.baseUrl),
      303,
    );
    response.headers.append(
      "set-cookie",
      cookie(context.config.cookie_name, token, isSecure(request, url)),
    );
    return response;
  };
}
