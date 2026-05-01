export type VideoMetrics = {
  facePresent: boolean;
  brightness: number;
  blur: number;
  motion: number;
  gazeProxy?: number;
  headPoseProxy?: number;
  blinkProxy?: number;
  nodProxy?: number;
  handActivity?: number;
  bodyActivity?: number;
};

export type VideoEventClassification = {
  eventType: "steady" | "face_missing" | "low_light" | "low_sharpness" | "high_motion";
  confidence: number;
  shouldCaptureKeyframe: boolean;
  keyframeReason?: string;
};

export function computeBrightness(pixels: Uint8ClampedArray): number {
  if (pixels.length === 0) {
    return 0;
  }

  let total = 0;
  let pixelCount = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    total += pixels[index] + pixels[index + 1] + pixels[index + 2];
    pixelCount += 1;
  }
  return clamp01(total / (pixelCount * 3 * 255));
}

export function computeMotionAmount(current: Uint8ClampedArray, previous?: Uint8ClampedArray | null): number {
  if (!previous || previous.length === 0 || previous.length !== current.length) {
    return 0;
  }

  let totalDifference = 0;
  let channelCount = 0;
  for (let index = 0; index < current.length; index += 4) {
    totalDifference += Math.abs(current[index] - previous[index]);
    totalDifference += Math.abs(current[index + 1] - previous[index + 1]);
    totalDifference += Math.abs(current[index + 2] - previous[index + 2]);
    channelCount += 3;
  }
  return clamp01(totalDifference / (channelCount * 255));
}

export function computeBlurProxy(pixels: Uint8ClampedArray): number {
  if (pixels.length < 8) {
    return 0;
  }

  let totalEdgeDifference = 0;
  let comparisons = 0;
  let previousLuma = luminanceAt(pixels, 0);
  for (let index = 4; index < pixels.length; index += 4) {
    const currentLuma = luminanceAt(pixels, index);
    totalEdgeDifference += Math.abs(currentLuma - previousLuma);
    previousLuma = currentLuma;
    comparisons += 1;
  }
  return clamp01(totalEdgeDifference / (comparisons * 255));
}

export function classifyVideoEvent(metrics: Pick<VideoMetrics, "brightness" | "blur" | "motion" | "facePresent">): VideoEventClassification {
  if (!metrics.facePresent) {
    return {
      eventType: "face_missing",
      confidence: 0.75,
      shouldCaptureKeyframe: true,
      keyframeReason: "face_missing"
    };
  }

  if (metrics.brightness < 0.2) {
    return {
      eventType: "low_light",
      confidence: clamp01(1 - metrics.brightness / 0.2),
      shouldCaptureKeyframe: true,
      keyframeReason: "low_light"
    };
  }

  if (metrics.blur < 0.04) {
    return {
      eventType: "low_sharpness",
      confidence: clamp01(1 - metrics.blur / 0.04),
      shouldCaptureKeyframe: true,
      keyframeReason: "low_sharpness"
    };
  }

  if (metrics.motion > 0.6) {
    return {
      eventType: "high_motion",
      confidence: clamp01(metrics.motion),
      shouldCaptureKeyframe: true,
      keyframeReason: "high_motion"
    };
  }

  return {
    eventType: "steady",
    confidence: 0.5,
    shouldCaptureKeyframe: false
  };
}

export function buildVideoMetrics(current: Uint8ClampedArray, previous?: Uint8ClampedArray | null): VideoMetrics {
  const brightness = computeBrightness(current);
  const motion = computeMotionAmount(current, previous);
  const blur = computeBlurProxy(current);
  return {
    facePresent: brightness > 0.06,
    brightness,
    blur,
    motion,
    gazeProxy: clamp01(1 - motion * 1.5),
    headPoseProxy: clamp01(motion * 1.2),
    blinkProxy: brightness < 0.16 ? 0.35 : 0.05,
    nodProxy: clamp01(motion),
    handActivity: clamp01(motion * 1.4),
    bodyActivity: clamp01(motion * 1.1)
  };
}

export async function loadOptionalVisionTasks() {
  try {
    return await import("@mediapipe/tasks-vision");
  } catch {
    return null;
  }
}

function luminanceAt(pixels: Uint8ClampedArray, index: number): number {
  return 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
