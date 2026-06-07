import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

import { VideoPlaybackCard } from "./VideoPlaybackCard";

describe("VideoPlaybackCard", () => {
  it("显示加载中状态", () => {
    const videoRef = React.createRef<HTMLVideoElement>();
    const { container } = render(
      <VideoPlaybackCard
        videoUrl={null}
        videoLoading={true}
        videoError=""
        videoError=""
        videoRef={videoRef}
      />
    );
    expect(container.textContent).toContain("加载视频中");
  });

  it("加载完成后渲染 video 元素且 src 正确", () => {
    const videoRef = React.createRef<HTMLVideoElement>();
    const { container } = render(
      <VideoPlaybackCard
        videoUrl="https://example.com/video.webm"
        videoLoading={false}
        videoError=""
        videoRef={videoRef}
      />
    );
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video!.getAttribute("src")).toBe("https://example.com/video.webm");
  });

  it("videoUrl 为 null 且未加载时不显示 video 元素", () => {
    const videoRef = React.createRef<HTMLVideoElement>();
    const { container } = render(
      <VideoPlaybackCard
        videoUrl={null}
        videoLoading={false}
        videoError=""
        videoRef={videoRef}
      />
    );
    expect(container.querySelector("video")).toBeNull();
  });

  it("videoDurationSec 存在时显示时长", () => {
    const videoRef = React.createRef<HTMLVideoElement>();
    const { container } = render(
      <VideoPlaybackCard
        videoUrl="https://example.com/video.webm"
        videoLoading={false}
        videoError=""
        videoDurationSec={125}
        videoRef={videoRef}
      />
    );
    expect(container.textContent).toContain("2:05");
  });

  it("videoDurationSec 为 null 时不显示时长", () => {
    const videoRef = React.createRef<HTMLVideoElement>();
    const { container } = render(
      <VideoPlaybackCard
        videoUrl="https://example.com/video.webm"
        videoLoading={false}
        videoError=""
        videoDurationSec={null}
        videoRef={videoRef}
      />
    );
    expect(container.textContent).not.toContain("总时长");
  });

  it("videoRef 绑定到 video 元素", () => {
    const videoRef = React.createRef<HTMLVideoElement>();
    render(
      <VideoPlaybackCard
        videoUrl="https://example.com/video.webm"
        videoLoading={false}
        videoError=""
        videoRef={videoRef}
      />
    );
    expect(videoRef.current).toBeInstanceOf(HTMLVideoElement);
    expect(videoRef.current!.src).toContain("example.com/video.webm");
  });
});
