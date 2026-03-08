import type { SampleRecord } from "./types";
import { fuzzyMatch, normalizeFuzzyQuery } from "./fuzzy";

export function filterSamples(
  samples: SampleRecord[],
  query: string,
  showAssignedOnly: boolean,
): SampleRecord[] {
  if (showAssignedOnly) {
    return samples
      .filter((sample) => sample.slotNumber !== null)
      .sort((left, right) => {
        const slotOrder = (left.slotNumber ?? 0) - (right.slotNumber ?? 0);

        if (slotOrder !== 0) {
          return slotOrder;
        }

        return left.normalizedName.localeCompare(right.normalizedName);
      });
  }

  const normalizedQuery = normalizeFuzzyQuery(query);

  if (!normalizedQuery) {
    return samples;
  }

  const scoredMatches: {
    sample: SampleRecord;
    score: number;
    nameScore: number;
  }[] = [];

  for (const sample of samples) {
    const nameMatch = fuzzyMatch(sample.name, normalizedQuery);
    const pathMatch = fuzzyMatch(sample.relativePath, normalizedQuery);

    if (!nameMatch && !pathMatch) {
      continue;
    }

    const nameScore = nameMatch?.score ?? Number.NEGATIVE_INFINITY;
    const pathScore = pathMatch?.score ?? Number.NEGATIVE_INFINITY;
    const score = Math.max(pathScore, nameScore + 2);

    scoredMatches.push({
      sample,
      score,
      nameScore,
    });
  }

  scoredMatches.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.nameScore !== left.nameScore) {
      return right.nameScore - left.nameScore;
    }

    return left.sample.normalizedName.localeCompare(right.sample.normalizedName);
  });

  return scoredMatches.map((entry) => entry.sample);
}
