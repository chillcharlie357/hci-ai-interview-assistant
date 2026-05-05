import { describe, expect, it } from "vitest";

import {
  analyzeFaceLandmarks,
  classifyVideoEvent,
  computeBrightness,
  computeBlurProxy,
  computeMotionAmount,
  createFaceAnalysisState,
  mergeFaceMetrics,
  buildVideoMetrics
} from "./videoAnalyzer";

describe("videoAnalyzer pure metrics", () => {
  it("computes normalized brightness", () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255
    ]);

    expect(computeBrightness(pixels)).toBeCloseTo(0.5, 2);
  });

  it("computes motion amount between frames", () => {
    const previous = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255]);
    const current = new Uint8ClampedArray([0, 0, 0, 255, 110, 110, 110, 255]);

    expect(computeMotionAmount(current, previous)).toBeGreaterThan(0.15);
  });

  it("classifies low light and high motion events", () => {
    expect(classifyVideoEvent({ brightness: 0.12, blur: 0.3, motion: 0.1, facePresent: true }).eventType).toBe("low_light");
    expect(classifyVideoEvent({ brightness: 0.5, blur: 0.3, motion: 0.75, facePresent: true }).eventType).toBe("high_motion");
  });

  it("uses edge differences as blur proxy", () => {
    const sharp = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);
    const flat = new Uint8ClampedArray([
      120, 120, 120, 255,
      122, 122, 122, 255,
      121, 121, 121, 255
    ]);

    expect(computeBlurProxy(sharp)).toBeGreaterThan(computeBlurProxy(flat));
  });

  it("counts a full blink after open to closed to open frames", () => {
    const openFace = createFaceLandmarks(0.28, 0.28);
    const closedFace = createFaceLandmarks(0.08, 0.08);
    let state = createFaceAnalysisState();

    state = analyzeFaceLandmarks(openFace, 0, state).state;
    state = analyzeFaceLandmarks(openFace, 100, state).state;
    state = analyzeFaceLandmarks(closedFace, 200, state).state;
    state = analyzeFaceLandmarks(closedFace, 300, state).state;
    state = analyzeFaceLandmarks(openFace, 400, state).state;
    const finalFrame = analyzeFaceLandmarks(openFace, 500, state);

    expect(finalFrame.metrics.blinkCount).toBe(1);
    expect(finalFrame.metrics.blinkRatePerMinute).toBeGreaterThan(0);
  });

  it("computes eye contact ratio from face axis deviation", () => {
    let state = createFaceAnalysisState();
    state = analyzeFaceLandmarks(createFaceLandmarks(0.28, 0.28), 0, state).state;
    const deviated = analyzeFaceLandmarks(createFaceLandmarks(0.28, 0.28, { noseX: 0.57 }), 100, state);

    expect(deviated.metrics.gazeDeviationDeg).toBeGreaterThan(10);
    expect(deviated.metrics.eyeContactRatio).toBeLessThan(1);
    expect(deviated.metrics.eyeContact).toBe(false);
  });

  it("keeps eye contact when face remains centered", () => {
    const centered = analyzeFaceLandmarks(createFaceLandmarks(0.28, 0.28), 100, createFaceAnalysisState());

    expect(centered.metrics.eyeContact).toBe(true);
    expect(centered.metrics.eyeContactRatio).toBe(1);
  });

  it("merges face analysis into video metrics", () => {
    const baseMetrics = buildVideoMetrics(
      new Uint8ClampedArray([120, 120, 120, 255, 130, 130, 130, 255]),
      new Uint8ClampedArray([118, 118, 118, 255, 128, 128, 128, 255])
    );
    const faceFrame = analyzeFaceLandmarks(createFaceLandmarks(0.28, 0.28), 1000, createFaceAnalysisState());
    const merged = mergeFaceMetrics(baseMetrics, faceFrame.metrics);

    expect(merged.blinkCount).toBe(0);
    expect(merged.eyeContactRatio).toBeGreaterThan(0.9);
    expect(merged.gazeDeviationDeg).toBeLessThan(10);
  });
});

function createFaceLandmarks(
  leftEyeEar: number,
  rightEyeEar: number,
  offsets: {
    leftEyeY?: number;
    rightEyeY?: number;
    noseX?: number;
    noseY?: number;
    chinX?: number;
    chinY?: number;
    leftEyeX?: number;
    rightEyeX?: number;
  } = {}
) {
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const leftEyeY = offsets.leftEyeY ?? 0.4;
  const rightEyeY = offsets.rightEyeY ?? 0.4;
  const leftEyeX = offsets.leftEyeX ?? 0.35;
  const rightEyeX = offsets.rightEyeX ?? 0.65;
  const leftEyeVerticalHalf = leftEyeEar * 0.06;
  const rightEyeVerticalHalf = rightEyeEar * 0.06;

  setEye(landmarks, [33, 160, 158, 133, 153, 144], leftEyeX, leftEyeY, leftEyeEar);
  setEye(landmarks, [362, 385, 387, 263, 373, 380], rightEyeX, rightEyeY, rightEyeEar);
  setPoint(landmarks, 159, leftEyeX, leftEyeY - leftEyeVerticalHalf);
  setPoint(landmarks, 145, leftEyeX, leftEyeY + leftEyeVerticalHalf);
  setPoint(landmarks, 386, rightEyeX, rightEyeY - rightEyeVerticalHalf);
  setPoint(landmarks, 374, rightEyeX, rightEyeY + rightEyeVerticalHalf);
  setPoint(landmarks, 1, offsets.noseX ?? 0.5, offsets.noseY ?? 0.52);
  setPoint(landmarks, 152, offsets.chinX ?? 0.5, offsets.chinY ?? 0.8);

  return landmarks;
}

function setEye(
  landmarks: Array<{ x: number; y: number; z: number }>,
  indices: readonly number[],
  centerX: number,
  centerY: number,
  eyeAspectRatio: number
) {
  const horizontalHalf = 0.06;
  const verticalHalf = eyeAspectRatio * horizontalHalf;
  setPoint(landmarks, indices[0], centerX - horizontalHalf, centerY);
  setPoint(landmarks, indices[3], centerX + horizontalHalf, centerY);
  setPoint(landmarks, indices[1], centerX - horizontalHalf / 2, centerY - verticalHalf);
  setPoint(landmarks, indices[5], centerX - horizontalHalf / 2, centerY + verticalHalf);
  setPoint(landmarks, indices[2], centerX + horizontalHalf / 2, centerY - verticalHalf);
  setPoint(landmarks, indices[4], centerX + horizontalHalf / 2, centerY + verticalHalf);
}

function setPoint(landmarks: Array<{ x: number; y: number; z: number }>, index: number, x: number, y: number) {
  landmarks[index] = { x, y, z: 0 };
}
