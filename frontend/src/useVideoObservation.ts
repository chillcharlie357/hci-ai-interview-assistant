import { useEffect, useRef, useState } from "react";

import { submitVideoEvent, submitVideoFrame } from "./apiClient";
import {
  buildVideoMetrics,
  classifyVideoEvent,
  type VideoEventClassification,
  type VideoMetrics
} from "./videoAnalyzer";

export type VideoObservationStatus =
  | "disabled"
  | "idle"
  | "running"
  | "no_track"
  | "error";

export type UseVideoObservationOptions = {
  sessionId: string;
  enabled: boolean;
  /** LiveKit 本地摄像头 track 对应的 <video> 元素；可为 null 表示暂时拿不到 */
  videoEl: HTMLVideoElement | null;
  /** 抽帧间隔（毫秒），默认 500ms -> 2fps */
  sampleIntervalMs?: number;
  /** 同类事件最小冷却期（毫秒），避免一直刷同类 */
  eventCooldownMs?: number;
  /** steady 事件心跳间隔（毫秒），没啥异常也定期报一次“还在看着” */
  steadyHeartbeatMs?: number;
  /** 一次 session 最大关键帧张数，超过后本端不再上传 dataUrl（后端也会兜底） */
  maxKeyframes?: number;
  /** 缩略图帧上报间隔（毫秒），默认 2000ms。与事件判定解耦。 */
  frameUploadIntervalMs?: number;
  /** 降采样画布宽度 */
  sampleWidth?: number;
  /** 降采样画布高度 */
  sampleHeight?: number;
};

export type UseVideoObservationState = {
  status: VideoObservationStatus;
  lastEventType: string | null;
  eventCount: number;
  keyframeCount: number;
  frameCount: number;
  lastError: string | null;
};

type NormalizedConfig = {
  sampleIntervalMs: number;
  eventCooldownMs: number;
  steadyHeartbeatMs: number;
  maxKeyframes: number;
  frameUploadIntervalMs: number;
  sampleWidth: number;
  sampleHeight: number;
};

const DEFAULTS: NormalizedConfig = {
  sampleIntervalMs: 500,
  eventCooldownMs: 5000,
  steadyHeartbeatMs: 30000,
  maxKeyframes: 60,
  frameUploadIntervalMs: 2000,
  sampleWidth: 192,
  sampleHeight: 108
};

/** 判断是否应该把某一次分类结果上报。与时钟解耦、纯函数、好测。 */
export function shouldEmitEvent(
  classification: Pick<VideoEventClassification, "eventType">,
  now: number,
  lastEmittedAt: Map<string, number>,
  config: Pick<NormalizedConfig, "eventCooldownMs" | "steadyHeartbeatMs">
): boolean {
  const lastAt = lastEmittedAt.get(classification.eventType);
  if (classification.eventType === "steady") {
    return lastAt === undefined || now - lastAt >= config.steadyHeartbeatMs;
  }
  return lastAt === undefined || now - lastAt >= config.eventCooldownMs;
}

export type VideoObservationTickerDeps = {
  submitEvent: (payload: {
    timestamp: number;
    eventType: string;
    confidence: number;
    metrics: VideoMetrics;
    keyframe?: { reason: string; dataUrl: string };
  }) => Promise<unknown>;
  submitFrame: (payload: { timestamp: number; dataUrl: string; metrics: VideoMetrics }) => Promise<unknown>;
  now: () => number;
  encodeFrame: () => string | null;
  readPixels: () => Uint8ClampedArray | null;
};

export type VideoObservationTickCallbacks = {
  onEvent?: (eventType: string) => void;
  onKeyframe?: () => void;
  onFrame?: () => void;
  onError?: (message: string) => void;
};

