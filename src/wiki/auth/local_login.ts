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
import { clearFailures, isRateLimited, recordFailure } from "./rate_limit.ts";
import type { LocalUser } from "./local_users.ts";
import { verifyPassword } from "./local_users.ts";
import { randomToken } from "./tokens.ts";
import type { AuthContext } from "./types.ts";

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
}

export function createLoginHandler(
  users: readonly LocalUser[],
  csrfName: string,
): (request: Request, url: URL, context: AuthContext) => Promise<Response> {
  const loginPage = (
    context: AuthContext,
    url: URL,
    error?: string,
    submittedCsrf?: string,
  ): Response => {
    const existing = readCookie(new Request(url), csrfName);
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
        cookie(csrfName, csrf, isSecure(url)),
      );
    }
    return response;
  };

  return async (request, url, context) => {
    if (request.method === "GET") return loginPage(context, url);
    if (request.method !== "POST") return new Response(null, { status: 405 });

    const form = await request.formData();
    const csrf = readCookie(request, csrfName);
    const submitted = form.get("csrf");
    if (
      csrf === null || typeof submitted !== "string" ||
      !constantTimeEquals(csrf, submitted)
    ) {
      return htmlResponse("Invalid CSRF token.\n", 403);
    }

    const key = clientKey(request);
    if (isRateLimited(key)) {
      return htmlResponse("Too many failed sign-in attempts.\n", 429);
    }

    const username = form.get("username");
    const password = form.get("password");
    const user = typeof username === "string"
      ? users.find((candidate) => candidate.username === username)
      : undefined;
    const valid = user !== undefined && typeof password === "string" &&
      await verifyPassword(user, password);
    if (!valid) {
      recordFailure(key);
      return loginPage(context, url, "Invalid username or password.", csrf);
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
      cookie(context.config.cookie_name, token, isSecure(url)),
    );
    return response;
  };
}
