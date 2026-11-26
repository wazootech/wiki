/** Shared types for the whole-site auth gateway. */

import type { AuthBlock } from "../config.ts";

export interface AuthIdentity {
  readonly id: string;
  readonly name?: string;
}

export interface SessionStore {
  create(identity: AuthIdentity, ttlSeconds: number): Promise<string>;
  get(hashedToken: string): Promise<AuthIdentity | null>;
  delete(hashedToken: string): Promise<void>;
  close(): void;
}

export interface AuthContext {
  readonly config: AuthBlock;
  readonly baseUrl: string;
  readonly sessionStore: SessionStore;
  readonly loginPath: string;
  readonly logoutPath: string;
}

export interface AuthProvider {
  readonly id: string;
  handle(
    request: Request,
    url: URL,
    context: AuthContext,
  ): Promise<Response | null>;
  identity(
    request: Request,
    url: URL,
    context: AuthContext,
  ): Promise<AuthIdentity | null>;
  challenge(
    request: Request,
    url: URL,
    context: AuthContext,
  ): Promise<Response>;
}
