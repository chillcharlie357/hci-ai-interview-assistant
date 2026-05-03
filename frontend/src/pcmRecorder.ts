/**
 * 浏览器 PCM 采集器。
 *
 * 为什么不用 MediaRecorder+webm：
 * 非首个 webm/opus 分片缺少完整容器头，`AudioContext.decodeAudioData`
 * 经常抛 "Unable to decode audio data"，导致后端收到空数据、chunk_count 不增长。
 *
 * 这里直接通过 AudioContext + ScriptProcessor 拿到 Float32 PCM，
 * 累积到指定时长（默认 4 秒）后一次性打包为 16-bit PCM WAV，再回调给调用方。
 * 这样后端只要用标准库 wave 就能解码，完全不依赖 ffmpeg / opus。
 */

export type PcmChunkHandler = (wavBlob: Blob) => void;

export interface PcmRecorderHandle {
  stop: () => Promise<void>;
  sampleRate: number;
}

const DEFAULT_CHUNK_SEC = 4;
const SCRIPT_NODE_BUFFER = 4096;

export async function startPcmRecorder(
  stream: MediaStream,
  onChunk: PcmChunkHandler,
  options: { chunkSec?: number } = {}
): Promise<PcmRecorderHandle> {
  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("当前浏览器不支持 AudioContext，无法采集 PCM。");
  }

  const audioContext = new AudioContextCtor();
  // Safari 需要显式 resume
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      // ignore: 部分浏览器在非用户手势下 resume 会失败，继续尝试
    }
  }

  const sampleRate = audioContext.sampleRate;
  const chunkSamples = Math.max(1, Math.floor((options.chunkSec ?? DEFAULT_CHUNK_SEC) * sampleRate));

  const source = audioContext.createMediaStreamSource(stream);

  // ScriptProcessorNode 虽然被标记 deprecated，但在主流浏览器中仍可用，
  // 且无需额外 worklet 模块文件。若将来要上 AudioWorklet，可在此替换。
  const processor = audioContext.createScriptProcessor(SCRIPT_NODE_BUFFER, 1, 1);

  let buffer = new Float32Array(chunkSamples);
  let filled = 0;
  let stopped = false;

  const emit = (samples: Float32Array) => {
    const wavBlob = encodeWav(samples, sampleRate);
    try {
      onChunk(wavBlob);
    } catch {
      // 上层自行处理上传失败，不阻塞采集
    }
  };

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer.getChannelData(0);
    let offset = 0;
    while (offset < input.length) {
      const copy = Math.min(chunkSamples - filled, input.length - offset);
      buffer.set(input.subarray(offset, offset + copy), filled);
      filled += copy;
      offset += copy;
      if (filled >= chunkSamples) {
        emit(buffer);
        buffer = new Float32Array(chunkSamples);
        filled = 0;
      }
    }
  };

  source.connect(processor);
  // 连接到 destination 才会触发 onaudioprocess（Chromium 要求）
  processor.connect(audioContext.destination);

  return {
    sampleRate,
    async stop() {
      if (stopped) return;
      stopped = true;
      try {
        processor.disconnect();
        source.disconnect();
      } catch {
        // ignore
      }
      if (filled > 0) {
        emit(buffer.subarray(0, filled));
        filled = 0;
      }
      try {
        await audioContext.close();
      } catch {
        // ignore
      }
    }
  };
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const wavBuffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(wavBuffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([wavBuffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
