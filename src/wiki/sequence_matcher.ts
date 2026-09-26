type MatchingBlock = {
  readonly a: number;
  readonly b: number;
  readonly size: number;
};
type SearchRange = readonly [number, number, number, number];

function longestMatch(
  a: readonly string[],
  b: readonly string[],
  range: SearchRange,
  b2j: ReadonlyMap<string, readonly number[]>,
): MatchingBlock {
  const [alo, ahi, blo, bhi] = range;
  let bestA = alo;
  let bestB = blo;
  let bestSize = 0;
  let previous = new Map<number, number>();

  for (let i = alo; i < ahi; i += 1) {
    const current = new Map<number, number>();
    for (const j of b2j.get(a[i]!) ?? []) {
      if (j < blo) continue;
      if (j >= bhi) break;
      const size = (previous.get(j - 1) ?? 0) + 1;
      current.set(j, size);
      if (size > bestSize) {
        bestA = i - size + 1;
        bestB = j - size + 1;
        bestSize = size;
      }
    }
    previous = current;
  }

  while (
    bestA > alo && bestB > blo && a[bestA - 1] === b[bestB - 1]
  ) {
    bestA -= 1;
    bestB -= 1;
    bestSize += 1;
  }
  while (
    bestA + bestSize < ahi && bestB + bestSize < bhi &&
    a[bestA + bestSize] === b[bestB + bestSize]
  ) {
    bestSize += 1;
  }
  return { a: bestA, b: bestB, size: bestSize };
}

function matchingBlocks(
  a: readonly string[],
  b: readonly string[],
): MatchingBlock[] {
  const b2j = new Map<string, number[]>();
  for (let j = 0; j < b.length; j += 1) {
    const positions = b2j.get(b[j]!) ?? [];
    positions.push(j);
    b2j.set(b[j]!, positions);
  }
  if (b.length >= 200) {
    const popularThreshold = Math.floor(b.length / 100) + 1;
    for (const [character, positions] of b2j) {
      if (positions.length > popularThreshold) b2j.delete(character);
    }
  }

  const blocks: MatchingBlock[] = [];
  const pending: SearchRange[] = [[0, a.length, 0, b.length]];
  while (pending.length > 0) {
    const range = pending.pop()!;
    const [alo, ahi, blo, bhi] = range;
    const block = longestMatch(a, b, range, b2j);
    if (block.size === 0) continue;
    blocks.push(block);
    if (alo < block.a && blo < block.b) {
      pending.push([alo, block.a, blo, block.b]);
    }
    const nextA = block.a + block.size;
    const nextB = block.b + block.size;
    if (nextA < ahi && nextB < bhi) {
      pending.push([nextA, ahi, nextB, bhi]);
    }
  }

  blocks.sort((left, right) => left.a - right.a || left.b - right.b);
  const collapsed: MatchingBlock[] = [];
  let aStart = 0;
  let bStart = 0;
  let size = 0;
  for (const block of blocks) {
    if (aStart + size === block.a && bStart + size === block.b) {
      size += block.size;
    } else {
      if (size > 0) collapsed.push({ a: aStart, b: bStart, size });
      aStart = block.a;
      bStart = block.b;
      size = block.size;
    }
  }
  if (size > 0) collapsed.push({ a: aStart, b: bStart, size });
  collapsed.push({ a: a.length, b: b.length, size: 0 });
  return collapsed;
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(
    right,
    (character) => character.codePointAt(0)!,
  );
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export function sequenceMatcherRatio(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  const total = a.length + b.length;
  if (total === 0) return 1;
  const matches = matchingBlocks(a, b).reduce(
    (sum, block) => sum + block.size,
    0,
  );
  return (2 * matches) / total;
}

export function getCloseMatches(
  word: string,
  possibilities: readonly string[],
  count = 3,
  cutoff = 0.6,
): string[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError("count must be a positive integer");
  }
  if (cutoff < 0 || cutoff > 1) {
    throw new RangeError("cutoff must be between 0 and 1");
  }
  return possibilities
    .map((candidate, order) => ({
      candidate,
      order,
      ratio: sequenceMatcherRatio(word, candidate),
    }))
    .filter((item) => item.ratio >= cutoff)
    .sort((left, right) =>
      right.ratio - left.ratio ||
      compareCodePoints(right.candidate, left.candidate) ||
      left.order - right.order
    )
    .slice(0, count)
    .map((item) => item.candidate);
}