/**
 * 与 React 解耦的单次抽帧节拍。hook 内部与单测都使用它。
 *
 * 语义：
 * - 每次 tick 取一帧像素（复用 canvas），先算指标 + 分类；
 * - 事件轨：通过 shouldEmitEvent 节流后上报到 /video-events，
 *   异常事件首次触发时额外附带 keyframe（高保真 base64 原图）；
 * - 帧轨：按 frameUploadIntervalMs 的节拍上传一张低分辨率缩略图到 /video-frames，
 *   这条轨是稠密的、不带事件语义、用来做时间线回看。
 */
export function createVideoObservationTicker(
  deps: VideoObservationTickerDeps,
  config: NormalizedConfig,
  callbacks: VideoObservationTickCallbacks = {}
) {
  let previousPixels: Uint8ClampedArray | null = null;
  const lastEmittedAt = new Map<string, number>();
  let lastFrameUploadedAt: number | null = null;
  let keyframeUsed = 0;
  let eventInFlight = false;
  let frameInFlight = false;

  return {
    async tick(): Promise<{ emittedEvent: boolean; uploadedFrame: boolean; eventType?: string; keyframe?: boolean }> {
      const pixels = deps.readPixels();
      if (!pixels) {
        return { emittedEvent: false, uploadedFrame: false };
      }
      const metrics = buildVideoMetrics(pixels, previousPixels);
      previousPixels = new Uint8ClampedArray(pixels);
      const classification = classifyVideoEvent({
        brightness: metrics.brightness,
        blur: metrics.blur,
        motion: metrics.motion,
        facePresent: metrics.facePresent
      });
      const now = deps.now();

      // --- 帧轨：按固定节拍上报缩略图（独立冷却） ---
      let uploadedFrame = false;
      if (
        !frameInFlight &&
        (lastFrameUploadedAt === null || now - lastFrameUploadedAt >= config.frameUploadIntervalMs)
      ) {
        const dataUrl = deps.encodeFrame();
        if (dataUrl) {
          lastFrameUploadedAt = now; // 乐观推进，失败也不重试，避免堆积
          frameInFlight = true;
          try {
            await deps.submitFrame({ timestamp: now / 1000, dataUrl, metrics });
            callbacks.onFrame?.();
            uploadedFrame = true;
          } catch (frameError) {
            const message = frameError instanceof Error ? frameError.message : "frame upload failed";
            callbacks.onError?.(message);
          } finally {
            frameInFlight = false;
          }
        }
      }

      // --- 事件轨：节流判定 ---
      if (eventInFlight || !shouldEmitEvent(classification, now, lastEmittedAt, config)) {
        return { emittedEvent: false, uploadedFrame };
      }
      lastEmittedAt.set(classification.eventType, now);

      let keyframe: { reason: string; dataUrl: string } | undefined;
      if (
        classification.shouldCaptureKeyframe &&
        classification.keyframeReason &&
        keyframeUsed < config.maxKeyframes
      ) {
        const dataUrl = deps.encodeFrame();
        if (dataUrl) {
          keyframe = { reason: classification.keyframeReason, dataUrl };
          keyframeUsed += 1;
        }
      }

      eventInFlight = true;
      try {
        await deps.submitEvent({
          timestamp: now / 1000,
          eventType: classification.eventType,
          confidence: classification.confidence,
          metrics,
          keyframe
        });
        callbacks.onEvent?.(classification.eventType);
        if (keyframe) {
          callbacks.onKeyframe?.();
        }
        return {
          emittedEvent: true,
          uploadedFrame,
          eventType: classification.eventType,
          keyframe: Boolean(keyframe)
        };
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : "submit failed";
        callbacks.onError?.(message);
        return { emittedEvent: false, uploadedFrame };
      } finally {
        eventInFlight = false;
      }
    },
    getKeyframeUsed(): number {
      return keyframeUsed;
    }
  };
}

/**
 * 在候选人端按固定节拍从 <video> 抽帧，计算视频观察指标并节流上报。
 *
 * 纯 side-effect hook：不渲染任何 DOM，不写磁盘。
 * - 事件轨：POST /api/sessions/{id}/video-events（稀疏、节流，异常首发带高保真关键帧）
 * - 帧轨：POST /api/sessions/{id}/video-frames（稠密，按 frameUploadIntervalMs 节拍上报缩略图）
 */
