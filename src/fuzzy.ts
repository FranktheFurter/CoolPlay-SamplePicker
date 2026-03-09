export interface FuzzyMatchResult {
  ranges: Array<{
    start: number;
    end: number;
  }>;
  score: number;
}

export function normalizeFuzzyQuery(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

export function splitNormalizedFuzzyQuery(normalizedQuery: string): string[] {
  if (!normalizedQuery) {
    return [];
  }

  return [...new Set(normalizedQuery.split(" ").filter((token) => token.length > 0))];
}

export function mergeFuzzyRanges(
  ranges: Array<{
    start: number;
    end: number;
  }>,
): Array<{
  start: number;
  end: number;
}> {
  if (ranges.length <= 1) {
    return ranges;
  }

  const sortedRanges = [...ranges].sort((left, right) =>
    left.start === right.start ? left.end - right.end : left.start - right.start,
  );
  const mergedRanges = [sortedRanges[0]];

  for (const range of sortedRanges.slice(1)) {
    const previousRange = mergedRanges[mergedRanges.length - 1];

    if (!previousRange) {
      mergedRanges.push(range);
      continue;
    }

    if (range.start <= previousRange.end) {
      previousRange.end = Math.max(previousRange.end, range.end);
      continue;
    }

    mergedRanges.push({ ...range });
  }

  return mergedRanges;
}

export function fuzzyMatch(
  value: string,
  normalizedQuery: string,
): FuzzyMatchResult | null {
  if (!normalizedQuery) {
    return null;
  }

  const normalizedValue = value.toLowerCase();
  const ranges: FuzzyMatchResult["ranges"] = [];
  let searchOffset = 0;

  while (searchOffset <= normalizedValue.length - normalizedQuery.length) {
    const start = normalizedValue.indexOf(normalizedQuery, searchOffset);

    if (start === -1) {
      break;
    }

    ranges.push({
      start,
      end: start + normalizedQuery.length,
    });
    searchOffset = start + normalizedQuery.length;
  }

  if (ranges.length === 0) {
    return null;
  }

  const firstPosition = ranges[0].start;
  const prefixBonus = firstPosition === 0 ? 18 : 0;
  const lengthBonus = Math.min(42, normalizedQuery.length * 4);
  const occurrenceBonus = Math.max(0, ranges.length - 1) * 6;
  const score =
    lengthBonus +
    prefixBonus -
    firstPosition * 0.25 +
    occurrenceBonus;

  return { ranges, score };
}
