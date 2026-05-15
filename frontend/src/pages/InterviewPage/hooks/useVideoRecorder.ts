import { useCallback, useRef, useState } from "react";

import { uploadInterviewVideo } from "@/apiClient";

export type VideoRecorderHandle = {
  startRecording: (cameraStream: MediaStream | null, canvas: HTMLCanvasElement | null) => void;
  stopAndUpload: (sessionId: string) => Promise<{ videoPath: string; videoDurationSec: number } | null>;
  recordingStartTimeRef: React.RefObject<number | null>;
  isRecording: boolean;
  uploadError: string | null;
};

export function useVideoRecorder(): VideoRecorderHandle {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const startRecording = useCallback((cameraStream: MediaStream | null, canvas: HTMLCanvasElement | null) => {
    if (mediaRecorderRef.current?.state === "recording") {
      return;
    }

    try {
      let recordingStream: MediaStream;

      if (canvas) {
        // 从分析 canvas 以 320x240 采集低分辨率流
        const canvasStream = canvas.captureStream(15);
        // 从摄像头流添加音频轨道
        if (cameraStream) {
          const audioTrack = cameraStream.getAudioTracks()[0];
          if (audioTrack) {
            canvasStream.addTrack(audioTrack);
          }
        }
        recordingStream = canvasStream;
      } else if (cameraStream) {
        // 降级：直接使用摄像头流
        recordingStream = cameraStream;
      } else {
        return;
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";

      const recorder = new MediaRecorder(recordingStream, {
        mimeType,
        videoBitsPerSecond: 200000,
      });

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start(10000); // 每 10 秒一个分片
      mediaRecorderRef.current = recorder;
      recordingStartTimeRef.current = performance.now();
      setIsRecording(true);
    } catch {
      // 录制启动失败时静默降级，不影响面试流程
    }
  }, []);

  const stopAndUpload = useCallback(async (sessionId: string): Promise<{ videoPath: string; videoDurationSec: number } | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsRecording(false);
      return null;
    }

    // 等待 recorder 停止
    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        resolve(blob);
      };
    });

    recorder.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);

    const videoBlob = await stopped;
    const startTime = recordingStartTimeRef.current;
    const durationSec = startTime ? (performance.now() - startTime) / 1000 : 0;
    recordingStartTimeRef.current = null;

    if (videoBlob.size === 0) {
      return null;
    }

    // 上传，失败重试 1 次
    setUploadError(null);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await uploadInterviewVideo(sessionId, videoBlob, { durationSec });
        return { videoPath: result.videoPath, videoDurationSec: durationSec };
      } catch (error) {
        if (attempt === 0) continue;
        const msg = error instanceof Error ? error.message : "视频上传失败";
        setUploadError(msg);
        return null;
      }
    }

    return null;
  }, []);

  return {
    startRecording,
    stopAndUpload,
    recordingStartTimeRef,
    isRecording,
    uploadError,
  };
}
