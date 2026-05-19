import { useCallback, useRef, useState } from "react";

import { createLogger } from "@/logger";
import { uploadInterviewVideo } from "@/apiClient";
import {
  saveChunk,
  getRecordingData,
  updateAccumulatedDuration,
  mergeAndClear,
} from "./videoStorage";

const log = createLogger("videoRecorder");

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
      if (mediaRecorderRef.current?.state === "recording") {
        log.debug("startRecording: already recording, skipping");
        return;
      }

      log.info("startRecording session=%s camera=%s canvas=%s",
        sessionId,
        cameraStream ? `active(${cameraStream.getTracks().length}t)` : "none",
        canvas ? `${canvas.width}x${canvas.height}` : "none");

      // 恢复已有的录制数据
      const existing = await getRecordingData(sessionId);
      if (existing) {
        accumulatedDurationRef.current = existing.accumulatedDuration;
        chunksSeqRef.current = existing.chunks.length;
        log.info("resumed from IndexedDB: %d chunks, %.1fs accumulated",
          existing.chunks.length, existing.accumulatedDuration);
      } else {
        accumulatedDurationRef.current = 0;
        chunksSeqRef.current = 0;
        log.info("new recording session");
      }

      recordingStartTimeRef.current = performance.now();
      setIsRecording(true);

      if (!cameraStream && !canvas) {
        log.warn("no cameraStream or canvas, recording will be empty");
        return;
      }

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
            // 每 6 个分片（约 60 秒）输出一次心跳，确认录制正常
            if (seq > 0 && seq % 6 === 0) {
              log.info("recording heartbeat: %d chunks saved (~%ds)",
                seq + 1, Math.round((seq + 1) * 10));
            }
          }
        };

        recorder.onerror = (event) => {
          log.error("MediaRecorder error:", event);
        };

        recorder.start(10000);
        mediaRecorderRef.current = recorder;
        log.info("MediaRecorder started: mimeType=%s, 10s chunks", mimeType);
      } catch (err) {
        log.error("MediaRecorder init failed:", err);
      }
    },
    []
  );

  const stopAndUpload = useCallback(
    async (
      sessionId: string
    ): Promise<{ videoPath: string; videoDurationSec: number } | null> => {
      log.info("stopAndUpload: stopping recorder...");
      setIsRecording(false);
      setUploadError(null);

      // 停止 MediaRecorder，等待最后一个 ondataavailable
      await stopMediaRecorder(mediaRecorderRef);

      // 更新累计时长
      const startTime = recordingStartTimeRef.current;
      if (startTime) {
        const segmentDuration = (performance.now() - startTime) / 1000;
        accumulatedDurationRef.current += segmentDuration;
        log.info("segment duration: %.1fs, total accumulated: %.1fs",
          segmentDuration, accumulatedDurationRef.current);
        await updateAccumulatedDuration(
          sessionId,
          accumulatedDurationRef.current
        );
      }
      recordingStartTimeRef.current = null;

      // 合并 IndexedDB 中的所有分片
      const merged = await mergeAndClear(sessionId);
      if (!merged || merged.blob.size === 0) {
        log.warn("no video data to upload (empty or missing chunks)");
        return null;
      }

      const durationSec = accumulatedDurationRef.current;
      log.info("uploading %.1f MB, duration=%.1fs → Supabase Storage",
        merged.blob.size / 1024 / 1024, durationSec);

      // 上传（重试 1 次）
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await uploadInterviewVideo(sessionId, merged.blob, {
            durationSec,
          });
          accumulatedDurationRef.current = 0;
          log.info("upload success: path=%s", result.videoPath);
          return {
            videoPath: result.videoPath,
            videoDurationSec: durationSec,
          };
        } catch (error) {
          log.warn("upload attempt %d failed:", attempt, error);
          if (attempt === 0) continue;
          const msg =
            error instanceof Error ? error.message : "视频上传失败";
          setUploadError(msg);
          log.error("upload failed after retry: %s", msg);
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
