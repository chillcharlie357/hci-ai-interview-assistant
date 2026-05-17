import { useCallback, useRef, useState } from "react";

import { stopRecording, uploadInterviewVideo } from "@/apiClient";

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
  const egressStartedRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const startRecording = useCallback((cameraStream: MediaStream | null, canvas: HTMLCanvasElement | null) => {
    if (mediaRecorderRef.current?.state === "recording" || egressStartedRef.current) {
      return;
    }

    egressStartedRef.current = true;
    recordingStartTimeRef.current = performance.now();
    setIsRecording(true);

    // Start client-side MediaRecorder as fallback
    if (cameraStream || canvas) {
      try {
        let recordingStream: MediaStream;

        if (canvas) {
          const canvasStream = canvas.captureStream(15);
          if (cameraStream) {
            const audioTrack = cameraStream.getAudioTracks()[0];
            if (audioTrack) {
              canvasStream.addTrack(audioTrack);
            }
          }
          recordingStream = canvasStream;
        } else if (cameraStream) {
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

        recorder.start(10000);
        mediaRecorderRef.current = recorder;
      } catch {
        // Client-side recording failed, rely on Egress
      }
    }
  }, []);

  const stopAndUpload = useCallback(async (sessionId: string): Promise<{ videoPath: string; videoDurationSec: number } | null> => {
    const usedEgress = egressStartedRef.current;
    egressStartedRef.current = false;
    setIsRecording(false);
    setUploadError(null);

    // Stop client-side recorder
    const clientBlob = await _stopClientRecorder(mediaRecorderRef, chunksRef);

    // Prefer Egress server-side recording
    if (usedEgress) {
      try {
        const result = await stopRecording(sessionId);
        if (result.videoPath) {
          recordingStartTimeRef.current = null;
          return { videoPath: result.videoPath, videoDurationSec: result.videoDurationSec };
        }
      } catch {
        // Egress stop failed, fall back to client upload
      }
    }

    // Fallback: upload client-side recording
    if (clientBlob && clientBlob.size > 0) {
      const startTime = recordingStartTimeRef.current;
      const durationSec = startTime ? (performance.now() - startTime) / 1000 : 0;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await uploadInterviewVideo(sessionId, clientBlob, { durationSec });
          recordingStartTimeRef.current = null;
          return { videoPath: result.videoPath, videoDurationSec: durationSec };
        } catch (error) {
          if (attempt === 0) continue;
          const msg = error instanceof Error ? error.message : "视频上传失败";
          setUploadError(msg);
        }
      }
    }

    recordingStartTimeRef.current = null;
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

async function _stopClientRecorder(
  mediaRecorderRef: React.RefObject<MediaRecorder | null>,
  chunksRef: React.RefObject<Blob[]>,
): Promise<Blob | null> {
  const recorder = mediaRecorderRef.current;
  if (!recorder || recorder.state === "inactive") {
    return null;
  }

  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunksRef.current, { type: "video/webm" }));
    };
  });

  recorder.stop();
  mediaRecorderRef.current = null;
  return await stopped;
}
