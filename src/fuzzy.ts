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
