import type { SampleRecord } from "./types";
import {
  fuzzyMatch,
  normalizeFuzzyQuery,
  splitNormalizedFuzzyQuery,
} from "./fuzzy";

const NAME_ALL_TOKENS_BONUS = 2400;
const ANY_FIELD_ALL_TOKENS_BONUS = 1100;
const MATCHED_TOKEN_BONUS = 520;
const NAME_TOKEN_BONUS = 160;
const PATH_TOKEN_BONUS = 70;
const NAME_FIELD_WEIGHT = 1.2;
const PATH_FIELD_WEIGHT = 0.5;
const PHRASE_IN_NAME_BONUS_FACTOR = 0.45;
const PHRASE_IN_PATH_BONUS_FACTOR = 0.2;

function getDirectoryPath(relativePath: string): string {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const lastSeparatorIndex = normalizedPath.lastIndexOf("/");

  if (lastSeparatorIndex <= 0) {
    return "";
  }

  return normalizedPath.slice(0, lastSeparatorIndex);
}

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
  const queryTokens = splitNormalizedFuzzyQuery(normalizedQuery);

  if (queryTokens.length === 0) {
    return samples;
  }

  const scoredMatches: {
    sample: SampleRecord;
    score: number;
    nameMatchedTokenCount: number;
    matchedTokenCount: number;
    nameScore: number;
  }[] = [];

  for (const sample of samples) {
    const directoryPath = getDirectoryPath(sample.relativePath);
    let matchedTokenCount = 0;
    let nameMatchedTokenCount = 0;
    let pathMatchedTokenCount = 0;
    let nameScore = 0;
    let pathScore = 0;

    for (const token of queryTokens) {
      const nameMatch = fuzzyMatch(sample.name, token);
      const pathMatch =
        directoryPath.length > 0 ? fuzzyMatch(directoryPath, token) : null;

      if (!nameMatch && !pathMatch) {
        continue;
      }

      matchedTokenCount += 1;

      if (nameMatch) {
        nameMatchedTokenCount += 1;
        nameScore += nameMatch.score;
      }

      if (pathMatch) {
        pathMatchedTokenCount += 1;
        pathScore += pathMatch.score;
      }
    }

    if (matchedTokenCount === 0) {
      continue;
    }

    const fullNameMatch =
      queryTokens.length > 1 ? fuzzyMatch(sample.name, normalizedQuery) : null;
    const fullPathMatch =
      queryTokens.length > 1 && directoryPath.length > 0
        ? fuzzyMatch(directoryPath, normalizedQuery)
        : null;
    const score =
      nameScore * NAME_FIELD_WEIGHT +
      pathScore * PATH_FIELD_WEIGHT +
      matchedTokenCount * MATCHED_TOKEN_BONUS +
      nameMatchedTokenCount * NAME_TOKEN_BONUS +
      pathMatchedTokenCount * PATH_TOKEN_BONUS +
      (matchedTokenCount === queryTokens.length ? ANY_FIELD_ALL_TOKENS_BONUS : 0) +
      (nameMatchedTokenCount === queryTokens.length ? NAME_ALL_TOKENS_BONUS : 0) +
      (fullNameMatch?.score ?? 0) * PHRASE_IN_NAME_BONUS_FACTOR +
      (fullPathMatch?.score ?? 0) * PHRASE_IN_PATH_BONUS_FACTOR;

    scoredMatches.push({
      sample,
      score,
      nameScore,
      nameMatchedTokenCount,
      matchedTokenCount,
    });
  }

  scoredMatches.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.nameMatchedTokenCount !== left.nameMatchedTokenCount) {
      return right.nameMatchedTokenCount - left.nameMatchedTokenCount;
    }

    if (right.matchedTokenCount !== left.matchedTokenCount) {
      return right.matchedTokenCount - left.matchedTokenCount;
    }

    if (right.nameScore !== left.nameScore) {
      return right.nameScore - left.nameScore;
    }

    return left.sample.normalizedName.localeCompare(right.sample.normalizedName);
  });

  return scoredMatches.map((entry) => entry.sample);
}
