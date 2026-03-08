import type { SampleRecord } from "./types";

function normalizeQuery(value: string): string {
  return value.toLowerCase().trim();
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

  const normalizedQuery = normalizeQuery(query);

  return samples.filter((sample) => {
    if (!normalizedQuery) {
      return true;
    }

    return (
      sample.normalizedName.includes(normalizedQuery) ||
      sample.relativePath.toLowerCase().includes(normalizedQuery)
    );
  });
}
