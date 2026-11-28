/** Session storage for the auth gateway. */

import * as sys from "../sys.ts";
import type { AuthIdentity, SessionStore } from "./types.ts";
import { hashToken, randomToken } from "./tokens.ts";

interface StoredSession {
  readonly identity: AuthIdentity;
  readonly expires_at: number;
}

/** In-memory sessions with optional JSON-file persistence across restarts. */
export class FileSessionStore implements SessionStore {
  readonly #file: string | null;
  readonly #sessions = new Map<string, StoredSession>();

  private constructor(file: string | null) {
    this.#file = file;
  }

  static async open(file: string | null): Promise<FileSessionStore> {
    const store = new FileSessionStore(file);
    if (file !== null) await store.#load();
    return store;
  }

  async create(identity: AuthIdentity, ttlSeconds: number): Promise<string> {
    this.#prune();
    const token = randomToken();
    this.#sessions.set(await hashToken(token), {
      identity,
      expires_at: Date.now() + ttlSeconds * 1000,
    });
    await this.#persist();
    return token;
  }

  async get(hashedToken: string): Promise<AuthIdentity | null> {
    const session = this.#sessions.get(hashedToken);
    if (session === undefined) return null;
    if (session.expires_at <= Date.now()) {
      this.#sessions.delete(hashedToken);
      await this.#persist();
      return null;
    }
    return session.identity;
  }

  async delete(hashedToken: string): Promise<void> {
    if (this.#sessions.delete(hashedToken)) await this.#persist();
  }

  close(): void {
    this.#sessions.clear();
  }

  #prune(): void {
    const now = Date.now();
    for (const [hash, session] of this.#sessions) {
      if (session.expires_at <= now) this.#sessions.delete(hash);
    }
  }

  async #load(): Promise<void> {
    try {
      const parsed = JSON.parse(await sys.readTextFile(this.#file!));
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return;
      }
      for (const [hash, value] of Object.entries(parsed)) {
        const session = value as Partial<StoredSession>;
        if (typeof session.expires_at !== "number") continue;
        if (typeof session.identity?.id !== "string") continue;
        this.#sessions.set(hash, {
          identity: {
            id: session.identity.id,
            ...(typeof session.identity.name === "string"
              ? { name: session.identity.name }
              : {}),
          },
          expires_at: session.expires_at,
        });
      }
      this.#prune();
    } catch {
      // A missing or corrupt session file starts a fresh, empty store.
    }
  }

  async #persist(): Promise<void> {
    if (this.#file === null) return;
    const records = Object.fromEntries(this.#sessions);
    await sys.writeTextFile(this.#file, JSON.stringify(records, null, 2));
  }
}

export async function openSessionStore(
  file: string | null,
): Promise<SessionStore> {
  return await FileSessionStore.open(file);
}
