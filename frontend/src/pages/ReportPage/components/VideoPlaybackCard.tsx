import { memo, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { PlayCircleOutlined } from "@ant-design/icons";
import { fetchVideoUrl } from "@/apiClient";

export interface VideoPlaybackCardHandle {
  seekTo: (timestampSec: number) => void;
}

interface VideoPlaybackCardProps {
  sessionId: string;
  videoDurationSec?: number | null;
}

export const VideoPlaybackCard = memo(
  forwardRef<VideoPlaybackCardHandle, VideoPlaybackCardProps>(
    function VideoPlaybackCard({ sessionId, videoDurationSec }, ref) {
      const videoRef = useRef<HTMLVideoElement>(null);
      const [videoUrl, setVideoUrl] = useState<string | null>(null);
      const [loading, setLoading] = useState(false);

      useImperativeHandle(ref, () => ({
        seekTo(timestampSec: number) {
          const video = videoRef.current;
          if (!video || !videoUrl) return;
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            video.currentTime = timestampSec;
            video.play().catch(() => {});
          } else {
            video.addEventListener(
              "loadeddata",
              () => {
                video.currentTime = timestampSec;
                video.play().catch(() => {});
              },
              { once: true }
            );
          }
        },
      }));

      async function loadVideo() {
        if (videoUrl || loading) return;
        setLoading(true);
        try {
          const url = await fetchVideoUrl(sessionId);
          if (url) setVideoUrl(url);
        } catch {
          // 静默降级
        } finally {
          setLoading(false);
        }
      }

      const durationStr = videoDurationSec
        ? `${Math.floor(videoDurationSec / 60)}:${String(
            Math.floor(videoDurationSec % 60)
          ).padStart(2, "0")}`
        : null;

      return (
        <div className="glass-card video-playback-card">
          <h3>面试回放</h3>

          {!videoUrl && !loading && (
            <div
              className="video-playback-placeholder"
              onClick={() => void loadVideo()}
              style={{ cursor: "pointer" }}
            >
              <PlayCircleOutlined
                style={{ fontSize: 48, color: "var(--color-primary, #1677ff)" }}
              />
              <p
                style={{
                  marginTop: 8,
                  color: "var(--color-text-secondary)",
                }}
              >
                点击加载面试视频回放
                {durationStr ? `（${durationStr}）` : ""}
              </p>
            </div>
          )}

          {loading && (
            <div className="video-playback-placeholder">加载视频中...</div>
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
    }
  )
);
