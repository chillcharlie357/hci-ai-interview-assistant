import { memo } from "react";

interface VideoPlaybackCardProps {
  videoUrl: string | null;
  videoLoading: boolean;
  videoError: string;
  videoDurationSec?: number | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export const VideoPlaybackCard = memo(function VideoPlaybackCard({
  videoUrl,
  videoLoading,
  videoError,
  videoDurationSec,
  videoRef,
}: VideoPlaybackCardProps) {
  const durationStr = videoDurationSec
    ? `${Math.floor(videoDurationSec / 60)}:${String(
        Math.floor(videoDurationSec % 60)
      ).padStart(2, "0")}`
    : null;

  return (
    <div className="glass-card video-playback-card">
      <h3>面试回放</h3>

      {videoLoading && (
        <div className="video-playback-placeholder">加载视频中...</div>
      )}

      {videoError && (
        <div className="video-playback-placeholder" style={{ color: "var(--color-error)" }}>
          {videoError}
        </div>
      )}

      {!videoLoading && !videoError && !videoUrl && (
        <div className="video-playback-placeholder">暂无面试录像</div>
      )}

      {videoUrl && (
        <div>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            style={{ width: "100%", maxHeight: 360, borderRadius: 8 }}
          />
          {durationStr && (
            <p
              style={{
                marginTop: 4,
                color: "var(--color-text-tertiary)",
                fontSize: 13,
              }}
            >
              总时长：{durationStr}
            </p>
          )}
        </div>
      )}
    </div>
  );
});
