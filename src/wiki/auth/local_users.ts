/** Local password account storage. */

import bcrypt from "bcrypt";

export interface LocalUser {
  readonly username: string;
  readonly hash: string;
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }
  return await bcrypt.hash(password, 12);
}

export async function verifyPassword(
  user: LocalUser,
  password: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, user.hash);
  } catch {
    return false;
  }
}

export async function loadUsers(file: string): Promise<LocalUser[]> {
  const parsed = JSON.parse(await Deno.readTextFile(file));
  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.users)
    ? parsed.users
    : null;
  if (entries === null) throw new Error(`Invalid users file: ${file}`);
  return entries.map((entry: unknown, index: number) => {
    const user = entry as Partial<LocalUser>;
    if (typeof user.username !== "string" || typeof user.hash !== "string") {
      throw new Error(`Invalid user at index ${index} in ${file}`);
    }
    return { username: user.username, hash: user.hash };
  });
}
