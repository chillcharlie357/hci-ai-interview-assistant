export type VideoMetrics = {
  facePresent: boolean;
  brightness: number;
  blur: number;
  motion: number;
  gazeProxy?: number;
  headPoseProxy?: number;
  blinkProxy?: number;
  blinkCount?: number;
  blinkRatePerMinute?: number;
  eyeContactRatio?: number;
  gazeDeviationDeg?: number;
  eyeAspectRatio?: number;
  nodProxy?: number;
  handActivity?: number;
  bodyActivity?: number;
};

export type FaceLandmarkPoint = {
  x: number;
  y: number;
  z?: number;
};

export type FaceAnalysisState = {
  blinkCount: number;
  eyeContactFrames: number;
  analyzedFrames: number;
  earBaseline: number | null;
  stableEyeState: "open" | "closed" | "unknown";
  consecutiveOpenFrames: number;
  consecutiveClosedFrames: number;
  startedAtMs: number | null;
  lastTimestampMs: number | null;
};

export type FaceAnalysisMetrics = {
  facePresent: boolean;
  leftEyeOpen: boolean;
  rightEyeOpen: boolean;
  blinkDetected: boolean;
  blinkCount: number;
  blinkRatePerMinute: number;
  eyeContact: boolean;
  eyeContactRatio: number;
  gazeDeviationDeg: number | null;
  eyeAspectRatio: number | null;
  gazeProxy: number;
  headPoseProxy: number;
  blinkProxy: number;
};

export type VideoEventClassification = {
  eventType: "steady" | "face_missing" | "low_light" | "low_sharpness" | "high_motion" | "blink_detected" | "gaze_averted";
  confidence: number;
  shouldCaptureKeyframe: boolean;
  keyframeReason?: string;
};

const LEFT_EYE_EAR_INDICES = [33, 160, 158, 133, 153, 144] as const;
const RIGHT_EYE_EAR_INDICES = [362, 385, 387, 263, 373, 380] as const;
const LEFT_EYE_CENTER_INDICES = [33, 133, 159, 145] as const;
const RIGHT_EYE_CENTER_INDICES = [362, 263, 386, 374] as const;
const NOSE_TIP_INDEX = 1;
const MIN_EAR_BASELINE = 0.18;
const MAX_EAR_BASELINE = 0.36;
const EYE_CLOSED_RATIO = 0.67;
const EYE_OPEN_RATIO = 0.82;
const EYE_CONTACT_THRESHOLD_DEG = 10;
const YAW_ASYMMETRY_THRESHOLD = 0.18;
const ROLL_THRESHOLD_DEG = 12;
const STABLE_FRAME_COUNT = 2;

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

export function createFaceAnalysisState(): FaceAnalysisState {
  return {
    blinkCount: 0,
    eyeContactFrames: 0,
    analyzedFrames: 0,
    earBaseline: null,
    stableEyeState: "unknown",
    consecutiveOpenFrames: 0,
    consecutiveClosedFrames: 0,
    startedAtMs: null,
    lastTimestampMs: null
  };
}

