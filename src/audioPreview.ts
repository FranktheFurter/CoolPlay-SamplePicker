import type { WaveformPreview } from "./types";

interface PlaybackSample {
  id: string;
  name: string;
}

const WAVEFORM_POINT_COUNT = 960;

function createWaveformPeaks(
  audioBuffer: AudioBuffer,
  pointCount: number,
): number[] {
  const sampleCount = audioBuffer.length;

  if (sampleCount === 0) {
    return Array.from({ length: pointCount }, () => 0);
  }

  const blockSize = Math.max(1, Math.floor(sampleCount / pointCount));
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index),
  );
  const peaks = new Array<number>(pointCount).fill(0);

  for (let i = 0; i < pointCount; i += 1) {
    const start = i * blockSize;

    if (start >= sampleCount) {
      break;
    }

    const end =
      i === pointCount - 1
        ? sampleCount
        : Math.min(sampleCount, start + blockSize);
    let maxPeak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      for (const channel of channels) {
        const amplitude = Math.abs(channel[sampleIndex] ?? 0);

        if (amplitude > maxPeak) {
          maxPeak = amplitude;
        }
      }
    }

    peaks[i] = maxPeak;
  }

  const globalPeak = Math.max(...peaks);

  if (globalPeak > 0) {
    return peaks.map((value) => Math.min(1, value / globalPeak));
  }

  return peaks;
}

export class AudioPreviewController {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private currentSampleId: string | null = null;
  private waveformRequestToken = 0;

  constructor(
    private readonly onPlaybackChange: (sampleId: string | null) => void,
    private readonly onWaveformChange: (waveform: WaveformPreview | null) => void,
  ) {}

  async toggle(
    sample: PlaybackSample,
    getFile: () => Promise<File>,
  ): Promise<void> {
    if (
      this.currentSampleId === sample.id &&
      this.audio &&
      !this.audio.paused
    ) {
      this.stop();
      return;
    }

    this.stop();

    const file = await getFile();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);

    audio.addEventListener("ended", () => {
      this.clear();
    });

    audio.addEventListener("error", () => {
      this.clear();
    });

    this.audio = audio;
    this.objectUrl = url;
    this.currentSampleId = sample.id;
    this.onPlaybackChange(sample.id);

    const token = ++this.waveformRequestToken;
    void this.prepareWaveform(sample, file, token);

    try {
      await audio.play();
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }

    this.clear();
  }

  private async prepareWaveform(
    sample: PlaybackSample,
    file: File,
    token: number,
  ): Promise<void> {
    let audioContext: AudioContext | null = null;

    try {
      audioContext = new AudioContext();
      const encodedBuffer = await file.arrayBuffer();
      const decodedBuffer = await audioContext.decodeAudioData(
        encodedBuffer.slice(0),
      );

      if (token !== this.waveformRequestToken || this.currentSampleId !== sample.id) {
        return;
      }

      this.onWaveformChange({
        sampleId: sample.id,
        sampleName: sample.name,
        durationSeconds: decodedBuffer.duration,
        peaks: createWaveformPeaks(decodedBuffer, WAVEFORM_POINT_COUNT),
      });
    } catch {
      if (token === this.waveformRequestToken && this.currentSampleId === sample.id) {
        this.onWaveformChange(null);
      }
    } finally {
      if (audioContext) {
        void audioContext.close();
      }
    }
  }

  private clear(): void {
    this.waveformRequestToken += 1;

    if (this.audio) {
      this.audio.src = "";
      this.audio = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    if (this.currentSampleId !== null) {
      this.currentSampleId = null;
      this.onPlaybackChange(null);
    }

    this.onWaveformChange(null);
  }
}
