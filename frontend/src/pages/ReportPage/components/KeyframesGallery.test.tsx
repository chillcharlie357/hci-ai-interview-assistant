import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

import { KeyframesGallery } from "./KeyframesGallery";
import type { KeyframeRecord } from "@/interviewFlow";

const mockKeyframe: KeyframeRecord = {
  timestamp: 120,
  reason: "low_light",
  dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
  videoTimestampSec: 45.5,
};

const mockKeyframeNoDataUrl: KeyframeRecord = {
  timestamp: 240,
  reason: "high_motion",
  videoTimestampSec: 120.0,
};

const mockKeyframeNoVideoTs: KeyframeRecord = {
  timestamp: 300,
  reason: "face_missing",
  dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
};

describe("KeyframesGallery", () => {
  it("有关键帧数据时渲染关键帧格子", () => {
    const { container } = render(
      <KeyframesGallery
        keyframes={[mockKeyframe]}
        hasVideo={true}
        onSeekVideo={vi.fn()}
      />
    );
    const items = container.querySelectorAll(".keyframe-item");
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it("无关键帧数据时不显示占位符", () => {
    const { container } = render(
      <KeyframesGallery
        keyframes={[]}
        hasVideo={true}
        onSeekVideo={vi.fn()}
      />
    );
    expect(container.querySelector(".keyframe-item")).toBeNull();
  });

  it("有 dataUrl 时渲染 img 缩略图", () => {
    const { container } = render(
      <KeyframesGallery
        keyframes={[mockKeyframe]}
        hasVideo={true}
        onSeekVideo={vi.fn()}
      />
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe(mockKeyframe.dataUrl);
  });

  it("无 dataUrl 但有 videoTimestampSec 时渲染播放图标", () => {
    const { container } = render(
      <KeyframesGallery
        keyframes={[mockKeyframeNoDataUrl]}
        hasVideo={true}
        onSeekVideo={vi.fn()}
      />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".anticon-play-circle")).toBeTruthy();
  });

  it("无 dataUrl 且无 videoTimestampSec 时渲染用户图标", () => {
    const kf: KeyframeRecord = { timestamp: 60, reason: "unknown" };
    const { container } = render(
      <KeyframesGallery
        keyframes={[kf]}
        hasVideo={true}
        onSeekVideo={vi.fn()}
      />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".anticon-play-circle")).toBeNull();
    expect(container.querySelector(".anticon-user")).toBeTruthy();
  });

  it("点击有关键帧且有 videoTimestampSec 时调用 onSeekVideo", () => {
    const onSeekVideo = vi.fn();
    const { container } = render(
      <KeyframesGallery
        keyframes={[mockKeyframe]}
        hasVideo={true}
        onSeekVideo={onSeekVideo}
      />
    );
    const item = container.querySelector(".keyframe-item")!;
    fireEvent.click(item);
    expect(onSeekVideo).toHaveBeenCalledWith(45.5);
  });

  it("点击无 videoTimestampSec 的关键帧不调用 onSeekVideo", () => {
    const onSeekVideo = vi.fn();
    const { container } = render(
      <KeyframesGallery
        keyframes={[mockKeyframeNoVideoTs]}
        hasVideo={true}
        onSeekVideo={onSeekVideo}
      />
    );
    const item = container.querySelector(".keyframe-item")!;
    fireEvent.click(item);
    expect(onSeekVideo).not.toHaveBeenCalled();
  });

  it("无内嵌视频播放器", () => {
    const { container } = render(
      <KeyframesGallery
        keyframes={[mockKeyframe]}
        hasVideo={true}
        onSeekVideo={vi.fn()}
      />
    );
    expect(container.querySelector("video")).toBeNull();
  });

  it("最多显示 4 个关键帧", () => {
    const keyframes = Array.from({ length: 6 }, (_, i) => ({
      ...mockKeyframe,
      timestamp: i * 60,
    }));
    const { container } = render(
      <KeyframesGallery
        keyframes={keyframes}
        hasVideo={true}
        onSeekVideo={vi.fn()}
      />
    );
    expect(container.querySelectorAll(".keyframe-item").length).toBe(4);
  });
});
