import { memo } from "react";
import { UserOutlined } from "@ant-design/icons";
import { LiveKitRoom, ControlBar, GridLayout, ParticipantTile, RoomAudioRenderer, useTracks } from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";

interface CandidateVideoProps {
  liveKit: { url: string; token: string; room: string } | null;
  meetingError: string;
}

export const CandidateVideo = memo(function CandidateVideo({ liveKit, meetingError }: CandidateVideoProps) {
  return (
    <div className="candidate-video-tile">
      {liveKit ? (
        <LiveKitRoom token={liveKit.token} serverUrl={liveKit.url} connect audio video>
          <CandidateLiveKitConference />
        </LiveKitRoom>
      ) : (
        <div className="video-placeholder">
          <UserOutlined />
          <p>{meetingError || "会议服务未配置"}</p>
        </div>
      )}
    </div>
  );
});

function CandidateLiveKitConference() {
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });

  return (
    <div className="candidate-livekit-room">
      <div className="candidate-video-grid">
        <GridLayout tracks={cameraTracks}>
          <ParticipantTile />
        </GridLayout>
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
