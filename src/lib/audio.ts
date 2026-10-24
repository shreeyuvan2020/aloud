/**
 * MediaRecorder emits webm/opus, which the transcription model does not reliably
 * accept. Decode to PCM and re-wrap as 16-bit mono WAV at 16 kHz.
 */
export async function blobToWavDataUri(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }

  const targetRate = 16000;
  const samples = resample(decoded, targetRate);
  const pcm = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(pcm);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  const base64 = bytesToBase64(new Uint8Array(pcm));
  return `data:audio/wav;base64,${base64}`;
}

/** Chunked — spreading ~1 MB into String.fromCharCode overflows the stack. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function resample(buffer: AudioBuffer, targetRate: number): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = Math.ceil((buffer.duration * targetRate));

  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const src = (i / targetRate) * buffer.sampleRate;
      const idx = Math.floor(src);
      const frac = src - idx;
      const a = data[idx] ?? 0;
      const b = data[idx + 1] ?? a;
      mono[i] += (a + (b - a) * frac) / channels;
    }
  }
  return mono;
}