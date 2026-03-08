const SUPPORTED_SAMPLE_EXTENSIONS = new Set(["wav"]);

export function normalizeSampleExtension(extension: string): string {
  return extension.trim().toLowerCase();
}

export function isSupportedSampleExtension(extension: string): boolean {
  return SUPPORTED_SAMPLE_EXTENSIONS.has(normalizeSampleExtension(extension));
}
