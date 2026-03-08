import { AudioPreviewController } from "./audioPreview";
import { isBrowserAudioExtensionSupported } from "./audioSupport";
import {
  getCurrentDirectory,
  getSamplesForDirectory,
  replaceSamplesForDirectory,
  saveDirectory,
  updateSampleSlotNumber,
} from "./db";
import {
  createPersistedDirectory,
  getFileFromRelativePath,
  isFileSystemAccessSupported,
  scanDirectory,
} from "./fileScanner";
import { filterSamples } from "./search";
import { isSupportedSampleExtension } from "./sampleFormats";
import { createAppStore, initialAppState } from "./state";
import "./styles.css";
import type { AppState, PersistedDirectory, SampleRecord } from "./types";
import { createUI } from "./ui";
import { createWaveformPreview } from "./waveform";

const store = createAppStore(initialAppState);
const audioPreview = new AudioPreviewController((sampleId) => {
  commitState({ currentAudioId: sampleId });
});

let activeDirectory: PersistedDirectory | null = null;
let waveformRequestToken = 0;
let lastSelectedSampleId: string | null = null;
const MIN_SLOT_NUMBER = 1;
const MAX_SLOT_NUMBER = 999;

function clampSlotCounter(slotNumber: number): number {
  if (!Number.isFinite(slotNumber)) {
    return MIN_SLOT_NUMBER;
  }

  return Math.min(MAX_SLOT_NUMBER, Math.max(MIN_SLOT_NUMBER, Math.round(slotNumber)));
}

function getNextSlotInRange(
  samples: SampleRecord[],
  rangeStart: number,
  rangeEnd: number,
): number {
  const start = clampSlotCounter(Math.min(rangeStart, rangeEnd));
  const end = clampSlotCounter(Math.max(rangeStart, rangeEnd));
  const assignedInRange = new Set<number>();
  let highestAssigned = start - 1;

  for (const sample of samples) {
    if (sample.slotNumber === null) {
      continue;
    }

    if (sample.slotNumber < start || sample.slotNumber > end) {
      continue;
    }

    assignedInRange.add(sample.slotNumber);
    highestAssigned = Math.max(highestAssigned, sample.slotNumber);
  }

  const nextAfterHighest = highestAssigned + 1;

  if (nextAfterHighest <= end && !assignedInRange.has(nextAfterHighest)) {
    return nextAfterHighest;
  }

  for (let slotNumber = start; slotNumber <= end; slotNumber += 1) {
    if (!assignedInRange.has(slotNumber)) {
      return slotNumber;
    }
  }

  return end;
}

function deriveState(nextState: AppState): AppState {
  const filteredSamples = filterSamples(
    nextState.samples,
    nextState.query,
    nextState.showAssignedOnly,
  );
  let selectedSampleId = nextState.selectedSampleId;

  if (filteredSamples.length === 0) {
    selectedSampleId = null;
  } else if (!selectedSampleId) {
    selectedSampleId = filteredSamples[0].id;
  } else if (!filteredSamples.some((sample) => sample.id === selectedSampleId)) {
    selectedSampleId = filteredSamples[0].id;
  }

  return {
    ...nextState,
    filteredSamples,
    selectedSampleId,
  };
}

function commitState(patch: Partial<AppState>): void {
  const nextState = deriveState({
    ...store.getState(),
    ...patch,
  });

  store.setState(nextState);
}

async function ensureReadPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const options = { mode: "read" } as const;
  const currentPermission = await handle.queryPermission(options);

  if (currentPermission === "granted") {
    return true;
  }

  return (await handle.requestPermission(options)) === "granted";
}

function buildSlotMap(samples: SampleRecord[]): Map<string, number> {
  return new Map(
    samples
      .filter((sample) => sample.slotNumber !== null)
      .map((sample) => [sample.relativePath.toLowerCase(), sample.slotNumber!]),
  );
}

function filterSupportedSamples(samples: SampleRecord[]): SampleRecord[] {
  return samples.filter((sample) => isSupportedSampleExtension(sample.extension));
}

async function loadWaveformForSelection(sampleId: string | null): Promise<void> {
  const token = ++waveformRequestToken;

  if (!sampleId || !activeDirectory) {
    commitState({ currentWaveform: null });
    return;
  }

  const sample = store.getState().samples.find((entry) => entry.id === sampleId);

  if (!sample) {
    commitState({ currentWaveform: null });
    return;
  }

  if (!isBrowserAudioExtensionSupported(sample.extension)) {
    commitState({
      currentWaveform: null,
      error: null,
    });
    return;
  }

  commitState({
    currentWaveform: {
      sampleId: sample.id,
      sampleName: sample.name,
      durationSeconds: 0,
      peaks: [],
    },
  });

  try {
    const hasPermission = await ensureReadPermission(activeDirectory.handle);

    if (!hasPermission) {
      throw new Error("Leseberechtigung fuer Waveform wurde verweigert.");
    }

    const file = await getFileFromRelativePath(
      activeDirectory.handle,
      sample.relativePath,
    );
    const waveform = await createWaveformPreview(sample.id, sample.name, file);

    if (token !== waveformRequestToken) {
      return;
    }

    commitState({ currentWaveform: waveform });
  } catch (error) {
    if (token !== waveformRequestToken) {
      return;
    }

    const isUnsupportedDecodeError =
      (error instanceof DOMException && error.name === "EncodingError") ||
      (error instanceof Error &&
        error.message.toLowerCase().includes("decode audio data"));

    commitState({
      currentWaveform: null,
      error:
        isUnsupportedDecodeError
          ? null
          : error instanceof Error
            ? error.message
            : "Waveform konnte nicht geladen werden.",
    });
  }
}

