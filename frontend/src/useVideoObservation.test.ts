import { describe, expect, it, vi } from "vitest";

import { createVideoObservationTicker, shouldEmitEvent } from "./useVideoObservation";

const CONFIG = {
  sampleIntervalMs: 500,
  eventCooldownMs: 5000,
  steadyHeartbeatMs: 30000,
  maxKeyframes: 3,
  frameUploadIntervalMs: 2000,
  sampleWidth: 8,
  sampleHeight: 8
};

function darkPixels(size = 8 * 8): Uint8ClampedArray {
  // 全黑 + 不透明；buildVideoMetrics 里 brightness < 0.06 时 facePresent=false -> 归类 face_missing
  const arr = new Uint8ClampedArray(size * 4);
  for (let i = 0; i < size; i += 1) {
    arr[i * 4 + 3] = 255;
  }
  return arr;
}

function midPixels(size = 8 * 8): Uint8ClampedArray {
  // 中等亮度、能被识别为“有人 + steady”
  const arr = new Uint8ClampedArray(size * 4);
  for (let i = 0; i < size; i += 1) {
    arr[i * 4] = 140;
    arr[i * 4 + 1] = 140;
    arr[i * 4 + 2] = 140;
    arr[i * 4 + 3] = 255;
  }
  // 加一条高对比边缘以抬 blur 代理指标
  for (let i = 0; i < 8; i += 1) {
    arr[i * 4] = 10;
    arr[i * 4 + 1] = 10;
    arr[i * 4 + 2] = 10;
  }
  return arr;
}

function makeDeps(overrides: {
  now: () => number;
  readPixels: () => Uint8ClampedArray | null;
  submitEvent?: ReturnType<typeof vi.fn>;
  submitFrame?: ReturnType<typeof vi.fn>;
  encodeFrame?: ReturnType<typeof vi.fn>;
}) {
  return {
    submitEvent: overrides.submitEvent ?? vi.fn().mockResolvedValue({}),
    submitFrame: overrides.submitFrame ?? vi.fn().mockResolvedValue({}),
    now: overrides.now,
    encodeFrame: overrides.encodeFrame ?? vi.fn().mockReturnValue("data:image/jpeg;base64,FAKE"),
    readPixels: overrides.readPixels
  };
}

describe("shouldEmitEvent", () => {
  it("allows first emission and enforces cooldown for anomaly events", () => {
    const last = new Map<string, number>();
    expect(shouldEmitEvent({ eventType: "low_light" }, 1_000, last, CONFIG)).toBe(true);
    last.set("low_light", 1_000);
    expect(shouldEmitEvent({ eventType: "low_light" }, 2_000, last, CONFIG)).toBe(false);
    expect(shouldEmitEvent({ eventType: "low_light" }, 6_001, last, CONFIG)).toBe(true);
  });

  it("throttles steady events with heartbeat window", () => {
    const last = new Map<string, number>([["steady", 1_000]]);
    expect(shouldEmitEvent({ eventType: "steady" }, 10_000, last, CONFIG)).toBe(false);
    expect(shouldEmitEvent({ eventType: "steady" }, 31_001, last, CONFIG)).toBe(true);
  });
});