export function analyzeFaceLandmarks(
  landmarks: FaceLandmarkPoint[] | null | undefined,
  timestampMs: number,
  previousState: FaceAnalysisState
): { state: FaceAnalysisState; metrics: FaceAnalysisMetrics } {
  if (!landmarks || landmarks.length <= NOSE_TIP_INDEX) {
    return {
      state: previousState,
      metrics: {
        facePresent: false,
        leftEyeOpen: false,
        rightEyeOpen: false,
        blinkDetected: false,
        blinkCount: previousState.blinkCount,
        blinkRatePerMinute: computeBlinkRate(previousState.blinkCount, previousState.startedAtMs, timestampMs),
        eyeContact: false,
        eyeContactRatio: ratio(previousState.eyeContactFrames, previousState.analyzedFrames),
        gazeDeviationDeg: null,
        eyeAspectRatio: null,
        gazeProxy: 0,
        headPoseProxy: previousState.analyzedFrames > 0 ? 1 - ratio(previousState.eyeContactFrames, previousState.analyzedFrames) : 0,
        blinkProxy: 0
      }
    };
  }

  const leftEar = computeEyeAspectRatio(samplePoints(landmarks, LEFT_EYE_EAR_INDICES));
  const rightEar = computeEyeAspectRatio(samplePoints(landmarks, RIGHT_EYE_EAR_INDICES));
  const averageEar = mean([leftEar, rightEar]);
  const previousBaseline = previousState.earBaseline ?? Math.max(averageEar, MIN_EAR_BASELINE);
  const earBaseline = updateEarBaseline(previousBaseline, averageEar);
  const leftEyeOpen = leftEar >= earBaseline * EYE_OPEN_RATIO;
  const rightEyeOpen = rightEar >= earBaseline * EYE_OPEN_RATIO;
  const bothEyesClosed = leftEar <= earBaseline * EYE_CLOSED_RATIO && rightEar <= earBaseline * EYE_CLOSED_RATIO;
  const gazeAnalysis = computeGazeAnalysis(landmarks);
  const gazeDeviationDeg = gazeAnalysis.deviationDeg;
  const eyeContact = gazeAnalysis.eyeContact;

  let nextState: FaceAnalysisState = {
    ...previousState,
    analyzedFrames: previousState.analyzedFrames + 1,
    eyeContactFrames: previousState.eyeContactFrames + (eyeContact ? 1 : 0),
    earBaseline,
    startedAtMs: previousState.startedAtMs ?? timestampMs,
    lastTimestampMs: timestampMs
  };

  if (bothEyesClosed) {
    nextState = {
      ...nextState,
      consecutiveClosedFrames: previousState.consecutiveClosedFrames + 1,
      consecutiveOpenFrames: 0
    };
  } else if (leftEyeOpen && rightEyeOpen) {
    nextState = {
      ...nextState,
      consecutiveOpenFrames: previousState.consecutiveOpenFrames + 1,
      consecutiveClosedFrames: 0
    };
  } else {
    nextState = {
      ...nextState,
      consecutiveOpenFrames: 0,
      consecutiveClosedFrames: 0
    };
  }

  let blinkDetected = false;
  if (nextState.consecutiveClosedFrames >= STABLE_FRAME_COUNT && nextState.stableEyeState !== "closed") {
    nextState = { ...nextState, stableEyeState: "closed" };
  }
  if (nextState.consecutiveOpenFrames >= STABLE_FRAME_COUNT) {
    if (previousState.stableEyeState === "closed") {
      blinkDetected = true;
      nextState = { ...nextState, stableEyeState: "open", blinkCount: previousState.blinkCount + 1 };
    } else if (nextState.stableEyeState === "unknown") {
      nextState = { ...nextState, stableEyeState: "open" };
    } else {
      nextState = { ...nextState, stableEyeState: "open" };
    }
  }

  return {
    state: nextState,
    metrics: {
      facePresent: true,
      leftEyeOpen,
      rightEyeOpen,
      blinkDetected,
      blinkCount: nextState.blinkCount,
      blinkRatePerMinute: computeBlinkRate(nextState.blinkCount, nextState.startedAtMs, timestampMs),
      eyeContact,
      eyeContactRatio: ratio(nextState.eyeContactFrames, nextState.analyzedFrames),
      gazeDeviationDeg,
      eyeAspectRatio: averageEar,
      gazeProxy: typeof gazeDeviationDeg === "number" ? clamp01(1 - gazeDeviationDeg / 18) : 0,
      headPoseProxy: typeof gazeDeviationDeg === "number" ? clamp01(gazeDeviationDeg / 22) : 0,
      blinkProxy: blinkDetected ? 1 : bothEyesClosed ? 0.8 : 0.05
    }
  };
}

export function mergeFaceMetrics(videoMetrics: VideoMetrics, faceMetrics: FaceAnalysisMetrics): VideoMetrics {
  return {
    ...videoMetrics,
    facePresent: faceMetrics.facePresent,
    gazeProxy: faceMetrics.gazeProxy,
    headPoseProxy: faceMetrics.headPoseProxy,
    blinkProxy: faceMetrics.blinkProxy,
    blinkCount: faceMetrics.blinkCount,
    blinkRatePerMinute: faceMetrics.blinkRatePerMinute,
    eyeContactRatio: faceMetrics.eyeContactRatio,
    gazeDeviationDeg: faceMetrics.gazeDeviationDeg,
    eyeAspectRatio: faceMetrics.eyeAspectRatio
  };
}

