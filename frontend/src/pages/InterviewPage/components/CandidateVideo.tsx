import { useState, useEffect } from "react";
import { UserOutlined, DisconnectOutlined } from "@ant-design/icons";
import {
  LiveKitRoom,
  ControlBar,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import "./CandidateVideo.css";

interface CandidateVideoProps {
  liveKit: { url: string; token: string; room: string } | null;
  meetingError: string;
  onMicrophoneMutedChange?: (muted: boolean) => void;
}

export function CandidateVideo({
  liveKit,
  meetingError,
  onMicrophoneMutedChange,
}: CandidateVideoProps) {
  if (!liveKit) {
    return (
      <div className="candidate-video-tile">
        <div className="video-placeholder">
          <UserOutlined />
          <p>{meetingError || "会议服务未配置"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="candidate-video-tile">
      <LiveKitRoom
        token={liveKit.token}
        serverUrl={liveKit.url}
        connect
        audio
        video
      >
        <CandidateLiveKitConference onMicrophoneMutedChange={onMicrophoneMutedChange} />
      </LiveKitRoom>
    </div>
  );
}

function CandidateLiveKitConference({
  onMicrophoneMutedChange,
}: {
  onMicrophoneMutedChange?: (muted: boolean) => void;
}) {
  const [connectionError, setConnectionError] = useState<string>("");
  const connectionState = useConnectionState();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const isMicMuted = !isMicrophoneEnabled;

  useEffect(() => {
    onMicrophoneMutedChange?.(isMicMuted);
  }, [isMicMuted, onMicrophoneMutedChange]);

  useEffect(() => {
    if (connectionState === "disconnected") {
      setConnectionError("视频连接已断开，请刷新页面重试");
    } else if (connectionState === "connected") {
      setConnectionError("");
    }
  }, [connectionState]);

  // 关闭 withPlaceholder 以避免 track 断开时 GridLayout 内部状态不同步崩溃
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  if (connectionError) {
    return (
      <div className="candidate-livekit-room">
        <div className="video-placeholder video-error">
          <DisconnectOutlined />
          <p>{connectionError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="candidate-livekit-room">
      <div className="candidate-video-grid">
        {cameraTracks.length > 0 ? (
          <GridLayout tracks={cameraTracks}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <div className="video-placeholder">
            <UserOutlined />
            <p>正在连接摄像头...</p>
          </div>
        )}
      </div>
      <ControlBar
        controls={{
          microphone: true,
          camera: true,
          screenShare: false,
          chat: false,
          settings: false,
          leave: true,
        }}
      />
      <RoomAudioRenderer />
    </div>
  );
}