describe("createVideoObservationTicker - event track", () => {
  it("emits anomaly event with keyframe dataUrl on first detection", async () => {
    const submitEvent = vi.fn().mockResolvedValue({});
    const encode = vi.fn().mockReturnValue("data:image/jpeg;base64,FAKE");
    const onEvent = vi.fn();
    const onKeyframe = vi.fn();

    const ticker = createVideoObservationTicker(
      makeDeps({ now: () => 1_000, readPixels: () => darkPixels(), submitEvent, encodeFrame: encode }),
      CONFIG,
      { onEvent, onKeyframe }
    );

    const result = await ticker.tick();

    expect(result.emittedEvent).toBe(true);
    expect(result.eventType).toBe("face_missing");
    expect(result.keyframe).toBe(true);
    expect(submitEvent).toHaveBeenCalledTimes(1);
    const payload = submitEvent.mock.calls[0][0];
    expect(payload.eventType).toBe("face_missing");
    expect(payload.keyframe).toEqual({ reason: "face_missing", dataUrl: "data:image/jpeg;base64,FAKE" });
    expect(onEvent).toHaveBeenCalledWith("face_missing");
    expect(onKeyframe).toHaveBeenCalledTimes(1);
  });

  it("suppresses duplicate anomaly within cooldown window", async () => {
    const submitEvent = vi.fn().mockResolvedValue({});
    let currentNow = 1_000;
    const ticker = createVideoObservationTicker(
      makeDeps({ now: () => currentNow, readPixels: () => darkPixels(), submitEvent }),
      CONFIG,
      {}
    );

    await ticker.tick();
    currentNow = 1_500; // 冷却窗口内
    const second = await ticker.tick();

    expect(submitEvent).toHaveBeenCalledTimes(1);
    expect(second.emittedEvent).toBe(false);
  });

  it("enforces max keyframes: further anomalies are reported without dataUrl", async () => {
    const submitEvent = vi.fn().mockResolvedValue({});
    const encode = vi.fn().mockReturnValue("data:image/jpeg;base64,FAKE");
    let currentNow = 0;

    const ticker = createVideoObservationTicker(
      makeDeps({ now: () => currentNow, readPixels: () => darkPixels(), submitEvent, encodeFrame: encode }),
      { ...CONFIG, maxKeyframes: 2 },
      {}
    );

    // 每次推进 > eventCooldownMs 以突破节流
    for (let i = 0; i < 3; i += 1) {
      currentNow = i * 10_000 + 1;
      // eslint-disable-next-line no-await-in-loop
      await ticker.tick();
    }

    expect(submitEvent).toHaveBeenCalledTimes(3);
    expect(submitEvent.mock.calls[0][0].keyframe).toBeTruthy();
    expect(submitEvent.mock.calls[1][0].keyframe).toBeTruthy();
    expect(submitEvent.mock.calls[2][0].keyframe).toBeUndefined();
  });

  it("skips tick when no pixels are available", async () => {
    const submitEvent = vi.fn().mockResolvedValue({});
    const submitFrame = vi.fn().mockResolvedValue({});
    const ticker = createVideoObservationTicker(
      makeDeps({ now: () => 1_000, readPixels: () => null, submitEvent, submitFrame }),
      CONFIG,
      {}
    );

    const result = await ticker.tick();

    expect(result.emittedEvent).toBe(false);
    expect(result.uploadedFrame).toBe(false);
    expect(submitEvent).not.toHaveBeenCalled();
    expect(submitFrame).not.toHaveBeenCalled();
  });

  it("routes submission errors to onError and does not mark emitted", async () => {
    const submitEvent = vi.fn().mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    const ticker = createVideoObservationTicker(
      // 让第一次 tick 的 frame 上报成功，只让 event 失败，以便观察 onError 是否被事件轨触发
      makeDeps({
        now: () => 1_000,
        readPixels: () => darkPixels(),
        submitEvent,
        submitFrame: vi.fn().mockResolvedValue({})
      }),
      CONFIG,
      { onError }
    );

    const result = await ticker.tick();

    expect(result.emittedEvent).toBe(false);
    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("emits steady events after heartbeat window with no keyframe", async () => {
    const submitEvent = vi.fn().mockResolvedValue({});
    const encode = vi.fn().mockReturnValue("data:image/jpeg;base64,FAKE");
    let currentNow = 1_000;

    const ticker = createVideoObservationTicker(
      makeDeps({ now: () => currentNow, readPixels: () => midPixels(), submitEvent, encodeFrame: encode }),
      CONFIG,
      {}
    );

    const first = await ticker.tick();
    currentNow = 40_000;
    const second = await ticker.tick();

    expect(first.emittedEvent).toBe(true);
    expect(first.eventType).toBe("steady");
    expect(first.keyframe).toBe(false);
    expect(second.emittedEvent).toBe(true);
    expect(second.eventType).toBe("steady");
    // encodeFrame 在帧轨会被调，但不应有 keyframe payload
    const firstPayload = submitEvent.mock.calls[0][0];
    expect(firstPayload.keyframe).toBeUndefined();
  });
});

describe("createVideoObservationTicker - frame track", () => {
  it("uploads thumbnail frame on first tick and respects frame upload interval", async () => {
    const submitFrame = vi.fn().mockResolvedValue({});
    const submitEvent = vi.fn().mockResolvedValue({});
    let currentNow = 1_000;

    const ticker = createVideoObservationTicker(
      makeDeps({ now: () => currentNow, readPixels: () => midPixels(), submitEvent, submitFrame }),
      CONFIG,
      {}
    );

    const first = await ticker.tick();
    expect(first.uploadedFrame).toBe(true);
    expect(submitFrame).toHaveBeenCalledTimes(1);
    expect(submitFrame.mock.calls[0][0].dataUrl).toBe("data:image/jpeg;base64,FAKE");
    expect(submitFrame.mock.calls[0][0].timestamp).toBe(1);
    expect(submitFrame.mock.calls[0][0].metrics).toBeDefined();

    // 在 2s 节拍内再 tick，不应再传帧
    currentNow = 2_500;
    const second = await ticker.tick();
    expect(second.uploadedFrame).toBe(false);
    expect(submitFrame).toHaveBeenCalledTimes(1);

    // 超过 2s 节拍后应再传一帧
    currentNow = 3_500;
    const third = await ticker.tick();
    expect(third.uploadedFrame).toBe(true);
    expect(submitFrame).toHaveBeenCalledTimes(2);
  });

  it("reports frame via onFrame callback", async () => {
    const onFrame = vi.fn();
    const ticker = createVideoObservationTicker(
      makeDeps({ now: () => 1_000, readPixels: () => midPixels() }),
      CONFIG,
      { onFrame }
    );
    await ticker.tick();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it("frame track and event track are independent: no keyframe does not block frame upload", async () => {
    const submitFrame = vi.fn().mockResolvedValue({});
    const ticker = createVideoObservationTicker(
      // steady 情况不触发关键帧，但帧轨仍要上报缩略图
      makeDeps({ now: () => 1_000, readPixels: () => midPixels(), submitFrame }),
      CONFIG,
      {}
    );

    await ticker.tick();
    expect(submitFrame).toHaveBeenCalledTimes(1);
  });

  it("frame upload failure is routed to onError but does not throw", async () => {
    const submitFrame = vi.fn().mockRejectedValue(new Error("net down"));
    const onError = vi.fn();
    const ticker = createVideoObservationTicker(
      makeDeps({ now: () => 1_000, readPixels: () => midPixels(), submitFrame }),
      CONFIG,
      { onError }
    );

    const result = await ticker.tick();
    expect(result.uploadedFrame).toBe(false);
    expect(onError).toHaveBeenCalledWith("net down");
  });

  it("skips frame upload when encodeFrame returns null", async () => {
    const submitFrame = vi.fn().mockResolvedValue({});
    const encode = vi.fn().mockReturnValue(null);
    const ticker = createVideoObservationTicker(
      makeDeps({ now: () => 1_000, readPixels: () => midPixels(), submitFrame, encodeFrame: encode }),
      CONFIG,
      {}
    );

    const result = await ticker.tick();
    expect(result.uploadedFrame).toBe(false);
    expect(submitFrame).not.toHaveBeenCalled();
  });
});
