---
type: TechArticle
description: Hash passwords and serve a built wiki behind the whole-site auth gateway.
---

# `wiki auth`

Protect a hosted wiki at the server, not in the browser. The gateway gates every request before it reaches static files, including assets and generated HTML.

## Usage

```bash
wiki auth hash 'correct horse battery staple'
wiki auth serve --site-dir _site --host 0.0.0.0 --port 8080
```

`wiki auth hash` prints a bcrypt hash for a local password account. Store the hash in the file named by `site.auth.users_file`; never store plaintext passwords in `wiki.yml`.

`wiki auth serve` serves an already-built site through the auth gateway. `wiki serve` uses the same gateway when `site.auth.enabled` is true.

## Options

| Command | Flag               | Default                    | Description                                |
| ------- | ------------------ | -------------------------- | ------------------------------------------ |
| `hash`  | `PASSWORD`         | required                   | Password to hash; must be 12+ characters   |
| `serve` | `--host`           | `127.0.0.1`                | Bind address                               |
| `serve` | `--port`           | `8080`                     | Port                                       |
| `serve` | `--site-dir`       | `_site` in the config root | Built site directory                       |
| `serve` | `--site-base-url`  | from config                | Override `site.base_url`                   |
| `serve` | `--site-url-style` | from config                | Override `site.url_style`: `dir` or `file` |

## Providers

### Local passwords

```yaml
site:
  auth:
    enabled: true
    provider: local
    users_file: ../private/wiki-users.json
    session_file: ../private/wiki-sessions.json
    session_ttl_seconds: 604800
    cookie_name: wiki_session
```

The users file is a JSON array of `{ "username": "…", "hash": "…" }` objects, or an object with a `users` array. Failed sign-ins are limited to five per 15 minutes per client address. The address is the connecting peer; `X-Forwarded-For` is read only from a proxy on the same host (loopback), using its last entry, so that proxy must append the client address. Behind a proxy on another host, all clients share its limit. Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when the request is HTTPS or the proxy sends `X-Forwarded-Proto: https`.

Keep both files outside the built site and outside version control. A session file lets sign-ins survive a gateway restart; omit it for ephemeral sessions.

### Cloudflare Access

```yaml
site:
  auth:
    enabled: true
    provider: cloudflare-access
    team_domain: example
    audience: 32eafc7626e974616deaf0dc3ce63d7bcbed58a2731e84d06bc3cdf1b53c4228
```

`team_domain` is the team name alone: `example` for `example.cloudflareaccess.com`. `audience` is the Access application's **Application Audience (AUD) tag**, not the site URL. Copy it from the application's settings in the Cloudflare One dashboard.

Cloudflare Access handles the interactive sign-in at the edge, and its policies decide who may sign in. The gateway verifies the `Cf-Access-Jwt-Assertion` header against Cloudflare's JWKS and rejects an assertion at the origin unless its signature is valid, `iss` is `https://<team_domain>.cloudflareaccess.com`, `aud` contains the AUD tag, `exp` is in the future, and `nbf`, when present, is no more than 60 seconds ahead. Signing keys are cached for 10 minutes, and an unknown key ID triggers an early refresh at most once per 30 seconds, so key rotation needs no restart. No session cookie is issued in this mode.

## Scope

Auth is whole-site and opt-in. The static build is unchanged, so GitHub Pages deployments remain public. A private deployment must run behind this gateway or an edge gate such as Cloudflare Access. Client-side login is deliberately not supported: the site's files would still be fetchable without it.

Public endpoints are limited to `/auth/login`, `/auth/logout`, and `/auth/health`. Authenticated responses use `cache-control: private, no-store`.
