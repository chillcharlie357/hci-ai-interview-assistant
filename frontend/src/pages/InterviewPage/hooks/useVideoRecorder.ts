import { useCallback, useRef, useState } from "react";

import { uploadInterviewVideo } from "@/apiClient";
import {
  saveChunk,
  getRecordingData,
  updateAccumulatedDuration,
  mergeAndClear,
} from "./videoStorage";

export type VideoRecorderHandle = {
  startRecording: (
    sessionId: string,
    cameraStream: MediaStream | null,
    canvas: HTMLCanvasElement | null
  ) => Promise<void>;
  stopAndUpload: (
    sessionId: string
  ) => Promise<{ videoPath: string; videoDurationSec: number } | null>;
  recordingStartTimeRef: React.RefObject<number | null>;
  accumulatedDurationRef: React.RefObject<number>;
  isRecording: boolean;
  uploadError: string | null;
};

export function useVideoRecorder(): VideoRecorderHandle {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksSeqRef = useRef(0);
  const recordingStartTimeRef = useRef<number | null>(null);
  const accumulatedDurationRef = useRef(0);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const startRecording = useCallback(
    async (
      sessionId: string,
      cameraStream: MediaStream | null,
      canvas: HTMLCanvasElement | null
    ) => {
      if (mediaRecorderRef.current?.state === "recording") return;

      // 恢复已有的录制数据
      const existing = await getRecordingData(sessionId);
      if (existing) {
        accumulatedDurationRef.current = existing.accumulatedDuration;
        chunksSeqRef.current = existing.chunks.length;
      } else {
        accumulatedDurationRef.current = 0;
        chunksSeqRef.current = 0;
      }

      recordingStartTimeRef.current = performance.now();
      setIsRecording(true);

      if (!cameraStream && !canvas) return;

      try {
        let recordingStream: MediaStream;

        if (canvas) {
          recordingStream = canvas.captureStream(15);
          if (cameraStream) {
            const audioTrack = cameraStream.getAudioTracks()[0];
            if (audioTrack) recordingStream.addTrack(audioTrack);
          }
        } else {
          recordingStream = cameraStream!;
        }

        const mimeType = MediaRecorder.isTypeSupported(
          "video/webm;codecs=vp8,opus"
        )
          ? "video/webm;codecs=vp8,opus"
          : "video/webm";

        const recorder = new MediaRecorder(recordingStream, {
          mimeType,
          videoBitsPerSecond: 200000,
        });

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            const seq = chunksSeqRef.current++;
            void saveChunk(sessionId, seq, event.data);
          }
        };

        recorder.start(10000);
        mediaRecorderRef.current = recorder;
      } catch {
        // 录制失败，静默降级
      }
    },
    []
  );

  const stopAndUpload = useCallback(
    async (
      sessionId: string
    ): Promise<{ videoPath: string; videoDurationSec: number } | null> => {
      setIsRecording(false);
      setUploadError(null);

      // 停止 MediaRecorder，等待最后一个 ondataavailable
      await stopMediaRecorder(mediaRecorderRef);

      // 更新累计时长
      const startTime = recordingStartTimeRef.current;
      if (startTime) {
        const segmentDuration = (performance.now() - startTime) / 1000;
        accumulatedDurationRef.current += segmentDuration;
        await updateAccumulatedDuration(
          sessionId,
          accumulatedDurationRef.current
        );
      }
      recordingStartTimeRef.current = null;

      // 合并 IndexedDB 中的所有分片
      const merged = await mergeAndClear(sessionId);
      if (!merged || merged.blob.size === 0) return null;

      const durationSec = accumulatedDurationRef.current;

      // 上传（重试 1 次）
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await uploadInterviewVideo(sessionId, merged.blob, {
            durationSec,
          });
          accumulatedDurationRef.current = 0;
          return {
            videoPath: result.videoPath,
            videoDurationSec: durationSec,
          };
        } catch (error) {
          if (attempt === 0) continue;
          const msg =
            error instanceof Error ? error.message : "视频上传失败";
          setUploadError(msg);
        }
      }

      accumulatedDurationRef.current = 0;
      return null;
    },
    []
  );

  return {
    startRecording,
    stopAndUpload,
    recordingStartTimeRef,
    accumulatedDurationRef,
    isRecording,
    uploadError,
  };
}

function stopMediaRecorder(
  ref: React.RefObject<MediaRecorder | null>
): Promise<void> {
  const recorder = ref.current;
  if (!recorder || recorder.state === "inactive") return Promise.resolve();

  return new Promise((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
    ref.current = null;
  });
}