export function useVideoObservation(options: UseVideoObservationOptions): UseVideoObservationState {
  const cfg: NormalizedConfig = {
    sampleIntervalMs: options.sampleIntervalMs ?? DEFAULTS.sampleIntervalMs,
    eventCooldownMs: options.eventCooldownMs ?? DEFAULTS.eventCooldownMs,
    steadyHeartbeatMs: options.steadyHeartbeatMs ?? DEFAULTS.steadyHeartbeatMs,
    maxKeyframes: options.maxKeyframes ?? DEFAULTS.maxKeyframes,
    frameUploadIntervalMs: options.frameUploadIntervalMs ?? DEFAULTS.frameUploadIntervalMs,
    sampleWidth: options.sampleWidth ?? DEFAULTS.sampleWidth,
    sampleHeight: options.sampleHeight ?? DEFAULTS.sampleHeight
  };

  const [status, setStatus] = useState<VideoObservationStatus>(options.enabled ? "idle" : "disabled");
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [keyframeCount, setKeyframeCount] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (!options.enabled) {
      setStatus("disabled");
      return;
    }
    if (!options.sessionId) {
      setStatus("idle");
      return;
    }
    if (!options.videoEl) {
      setStatus("no_track");
      return;
    }

    const videoEl = options.videoEl;

    if (!canvasRef.current) {
      const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!canvas) {
        setStatus("error");
        setLastError("canvas unavailable");
        return;
      }
      canvas.width = cfg.sampleWidth;
      canvas.height = cfg.sampleHeight;
      canvasRef.current = canvas;
      ctxRef.current = canvas.getContext("2d", { willReadFrequently: true });
    }
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) {
      setStatus("error");
      setLastError("canvas context unavailable");
      return;
    }

    setStatus("running");

    const ticker = createVideoObservationTicker(
      {
        now: () => Date.now(),
        submitEvent: (payload) => submitVideoEvent(options.sessionId, payload),
        submitFrame: (payload) => submitVideoFrame(options.sessionId, payload),
        encodeFrame: () => {
          try {
            return canvas.toDataURL("image/jpeg", 0.5);
          } catch (encodeError) {
            setLastError(encodeError instanceof Error ? encodeError.message : "toDataURL failed");
            return null;
          }
        },
        readPixels: () => {
          if (!videoEl.videoWidth || !videoEl.videoHeight || videoEl.paused || videoEl.ended) {
            return null;
          }
          try {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          } catch (drawError) {
            setLastError(drawError instanceof Error ? drawError.message : "drawImage failed");
            return null;
          }
          try {
            return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          } catch (readError) {
            setLastError(readError instanceof Error ? readError.message : "getImageData failed");
            return null;
          }
        }
      },
      cfg,
      {
        onEvent: (eventType) => {
          setLastEventType(eventType);
          setEventCount((prev) => prev + 1);
          setLastError(null);
        },
        onKeyframe: () => setKeyframeCount((prev) => prev + 1),
        onFrame: () => setFrameCount((prev) => prev + 1),
        onError: (message) => setLastError(message)
      }
    );

    const timer = window.setInterval(() => {
      void ticker.tick();
    }, cfg.sampleIntervalMs);

    return () => {
      window.clearInterval(timer);
      setStatus((prev) => (prev === "running" ? "idle" : prev));
    };
  }, [
    options.enabled,
    options.sessionId,
    options.videoEl,
    cfg.sampleIntervalMs,
    cfg.eventCooldownMs,
    cfg.steadyHeartbeatMs,
    cfg.maxKeyframes,
    cfg.frameUploadIntervalMs,
    cfg.sampleWidth,
    cfg.sampleHeight
  ]);

  return { status, lastEventType, eventCount, keyframeCount, frameCount, lastError };
}
