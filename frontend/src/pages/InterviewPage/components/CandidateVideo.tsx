import { useEffect, useRef } from "react";
import { UserOutlined } from "@ant-design/icons";
import "./CandidateVideo.css";

interface CandidateVideoProps {
  cameraStream: MediaStream | null;
  cameraEnabled: boolean;
}

export function CandidateVideo({
  cameraStream,
  cameraEnabled,
}: CandidateVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && cameraStream && cameraEnabled) {
      video.srcObject = cameraStream;
    }
    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [cameraStream, cameraEnabled]);

  if (!cameraEnabled) {
    return (
      <div className="candidate-video-tile">
        <div className="video-placeholder">
          <UserOutlined />
          <p>摄像头已关闭</p>
        </div>
      </div>
    );
  }

  if (!cameraStream) {
    return (
      <div className="candidate-video-tile">
        <div className="video-placeholder">
          <UserOutlined />
          <p>正在启动摄像头...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="candidate-video-tile">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="candidate-self-view"
      />
    </div>
  );
}
