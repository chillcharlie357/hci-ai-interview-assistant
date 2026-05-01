import { describe, expect, it } from "vitest";

import {
  classifyVideoEvent,
  computeBrightness,
  computeBlurProxy,
  computeMotionAmount
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
});
