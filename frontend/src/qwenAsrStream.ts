/**
 * 通过后端 WebSocket (backend/asr/qwen_realtime.py) 连接 DashScope
 * Qwen3-ASR-Flash-Realtime，做实时字幕。
 *
 * 交互协议见后端 docstring。本模块职责：
 *   1. 用 AudioContext + ScriptProcessor 从麦克风抽出单声道 Float32 PCM；
 *   2. 线性重采样到 16kHz，转 Int16 LE；
 *   3. 按 ~100ms 打包通过 WebSocket 发给后端；
 *   4. 把服务端 interim / final 回调暴露给 UI。
 *
 * 与旧的 createSpeechTranscriber 保持相近接口（supported / start / stop），
 * 方便 InterviewPage 以最小改动切换。
 */

export type AsrStreamCallbacks = {
  /** 每一段 VAD 完整片段的最终文本（已稳定） */
  onFinal: (text: string) => void;
  /** 尚未最终化的增量文本；下一次会被覆盖，不要拼接 */
  onInterim?: (text: string) => void;
  /** 服务端就绪，可以开始讲话 */
  onReady?: () => void;
  /** 识别出错或连接失败 */
  onError?: (message: string) => void;
  /** 服务端 VAD 事件，可选用作 UI hint */
  onSpeechStart?: () => void;
  onSpeechStop?: () => void;
  /** 连接已关闭（本地或服务端主动） */
  onClosed?: () => void;
};

export interface QwenAsrStreamHandle {
  supported: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const TARGET_SAMPLE_RATE = 16_000;
const SCRIPT_NODE_BUFFER = 4096;
// DashScope 建议的 chunk 大小：16kHz * 16bit * 0.1s = 3200 bytes
const FRAME_SAMPLES_16K = 1600;

export function getAsrWebSocketUrl(): string {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;
  const explicit = env?.VITE_ASR_WS_URL?.trim();
  if (explicit) return explicit;
  if (typeof window !== "undefined" && window.location) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.hostname}:8765/`;
  }
  return "ws://127.0.0.1:8765/";
}

export function isQwenAsrSupported(): boolean {
  if (typeof window === "undefined") return false;
  const AnyWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return Boolean(
    window.WebSocket &&
      navigator?.mediaDevices?.getUserMedia &&
      (window.AudioContext || AnyWindow.webkitAudioContext)
  );
}

/**
 * 创建一个基于 Qwen3-ASR 的实时转写会话。
 *
 * 与旧的 createSpeechTranscriber 不同，这里需要自己管 `MediaStream`：
 * 传入 `stream` 由调用方负责采集（通常就是 getUserMedia 拿到的那条），
 * stop 时调用方自行停 track（与 webspeech 版保持一致）。
 */
export function createQwenAsrStream(
  stream: MediaStream,
  callbacks: AsrStreamCallbacks,
  options: { wsUrl?: string } = {}
): QwenAsrStreamHandle {
  if (!isQwenAsrSupported()) {
    return {
      supported: false,
      async start() {
        callbacks.onError?.("当前浏览器不支持 WebSocket / AudioContext。");
      },
      async stop() {
        /* noop */
      },
    };
  }

  const wsUrl = options.wsUrl ?? getAsrWebSocketUrl();
  let audioContext: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let socket: WebSocket | null = null;
  let stopped = false;
  let resampleBuffer: Float32Array = new Float32Array(0);
  /** 下一次重采样的"输入样本坐标"（可能是小数），跨 buffer 保留以避免错位 */
  let resampleCursor = 0;

  const appendToResampleBuffer = (chunk: Float32Array) => {
    const merged = new Float32Array(resampleBuffer.length + chunk.length);
    merged.set(resampleBuffer, 0);
    merged.set(chunk, resampleBuffer.length);
    resampleBuffer = merged;
  };

  const flushResampledFrames = (inputSampleRate: number) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
    const out: number[] = [];
    while (true) {
      const nextIndex = resampleCursor + out.length * ratio;
      const floor = Math.floor(nextIndex);
      const ceil = floor + 1;
      if (ceil >= resampleBuffer.length) break;
      const frac = nextIndex - floor;
      const sample =
        resampleBuffer[floor] * (1 - frac) + resampleBuffer[ceil] * frac;
      out.push(sample);
      if (out.length >= FRAME_SAMPLES_16K) {
        // 达到 100ms，发一包
        const int16 = new Int16Array(out.length);
        for (let i = 0; i < out.length; i += 1) {
          const s = Math.max(-1, Math.min(1, out[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        try {
          socket.send(int16.buffer);
        } catch {
          /* ignore */
        }
        resampleCursor += out.length * ratio;
        out.length = 0;
      }
    }
    // 消化掉已经用过的输入样本，避免 buffer 无限增长
    const consumedInput = Math.floor(resampleCursor);
    if (consumedInput > 0) {
      resampleBuffer = resampleBuffer.slice(consumedInput);
      resampleCursor -= consumedInput;
    }
    // out 里未满 100ms 的余数保留在 resampleBuffer 里，下轮继续
  };

  const handleMessage = (raw: string) => {
    let event: { type?: string; text?: string; message?: string };
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    switch (event.type) {
      case "ready":
        callbacks.onReady?.();
        return;
      case "interim":
        if (typeof event.text === "string") callbacks.onInterim?.(event.text);
        return;
      case "final":
        if (typeof event.text === "string" && event.text.trim()) {
          callbacks.onFinal(event.text.trim());
        }
        return;
      case "speech_started":
        callbacks.onSpeechStart?.();
        return;
      case "speech_stopped":
        callbacks.onSpeechStop?.();
        return;
      case "error":
        callbacks.onError?.(event.message || "语音识别服务返回错误。");
        return;
      case "closed":
        callbacks.onClosed?.();
        return;
      default:
        return;
    }
  };

  const start = async () => {
    if (stopped) return;
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      callbacks.onError?.("当前浏览器不支持 AudioContext。");
      return;
    }
    audioContext = new AudioContextCtor();
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch {
        /* ignore */
      }
    }
    const inputSampleRate = audioContext.sampleRate;

    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(SCRIPT_NODE_BUFFER, 1, 1);

    try {
      socket = new WebSocket(wsUrl);
    } catch (error) {
      callbacks.onError?.(
        error instanceof Error ? error.message : "无法连接到语音识别服务。"
      );
      return;
    }
    socket.binaryType = "arraybuffer";
    socket.onmessage = (ev) => {
      if (typeof ev.data === "string") handleMessage(ev.data);
    };
    socket.onerror = () => {
      callbacks.onError?.("语音识别连接失败。");
    };
    socket.onclose = () => {
      callbacks.onClosed?.();
    };

    processor.onaudioprocess = (event) => {
      if (stopped) return;
      const input = event.inputBuffer.getChannelData(0);
      // 复制一份，避免 Web Audio 复用内部 buffer 导致数据串扰
      appendToResampleBuffer(new Float32Array(input));
      flushResampledFrames(inputSampleRate);
    };

    source.connect(processor);
    // Chromium 要求 processor 连到 destination 才会触发回调
    processor.connect(audioContext.destination);
  };

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      processor?.disconnect();
      source?.disconnect();
    } catch {
      /* ignore */
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "end" }));
      } catch {
        /* ignore */
      }
      // 给后端一点时间把 final 文本推上来再关
      await new Promise((resolve) => setTimeout(resolve, 600));
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
    try {
      await audioContext?.close();
    } catch {
      /* ignore */
    }
  };

  return { supported: true, start, stop };
}
