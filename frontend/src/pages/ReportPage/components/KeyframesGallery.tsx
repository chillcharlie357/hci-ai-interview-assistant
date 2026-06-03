import { memo } from "react";
import { UserOutlined, PlayCircleOutlined } from "@ant-design/icons";

import type { KeyframeRecord } from "@/interviewFlow";

interface KeyframesGalleryProps {
  keyframes: KeyframeRecord[];
  hasVideo: boolean;
  onSeekVideo?: (timestampSec: number) => void;
}

export const KeyframesGallery = memo(function KeyframesGallery({
  keyframes,
  hasVideo,
  onSeekVideo,
}: KeyframesGalleryProps) {
  const hasRealKeyframes = keyframes && keyframes.length > 0;

  function handleClick(kf: KeyframeRecord) {
    if (kf.videoTimestampSec != null && onSeekVideo) {
      onSeekVideo(kf.videoTimestampSec);
    }
  }

  return (
    <div className="glass-card keyframes-card">
      <h3>面试关键时刻</h3>

      {!hasRealKeyframes && (
        <p className="keyframes-footnote">本场面试未捕获关键时刻帧。</p>
      )}

      <div className="keyframes-grid">
        {hasRealKeyframes &&
          keyframes.slice(0, 4).map((kf, i) => (
            <div
              key={i}
              className="keyframe-item"
              style={
                kf.videoTimestampSec != null
                  ? { cursor: "pointer" }
                  : undefined
              }
              onClick={() => handleClick(kf)}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-text-tertiary)",
                  fontSize: "24px",
                }}
              >
                {kf.dataUrl ? (
                  <img
                    src={kf.dataUrl}
                    alt={kf.reason}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : kf.videoTimestampSec != null ? (
                  <PlayCircleOutlined />
                ) : (
                  <UserOutlined />
                )}
              </div>
              <div className="keyframe-overlay">
                <span>
                  {Math.floor(kf.timestamp / 60)}:
                  {String(Math.floor(kf.timestamp % 60)).padStart(2, "0")}{" "}
                  {kf.reason}
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
});