export function classifyAttentionEvent(
  quality: VideoEventClassification,
  faceMetrics: FaceAnalysisMetrics
): VideoEventClassification {
  if (quality.eventType !== "steady") {
    return quality;
  }
  if (faceMetrics.blinkDetected) {
    return {
      eventType: "blink_detected",
      confidence: 0.9,
      shouldCaptureKeyframe: false
    };
  }
  if (faceMetrics.facePresent && !faceMetrics.eyeContact && typeof faceMetrics.gazeDeviationDeg === "number") {
    return {
      eventType: "gaze_averted",
      confidence: clamp01(faceMetrics.gazeDeviationDeg / 30),
      shouldCaptureKeyframe: false
    };
  }
  return quality;
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

function computeGazeAnalysis(landmarks: FaceLandmarkPoint[]): { deviationDeg: number | null; eyeContact: boolean } {
  const leftEyeCenter = computeCenter(samplePoints(landmarks, LEFT_EYE_CENTER_INDICES));
  const rightEyeCenter = computeCenter(samplePoints(landmarks, RIGHT_EYE_CENTER_INDICES));
  const noseTip = landmarks[NOSE_TIP_INDEX];
  if (!leftEyeCenter || !rightEyeCenter || !noseTip) {
    return { deviationDeg: null, eyeContact: false };
  }
  const leftToNose = Math.abs(noseTip.x - leftEyeCenter.x);
  const noseToRight = Math.abs(rightEyeCenter.x - noseTip.x);
  const meanHorizontalDistance = (leftToNose + noseToRight) / 2;
  if (meanHorizontalDistance === 0) {
    return { deviationDeg: null, eyeContact: false };
  }
  const yawAsymmetry = Math.abs(leftToNose - noseToRight) / meanHorizontalDistance;
  const rollDeg = Math.abs(Math.atan2(rightEyeCenter.y - leftEyeCenter.y, rightEyeCenter.x - leftEyeCenter.x) * (180 / Math.PI));
  const yawDeg = yawAsymmetry * 45;
  const deviationDeg = Math.max(yawDeg, rollDeg * 0.8);
  return {
    deviationDeg,
    eyeContact: yawAsymmetry <= YAW_ASYMMETRY_THRESHOLD && rollDeg <= ROLL_THRESHOLD_DEG && deviationDeg <= EYE_CONTACT_THRESHOLD_DEG
  };
}

function computeEyeAspectRatio(points: FaceLandmarkPoint[]): number {
  if (points.length < 6) {
    return 0;
  }
  const verticalA = distance(points[1], points[5]);
  const verticalB = distance(points[2], points[4]);
  const horizontal = distance(points[0], points[3]);
  if (horizontal === 0) {
    return 0;
  }
  return (verticalA + verticalB) / (2 * horizontal);
}

function computeCenter(points: FaceLandmarkPoint[]): FaceLandmarkPoint | null {
  if (points.length === 0) {
    return null;
  }
  const total = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: (acc.z ?? 0) + (point.z ?? 0) }),
    { x: 0, y: 0, z: 0 }
  );
  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: (total.z ?? 0) / points.length
  };
}

function samplePoints(landmarks: FaceLandmarkPoint[], indices: readonly number[]): FaceLandmarkPoint[] {
  return indices.map((index) => landmarks[index]).filter((point): point is FaceLandmarkPoint => Boolean(point));
}

function distance(a: FaceLandmarkPoint, b: FaceLandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function updateEarBaseline(previousBaseline: number, currentEar: number): number {
  const baseline = Math.max(MIN_EAR_BASELINE, Math.min(MAX_EAR_BASELINE, previousBaseline));
  if (currentEar >= baseline * 0.9) {
    return baseline * 0.9 + currentEar * 0.1;
  }
  return baseline;
}

function computeBlinkRate(blinkCount: number, startedAtMs: number | null, timestampMs: number): number {
  const elapsedMinutes = startedAtMs === null ? 0 : Math.max((timestampMs - startedAtMs) / 60000, 0);
  if (elapsedMinutes === 0) {
    return blinkCount > 0 ? blinkCount * 60 : 0;
  }
  return blinkCount / elapsedMinutes;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? clamp01(numerator / denominator) : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