async function runScan(directory: PersistedDirectory): Promise<void> {
  const previousState = store.getState();
  const isDirectorySwitch = previousState.currentDirectoryId !== directory.id;

  commitState({
    currentDirectoryId: directory.id,
    currentDirectoryName: directory.name,
    isScanning: true,
    samples: isDirectorySwitch ? [] : previousState.samples,
    error: null,
  });

  try {
    const hasPermission = await ensureReadPermission(directory.handle);

    if (!hasPermission) {
      throw new Error("Leseberechtigung fuer den Ordner wurde nicht erteilt.");
    }

    const previousSamples = filterSupportedSamples(
      await getSamplesForDirectory(directory.id),
    );
    const slotMap = buildSlotMap(previousSamples);
    const scannedSamples = await scanDirectory(directory.handle, directory.id);

    const mergedSamples = scannedSamples.map((sample) => ({
      ...sample,
      slotNumber: slotMap.get(sample.relativePath.toLowerCase()) ?? null,
    }));

    await replaceSamplesForDirectory(directory.id, mergedSamples);

    commitState({
      samples: mergedSamples,
      isScanning: false,
      lastScanAt: Date.now(),
      error: null,
    });
  } catch (error) {
    commitState({
      isScanning: false,
      error:
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Scannen.",
    });
  }
}

async function hydrateFromIndexedDb(): Promise<void> {
  try {
    const directory = await getCurrentDirectory();

    if (!directory) {
      return;
    }

    activeDirectory = directory;

    const persistedSamples = await getSamplesForDirectory(directory.id);
    const samples = filterSupportedSamples(persistedSamples);

    if (samples.length !== persistedSamples.length) {
      await replaceSamplesForDirectory(directory.id, samples);
    }

    commitState({
      currentDirectoryId: directory.id,
      currentDirectoryName: directory.name,
      samples,
      error: null,
    });
  } catch (error) {
    commitState({
      error:
        error instanceof Error
          ? error.message
          : "Konnte gespeicherte Daten nicht laden.",
    });
  }
}

async function handlePickDirectory(): Promise<void> {
  if (!isFileSystemAccessSupported()) {
    commitState({
      error:
        "Dieser Browser unterstuetzt die File System Access API nicht ausreichend.",
    });
    return;
  }

  try {
    const handle = await window.showDirectoryPicker();
    const directory = createPersistedDirectory(handle);

    audioPreview.stop();
    activeDirectory = directory;

    await saveDirectory(directory);
    await runScan(directory);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    commitState({
      error:
        error instanceof Error
          ? error.message
          : "Ordnerauswahl fehlgeschlagen.",
    });
  }
}

async function handleRefreshScan(): Promise<void> {
  if (!activeDirectory) {
    return;
  }

  audioPreview.stop();
  await runScan(activeDirectory);
}

async function handleResetAssignments(): Promise<void> {
  const previousState = store.getState();

  if (!previousState.currentDirectoryId) {
    return;
  }

  if (!previousState.samples.some((sample) => sample.slotNumber !== null)) {
    return;
  }

  const nextSamples = previousState.samples.map((sample) =>
    sample.slotNumber === null ? sample : { ...sample, slotNumber: null },
  );

  commitState({
    samples: nextSamples,
    slotCounter: MIN_SLOT_NUMBER,
    error: null,
  });

  try {
    await replaceSamplesForDirectory(previousState.currentDirectoryId, nextSamples);
  } catch (error) {
    commitState({
      samples: previousState.samples,
      slotCounter: previousState.slotCounter,
      error:
        error instanceof Error
          ? error.message
          : "Konnte Zuweisungen nicht zuruecksetzen.",
    });
  }
}

function handleSearchChange(query: string): void {
  commitState({ query });
}

function handleAssignedOnlyChange(showAssignedOnly: boolean): void {
  commitState({ showAssignedOnly });
}

function handleSlotCounterChange(slotNumber: number): void {
  commitState({ slotCounter: clampSlotCounter(slotNumber) });
}

function handleSlotCounterAdjust(delta: number): void {
  if (!Number.isFinite(delta) || delta === 0) {
    return;
  }

  const step = delta > 0 ? 1 : -1;
  const currentCounter = store.getState().slotCounter;
  handleSlotCounterChange(currentCounter + step);
}

