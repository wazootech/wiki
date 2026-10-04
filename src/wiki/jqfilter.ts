const TOKEN = /([\p{L}\p{N}_]+)|\[(\d+)\]|\[\]/uy;

function tokenize(path: string): string[] {
  const tokens: string[] = [];
  for (const part of path.split(".")) {
    let position = 0;
    while (position < part.length) {
      TOKEN.lastIndex = position;
      const match = TOKEN.exec(part);
      if (match === null) {
        throw new Error(
          `Invalid path token at position ${position} in '${part}'`,
        );
      }
      if (match[1] !== undefined) tokens.push(match[1]);
      else if (match[2] !== undefined) tokens.push(`[${match[2]}]`);
      else tokens.push("[]");
      position = TOKEN.lastIndex;
    }
  }
  return tokens;
}

function resolveStep(value: unknown, step: string): unknown[] {
  if (step === "[]") return Array.isArray(value) ? [...value] : [];
  if (step.startsWith("[") && step.endsWith("]")) {
    const index = Number(step.slice(1, -1));
    return Array.isArray(value) && Number.isSafeInteger(index) && index >= 0 &&
        index < value.length
      ? [value[index]]
      : [];
  }
  if (
    typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.hasOwn(value, step)
  ) {
    return [(value as Record<string, unknown>)[step]];
  }
  return [];
}

export function resolvePath(value: unknown, path: string): unknown[] {
  let candidates = [value];
  for (const step of tokenize(path)) {
    candidates = candidates.flatMap((candidate) =>
      resolveStep(candidate, step)
    );
    if (candidates.length === 0) break;
  }
  return candidates;
}
