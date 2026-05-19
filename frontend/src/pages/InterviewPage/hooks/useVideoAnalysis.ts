import { useCallback, useEffect, useRef, useState } from "react";

import { submitVideoEvent } from "@/apiClient";
import type { InterviewSession } from "@/interviewFlow";
import {
  analyzeFaceLandmarks,
  buildVideoMetrics,
  classifyAttentionEvent,
  classifyVideoEvent,
  createFaceAnalysisState,
  loadOptionalVisionTasks,
  mergeFaceMetrics,
  type FaceAnalysisMetrics,
  type FaceAnalysisState,
  type FaceLandmarkPoint,
} from "@/videoAnalyzer";

const FACE_ANALYSIS_INTERVAL_MS = 100;

export type VideoAnalysisHandle = {
  analysisVideoRef: React.RefObject<HTMLVideoElement | null>;
  analysisCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  analysisStreamRef: React.RefObject<MediaStream | null>;
  faceMetricsSnapshot: FaceAnalysisMetrics | null;
  videoObservationStatus: string;
  currentFacePresent: boolean;
  cameraEnabled: boolean;
  setCameraEnabled: (enabled: boolean) => void;
};

export function useVideoAnalysis(
  sessionId: string | undefined,
  session: InterviewSession | null,
  onSessionUpdate: (updated: InterviewSession) => void,
  recordingStartTimeRef: React.RefObject<number | null>,
  accumulatedDurationRef: React.RefObject<number>
): VideoAnalysisHandle {
  const analysisVideoRef = useRef<HTMLVideoElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisStreamRef = useRef<MediaStream | null>(null);
  const analysisFrameRef = useRef<number | null>(null);
  const lastAnalyzedAtRef = useRef<number>(0);
  const lastUploadedVideoEventAtRef = useRef<number>(0);
  const previousAnalysisPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const faceAnalysisStateRef = useRef<FaceAnalysisState>(createFaceAnalysisState());
  const faceLandmarkerRef = useRef<{
    detectForVideo: (video: HTMLVideoElement, timestamp: number) => { faceLandmarks: FaceLandmarkPoint[][] };
    close?: () => void;
  } | null>(null);

  // 高频数据走 ref，低频快照走 state
  const metricsRef = useRef<FaceAnalysisMetrics | null>(null);
  const [faceMetricsSnapshot, setFaceMetricsSnapshot] = useState<FaceAnalysisMetrics | null>(null);
  const [videoObservationStatus, setVideoObservationStatus] = useState("未启动");
  const [cameraEnabled, setCameraEnabled] = useState(true);

  // 每 2 秒取一次快照到 state，触发 UI 更新
  useEffect(() => {
    const timer = setInterval(() => {
      if (metricsRef.current) {
        setFaceMetricsSnapshot({ ...metricsRef.current });
      }
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const stopVideoObservation = useCallback(() => {
    if (analysisFrameRef.current !== null) {
      window.cancelAnimationFrame(analysisFrameRef.current);
      analysisFrameRef.current = null;
    }
    const landmarker = faceLandmarkerRef.current;
    if (landmarker?.close) {
      landmarker.close();
    }
    faceLandmarkerRef.current = null;
    analysisStreamRef.current?.getTracks().forEach((track) => track.stop());
    analysisStreamRef.current = null;
    previousAnalysisPixelsRef.current = null;
    const videoElement = analysisVideoRef.current;
    if (videoElement) {
      videoElement.pause();
      videoElement.srcObject = null;
    }
  }, []);

  const scheduleNextAnalysisFrame = useCallback(() => {
    analysisFrameRef.current = window.requestAnimationFrame((timestamp) => {
      void analyzeVideoFrame(timestamp);
    });
  }, []);

  const analyzeVideoFrame = useCallback(async (timestampMs: number) => {
    try {
      const videoElement = analysisVideoRef.current;
      const canvasElement = analysisCanvasRef.current;
      const landmarker = faceLandmarkerRef.current;

      if (!videoElement || !canvasElement || !landmarker || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        scheduleNextAnalysisFrame();
        return;
      }
      if (timestampMs - lastAnalyzedAtRef.current < FACE_ANALYSIS_INTERVAL_MS) {
        scheduleNextAnalysisFrame();
        return;
      }
      lastAnalyzedAtRef.current = timestampMs;

      canvasElement.width = videoElement.videoWidth || 320;
      canvasElement.height = videoElement.videoHeight || 240;
      const context = canvasElement.getContext("2d", { willReadFrequently: true });
      if (!context) {
        setVideoObservationStatus("无法读取摄像头帧");
        scheduleNextAnalysisFrame();
        return;
      }

      context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
      const imageData = context.getImageData(0, 0, canvasElement.width, canvasElement.height);
      const pixels = new Uint8ClampedArray(imageData.data);
      const baseMetrics = buildVideoMetrics(pixels, previousAnalysisPixelsRef.current);
      previousAnalysisPixelsRef.current = pixels;

      const detection = landmarker.detectForVideo(videoElement, timestampMs);
      const faceLandmarks = detection.faceLandmarks[0];
      const faceAnalysis = analyzeFaceLandmarks(faceLandmarks, timestampMs, faceAnalysisStateRef.current);
      faceAnalysisStateRef.current = faceAnalysis.state;

      const mergedMetrics = mergeFaceMetrics(baseMetrics, faceAnalysis.metrics);
      // 高频更新只走 ref，不触发 React 渲染
      metricsRef.current = faceAnalysis.metrics;

      const qualityEvent = classifyVideoEvent(mergedMetrics);
      const event = classifyAttentionEvent(qualityEvent, faceAnalysis.metrics);
      const shouldUpload = event.eventType !== "steady" || timestampMs - lastUploadedVideoEventAtRef.current >= 2000;

      if (shouldUpload && session) {
        lastUploadedVideoEventAtRef.current = timestampMs;
        const keyframe = event.shouldCaptureKeyframe
          ? {
              reason: event.keyframeReason ?? event.eventType,
              dataUrl: canvasElement.toDataURL("image/jpeg", 0.7),
              videoTimestampSec: recordingStartTimeRef.current
                ? (accumulatedDurationRef.current + (timestampMs - recordingStartTimeRef.current) / 1000)
                : null,
            }
          : undefined;
        void submitVideoEvent(session.id, {
          timestamp: timestampMs / 1000,
          eventType: event.eventType,
          confidence: event.confidence,
          metrics: mergedMetrics,
          keyframe
        })
          .then((updated) => {
            onSessionUpdate(updated);
          })
          .catch(() => {
            // 忽略单次上传错误，前端继续本地分析
          });
      }
    } catch {
      setVideoObservationStatus("面部分析异常，已暂停");
      stopVideoObservation();
      return;
    }

    scheduleNextAnalysisFrame();
  }, [session, onSessionUpdate, scheduleNextAnalysisFrame, stopVideoObservation]);

  const startVideoObservation = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setVideoObservationStatus("当前浏览器不支持摄像头分析");
      return;
    }

    stopVideoObservation();
    setVideoObservationStatus("启动中");

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    });
    analysisStreamRef.current = stream;

    const videoElement = analysisVideoRef.current;
    if (!videoElement) {
      throw new Error("分析视频节点未就绪");
    }
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.playsInline = true;
    await videoElement.play();

    const vision = await loadOptionalVisionTasks();
    if (!vision) {
      throw new Error("无法加载 MediaPipe Vision");
    }

    const wasmFileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const landmarker = await vision.FaceLandmarker.createFromOptions(wasmFileset, {
      baseOptions: { modelAssetPath: "/models/face_landmarker.task" },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false
    });
    faceLandmarkerRef.current = landmarker;
    faceAnalysisStateRef.current = createFaceAnalysisState();
    previousAnalysisPixelsRef.current = null;
    lastAnalyzedAtRef.current = 0;
    lastUploadedVideoEventAtRef.current = 0;
    setVideoObservationStatus("分析中");
    scheduleNextAnalysisFrame();
  }, [stopVideoObservation, scheduleNextAnalysisFrame]);

  // 响应 session 和 cameraEnabled 变化
  useEffect(() => {
    if (!session?.enableVideoObservation || !cameraEnabled) {
      stopVideoObservation();
      metricsRef.current = null;
      setFaceMetricsSnapshot(null);
      setVideoObservationStatus(cameraEnabled ? "未启用面部分析" : "摄像头已关闭");
      return;
    }
    let cancelled = false;
    void startVideoObservation().catch((error) => {
      if (!cancelled) {
        setVideoObservationStatus(error instanceof Error ? error.message : "面部分析启动失败");
      }
    });
    return () => {
      cancelled = true;
      stopVideoObservation();
    };
  }, [session?.id, session?.enableVideoObservation, cameraEnabled, startVideoObservation, stopVideoObservation]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stopVideoObservation();
    };
  }, [stopVideoObservation]);

  const currentFacePresent = faceMetricsSnapshot?.facePresent ?? session?.videoEvents.at(-1)?.metrics?.facePresent ?? false;

  return {
    analysisVideoRef,
    analysisCanvasRef,
    analysisStreamRef,
    faceMetricsSnapshot,
    videoObservationStatus,
    currentFacePresent,
    cameraEnabled,
    setCameraEnabled,
  };
}