function handleSlotCategoryActivate(rangeStart: number, rangeEnd: number): void {
  const slotCounter = getNextSlotInRange(
    store.getState().samples,
    rangeStart,
    rangeEnd,
  );
  commitState({ slotCounter });
}

function handleLoopEnabledChange(loopEnabled: boolean): void {
  audioPreview.setLoopEnabled(loopEnabled);
  commitState({ loopEnabled });
}

function handleSelectSample(sampleId: string): void {
  const state = store.getState();

  if (state.selectedSampleId === sampleId) {
    return;
  }

  if (state.currentAudioId && state.currentAudioId !== sampleId) {
    audioPreview.stop();
  }

  commitState({ selectedSampleId: sampleId });
}

function handlePlaybackProgress(
  sampleId: string,
  fallbackDurationSeconds: number,
): number | null {
  return audioPreview.getPlayheadProgress(sampleId, fallbackDurationSeconds);
}

async function handleWriteSample(sampleId: string): Promise<void> {
  const previousState = store.getState();
  const previousSamples = previousState.samples;
  const nextSlotNumber = previousState.slotCounter;
  const sample = previousSamples.find((entry) => entry.id === sampleId);

  if (!sample) {
    return;
  }

  const conflictingSampleId =
    previousSamples.find(
      (entry) => entry.id !== sampleId && entry.slotNumber === nextSlotNumber,
    )?.id ?? null;

  const nextSamples = previousSamples.map((entry) =>
    entry.id === sampleId
      ? { ...entry, slotNumber: nextSlotNumber }
      : conflictingSampleId !== null && entry.id === conflictingSampleId
        ? { ...entry, slotNumber: null }
        : entry,
  );

  commitState({
    samples: nextSamples,
    slotCounter: clampSlotCounter(nextSlotNumber + 1),
    error: null,
  });

  try {
    await updateSampleSlotNumber(sampleId, nextSlotNumber);

    if (conflictingSampleId !== null) {
      await updateSampleSlotNumber(conflictingSampleId, null);
    }
  } catch (error) {
    commitState({
      samples: previousSamples,
      slotCounter: previousState.slotCounter,
      error:
        error instanceof Error
          ? error.message
          : "Konnte Slot-Zuweisung nicht speichern.",
    });
  }
}

async function handleTogglePlay(sampleId: string): Promise<void> {
  if (!activeDirectory) {
    return;
  }

  const sample = store.getState().samples.find((entry) => entry.id === sampleId);

  if (!sample) {
    return;
  }

  handleSelectSample(sample.id);

  if (!isBrowserAudioExtensionSupported(sample.extension)) {
    commitState({
      currentAudioId: null,
      error: `Audio-Preview fuer .${sample.extension} wird von diesem Browser nicht unterstuetzt.`,
    });
    return;
  }

  try {
    const hasPermission = await ensureReadPermission(activeDirectory.handle);

    if (!hasPermission) {
      throw new Error("Leseberechtigung fuer Audio-Preview wurde verweigert.");
    }

    await audioPreview.toggle(
      {
        id: sample.id,
      },
      async () =>
        getFileFromRelativePath(activeDirectory!.handle, sample.relativePath),
    );
  } catch (error) {
    const isUnsupportedMediaError =
      (error instanceof DOMException && error.name === "NotSupportedError") ||
      (error instanceof Error &&
        error.message.toLowerCase().includes("no supported source"));

    commitState({
      currentAudioId: null,
      error:
        isUnsupportedMediaError
          ? `Audio-Preview fuer "${sample.name}" kann nicht abgespielt werden. Dateiformat oder Codec werden vom Browser nicht unterstuetzt.`
          : error instanceof Error
            ? error.message
            : "Audio-Preview konnte nicht gestartet werden.",
    });
  }
}

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("App-Root #app wurde nicht gefunden.");
}

const ui = createUI(appRoot, {
  onPickDirectory: handlePickDirectory,
  onRefreshScan: handleRefreshScan,
  onResetAssignments: handleResetAssignments,
  onSearchChange: handleSearchChange,
  onAssignedOnlyChange: handleAssignedOnlyChange,
  onSlotCounterChange: handleSlotCounterChange,
  onSlotCounterAdjust: handleSlotCounterAdjust,
  onSlotCategoryActivate: handleSlotCategoryActivate,
  onLoopEnabledChange: handleLoopEnabledChange,
  getPlaybackProgress: handlePlaybackProgress,
  onSelectSample: handleSelectSample,
  onWriteSample: handleWriteSample,
  onTogglePlay: handleTogglePlay,
});

store.subscribe((state) => {
  ui.render(state);

  if (state.selectedSampleId !== lastSelectedSampleId) {
    lastSelectedSampleId = state.selectedSampleId;
    void loadWaveformForSelection(state.selectedSampleId);
  }
});

commitState({
  error: isFileSystemAccessSupported()
    ? null
    : "Chrome oder Edge auf dem Desktop wird fuer diesen MVP benoetigt.",
});

void hydrateFromIndexedDb();
