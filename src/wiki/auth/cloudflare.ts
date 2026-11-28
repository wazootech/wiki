/** Cloudflare Access provider for the whole-site auth gateway. */

import type { AuthBlock } from "../config.ts";
import { verifyAccessJwt } from "./cloudflare_jwt.ts";
import { htmlResponse } from "./http.ts";
import type { AuthProvider } from "./types.ts";

const ASSERTION_HEADER = "cf-access-jwt-assertion";

// deno-lint-ignore require-await -- factory stays async for parity with the local provider.
export async function createCloudflareAccessProvider(
  config: AuthBlock,
  jwksUrl?: string,
): Promise<AuthProvider> {
  const issuer = `https://${config.team_domain}.cloudflareaccess.com`;
  const expected = {
    audience: config.audience ?? "",
    issuer,
    jwksUrl: jwksUrl ?? `${issuer}/cdn-cgi/access/certs`,
  };

  return {
    id: "cloudflare-access",
    handle() {
      return Promise.resolve(null);
    },
    async identity(request) {
      const assertion = request.headers.get(ASSERTION_HEADER);
      if (assertion === null || assertion === "") return null;
      return await verifyAccessJwt(assertion, expected);
    },
    challenge() {
      return Promise.resolve(
        htmlResponse(
          '<!doctype html>\n<html lang="en">' +
            '<head><meta charset="utf-8"><title>Sign in required</title></head>\n' +
            "<body><h1>Sign in required</h1>\n" +
            "<p>Sign in through Cloudflare Access to view this wiki.</p></body></html>\n",
          401,
        ),
      );
    },
  };
}
