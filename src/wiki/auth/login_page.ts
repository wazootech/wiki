/** Minimal, dependency-free sign-in and signed-out pages. */

import { escapeHtml } from "./http.ts";

const STYLE = `body{font:16px/1.5 system-ui,sans-serif;max-width:28rem;margin:10vh auto;padding:0 1rem;color:#18181b}label,input{display:block;width:100%;box-sizing:border-box}input{padding:.6rem;margin:.35rem 0 1rem;border:1px solid #d4d4d8;border-radius:.4rem}button{padding:.6rem 1rem;border:0;border-radius:.4rem;background:#18181b;color:#fff;cursor:pointer}.error{color:#b91c1c}`;

export function renderLoginPage(options: {
  readonly action: string;
  readonly logoutPath: string;
  readonly csrf: string;
  readonly next: string;
  readonly error?: string;
}): string {
  const error =
    options.error === undefined
      ? ""
      : `<p class="error">${escapeHtml(options.error)}</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in</title><style>${STYLE}</style></head><body><h1>Sign in</h1>${error}<form method="post" action="${escapeHtml(
    options.action,
  )}"><input type="hidden" name="csrf" value="${escapeHtml(
    options.csrf,
  )}"><input type="hidden" name="next" value="${escapeHtml(
    options.next,
  )}"><label for="username">Username</label><input id="username" name="username" autocomplete="username" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in</button></form><form method="post" action="${escapeHtml(
    options.logoutPath,
  )}"><input type="hidden" name="csrf" value="${escapeHtml(
    options.csrf,
  )}"><button type="submit">Sign out</button></form></body></html>`;
}

export function renderSignedOutPage(loginPath: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signed out</title><style>${STYLE}</style></head><body><h1>Signed out</h1><p><a href="${escapeHtml(
    loginPath,
  )}">Sign in again</a></p></body></html>`;
}
