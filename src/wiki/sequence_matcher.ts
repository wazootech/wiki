import { matchingBlocks } from "./sequence_matcher/blocks.ts";

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
