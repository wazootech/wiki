export function tempRoot(): string {
  return Deno.makeTempDirSync({ prefix: "wiki-init-scaffold-" });
}

export function cleanup(root: string): void {
  Deno.removeSync(root, { recursive: true });
}
