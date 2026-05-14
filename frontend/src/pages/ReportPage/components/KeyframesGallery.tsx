import { memo } from "react";
import { UserOutlined } from "@ant-design/icons";

import type { KeyframeRecord } from "@/interviewFlow";

interface KeyframesGalleryProps {
  keyframes: KeyframeRecord[];
}

export const KeyframesGallery = memo(function KeyframesGallery({ keyframes }: KeyframesGalleryProps) {
  const hasRealKeyframes = keyframes && keyframes.length > 0;

  return (
    <div className="glass-card keyframes-card">
      <h3>面试关键情绪捕获</h3>
      <div className="keyframes-grid">
        {hasRealKeyframes ? (
          keyframes.slice(0, 4).map((kf, i) => (
            <div key={i} className="keyframe-item">
              <img src={kf.dataUrl} alt={`关键帧 ${i + 1}`} />
              <div className="keyframe-overlay">
                <span>{Math.floor(kf.timestamp / 60)}:{String(Math.floor(kf.timestamp % 60)).padStart(2, "0")} {kf.reason}</span>
              </div>
            </div>
          ))
        ) : (
          <>
            <KeyframePlaceholder time="05:21" label="极度专注" />
            <KeyframePlaceholder time="12:45" label="自信阐述" />
            <KeyframePlaceholder time="28:10" label="深度思考" />
            <KeyframePlaceholder time="42:30" label="积极互动" />
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
