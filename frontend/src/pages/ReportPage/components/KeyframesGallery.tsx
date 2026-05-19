import { memo, useRef, useState } from "react";
import { UserOutlined, PlayCircleOutlined } from "@ant-design/icons";

import { fetchVideoUrl } from "@/apiClient";
import type { KeyframeRecord } from "@/interviewFlow";

interface KeyframesGalleryProps {
  keyframes: KeyframeRecord[];
  sessionId: string;
  hasVideo: boolean;
}

export const KeyframesGallery = memo(function KeyframesGallery({ keyframes, sessionId, hasVideo }: KeyframesGalleryProps) {
  const hasRealKeyframes = keyframes && keyframes.length > 0;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);

  async function loadVideo() {
    if (videoUrl) return;
    setVideoLoading(true);
    try {
      const url = await fetchVideoUrl(sessionId);
      if (url) setVideoUrl(url);
    } catch {
      // 静默降级
    } finally {
      setVideoLoading(false);
    }
  }

  function seekToTimestamp(timestampSec: number | null | undefined) {
    if (timestampSec == null) return;
    void (async () => {
      await loadVideo();
      const video = videoRef.current;
      if (!video) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        video.currentTime = timestampSec;
        video.play().catch(() => {});
      } else {
        video.addEventListener("loadeddata", () => {
          video.currentTime = timestampSec;
          video.play().catch(() => {});
        }, { once: true });
      }
    })();
  }

  return (
    <div className="glass-card keyframes-card">
      <h3>面试关键时刻</h3>

      {/* 视频播放器 */}
      {!videoUrl && !videoLoading && hasVideo && (
        <div className="video-player-placeholder" onClick={() => loadVideo()} style={{ cursor: "pointer" }}>
          <PlayCircleOutlined style={{ fontSize: 32, color: "var(--color-text-tertiary)" }} />
          <span style={{ marginLeft: 8, color: "var(--color-text-secondary)" }}>点击加载面试视频回放</span>
        </div>
      )}
      {videoLoading && (
        <div className="video-player-placeholder">加载视频中...</div>
      )}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          style={{ width: "100%", maxHeight: 240, borderRadius: 8, marginBottom: 12 }}
        />
      )}

      <div className="keyframes-grid">
        {hasRealKeyframes ? (
          keyframes.slice(0, 4).map((kf, i) => (
            <div
              key={i}
              className="keyframe-item"
              style={kf.videoTimestampSec != null ? { cursor: "pointer" } : undefined}
              onClick={() => seekToTimestamp(kf.videoTimestampSec)}
            >
              <div style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-tertiary)",
                fontSize: "24px",
              }}>
                {kf.dataUrl ? (
                  <img src={kf.dataUrl} alt={kf.reason} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : kf.videoTimestampSec != null ? (
                  <PlayCircleOutlined />
                ) : (
                  <UserOutlined />
                )}
              </div>
              <div className="keyframe-overlay">
                <span>{Math.floor(kf.timestamp / 60)}:{String(Math.floor(kf.timestamp % 60)).padStart(2, "0")} {kf.reason}</span>
              </div>
            </div>
          ))
        ) : (
          <>
            <KeyframePlaceholder time="05:21" label="低光照" />
            <KeyframePlaceholder time="12:45" label="高运动量" />
            <KeyframePlaceholder time="28:10" label="面部离开" />
            <KeyframePlaceholder time="42:30" label="视线偏移" />
          </>
        )}
      </div>
      {!hasRealKeyframes && (
        <p className="keyframes-footnote">以上为示例占位，实际关键帧将在面试中自动捕获。</p>
      )}
    </div>
  );
});

function KeyframePlaceholder({ time, label }: { time: string; label: string }) {
  return (
    <div className="keyframe-item">
      <div style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-text-tertiary)",
        fontSize: "24px",
      }}>
        <UserOutlined />
      </div>
      <div className="keyframe-overlay">
        <span>{time} {label}</span>
      </div>
    </div>
  );
}
