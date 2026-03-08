const EXTENSION_TO_MIME_TYPES: Record<string, string[]> = {
  wav: ["audio/wav", "audio/x-wav", "audio/wave"],
};

const extensionSupportCache = new Map<string, boolean>();

export function isBrowserAudioExtensionSupported(extension: string): boolean {
  const normalizedExtension = extension.trim().toLowerCase();

  if (normalizedExtension.length === 0) {
    return false;
  }

  const cached = extensionSupportCache.get(normalizedExtension);

  if (cached !== undefined) {
    return cached;
  }

  const mimeTypes = EXTENSION_TO_MIME_TYPES[normalizedExtension] ?? [];

  if (mimeTypes.length === 0) {
    extensionSupportCache.set(normalizedExtension, false);
    return false;
  }

  if (typeof Audio === "undefined") {
    extensionSupportCache.set(normalizedExtension, true);
    return true;
  }

  const probe = new Audio();
  const isSupported = mimeTypes.some((mimeType) => probe.canPlayType(mimeType) !== "");
  extensionSupportCache.set(normalizedExtension, isSupported);

  return isSupported;
}
