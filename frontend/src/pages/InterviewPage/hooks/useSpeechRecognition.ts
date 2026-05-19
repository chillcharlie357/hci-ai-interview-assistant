import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";

import { submitSpeechChunk, type SpeechChunkResponse } from "@/apiClient";
import { createSpeechTranscriber } from "@/speechRecognition";
import {
  createQwenAsrStream,
  isQwenAsrSupported,
  type QwenAsrStreamHandle,
} from "@/qwenAsrStream";
import { startPcmRecorder, type PcmRecorderHandle } from "@/pcmRecorder";
import { toBase64 } from "@/utils/file";

export type SpeechRecognitionHandle = {
  audioChunkStatus: string;
  cumulativeMetrics: SpeechChunkResponse["cumulative"] | null;
  recentMetrics: SpeechChunkResponse["chunk"] | null;
  interimTranscript: string;
  asrProvider: "qwen" | "webspeech" | "none";
  startMediaStreamAndAsr: () => Promise<void>;
  stopMediaStream: () => Promise<void>;
  appendAnswerText: (text: string) => void;
  chunkUploadFailCount: number;
};

export function useSpeechRecognition(
  sessionId: string | undefined,
  onInterimTranscript: (text: string) => void,
  onFinalTranscript: (text: string) => void,
  liveKitMicMuted: boolean = false,
): SpeechRecognitionHandle {
  const { message } = App.useApp();

  const [audioChunkStatus, setAudioChunkStatus] = useState("未启动");
  const [cumulativeMetrics, setCumulativeMetrics] = useState<SpeechChunkResponse["cumulative"] | null>(null);
  const [recentMetrics, setRecentMetrics] = useState<SpeechChunkResponse["chunk"] | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [asrProvider, setAsrProvider] = useState<"qwen" | "webspeech" | "none">("none");

  const transcriberRef = useRef<ReturnType<typeof createSpeechTranscriber> | null>(null);
  const pcmRecorderRef = useRef<PcmRecorderHandle | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunkUploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [chunkUploadFailCount, setChunkUploadFailCount] = useState(0);
  const qwenAsrRef = useRef<QwenAsrStreamHandle | null>(null);

  const appendAnswerText = useCallback((text: string) => {
    onFinalTranscript(text);
  }, [onFinalTranscript]);

  const enqueueSpeechChunkUpload = useCallback((blob: Blob) => {
    chunkUploadQueueRef.current = chunkUploadQueueRef.current.then(async () => {
      try {
        const audioBase64 = await toBase64(blob);
        const analyzed = await submitSpeechChunk(sessionId!, { audioBase64, targetSampleRate: 16000 });
        setCumulativeMetrics(analyzed.cumulative);
        setRecentMetrics(analyzed.chunk);
      } catch (e) {
        console.warn("[speech-chunk] upload failed:", e);
        setChunkUploadFailCount((c) => c + 1);
      }
    });
  }, [sessionId]);

  const startWebSpeechTranscriber = useCallback(() => {
    const transcriber = createSpeechTranscriber(
      window as Parameters<typeof createSpeechTranscriber>[0],
      (text) => {
        setInterimTranscript("");
        onFinalTranscript(text);
      },
      () => {},
      (text) => {
        setInterimTranscript(text);
        onInterimTranscript(text);
      }
    );
    if (transcriber.supported) {
      transcriberRef.current = transcriber;
      transcriber.start();
      setAsrProvider("webspeech");
    } else {
      setAsrProvider("none");
    }
  }, [onFinalTranscript, onInterimTranscript]);

  const startAsrWithFallback = useCallback(async (stream: MediaStream) => {
    const preferQwen =
      (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
        .env?.VITE_ASR_PROVIDER !== "webspeech";

    if (preferQwen && isQwenAsrSupported()) {
      const qwen = createQwenAsrStream(stream, {
        onReady: () => setAsrProvider("qwen"),
        onInterim: (text) => {
          setInterimTranscript(text);
          onInterimTranscript(text);
        },
        onFinal: (text) => {
          setInterimTranscript("");
          onFinalTranscript(text);
        },
        onError: (msg) => {
          if (asrProvider !== "webspeech") {
            message.warning(`实时字幕不可用，已切换到浏览器识别：${msg}`);
            void qwen.stop();
            startWebSpeechTranscriber();
          }
        },
        onClosed: () => {},
      });
      try {
        await qwen.start();
        qwenAsrRef.current = qwen;
        return;
      } catch {
        // 继续降级
      }
    }

    startWebSpeechTranscriber();
  }, [asrProvider, message, onFinalTranscript, onInterimTranscript, startWebSpeechTranscriber]);

  const startMediaStreamAndAsr = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAudioChunkStatus("当前浏览器不支持麦克风采集");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setAudioChunkStatus(error instanceof Error ? error.message : "麦克风不可用");
      return;
    }
    mediaStreamRef.current = stream;

    try {
      const recorder = await startPcmRecorder(stream, (wavBlob) => {
        enqueueSpeechChunkUpload(wavBlob);
      });
      pcmRecorderRef.current = recorder;
      setAudioChunkStatus("采集中");
    } catch (error) {
      setAudioChunkStatus(error instanceof Error ? error.message : "音频上传未启动");
    }

    await startAsrWithFallback(stream);
  }, [enqueueSpeechChunkUpload, startAsrWithFallback]);

  const stopMediaStream = useCallback(async () => {
    transcriberRef.current?.stop();
    transcriberRef.current = null;
    if (qwenAsrRef.current) {
      await qwenAsrRef.current.stop();
      qwenAsrRef.current = null;
    }
    setInterimTranscript("");
    const recorder = pcmRecorderRef.current;
    if (recorder) {
      await recorder.stop();
      pcmRecorderRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  // 同步 LiveKit 麦克风静音 → 暂停/恢复 ASR
  const pausedByLiveKitRef = useRef(false);

  useEffect(() => {
    if (!mediaStreamRef.current) return; // ASR 未启动，无需操作

    if (liveKitMicMuted) {
      // 静音：暂停 ASR 和 PCM 录音，但保留媒体流
      transcriberRef.current?.stop();
      if (qwenAsrRef.current) {
        void qwenAsrRef.current.stop();
        qwenAsrRef.current = null;
      }
      const recorder = pcmRecorderRef.current;
      if (recorder) {
        void recorder.stop();
        pcmRecorderRef.current = null;
      }
      setAudioChunkStatus("已静音");
      setAsrProvider("none");
      pausedByLiveKitRef.current = true;
    } else if (pausedByLiveKitRef.current) {
      // 取消静音：恢复 ASR 和 PCM 录音
      pausedByLiveKitRef.current = false;
      const stream = mediaStreamRef.current;
      if (!stream) return;

      void (async () => {
        try {
          const recorder = await startPcmRecorder(stream, (wavBlob) => {
            enqueueSpeechChunkUpload(wavBlob);
          });
          pcmRecorderRef.current = recorder;
          setAudioChunkStatus("采集中");
        } catch {
          setAudioChunkStatus("音频上传未启动");
        }
        await startAsrWithFallback(stream);
      })();
    }
  }, [liveKitMicMuted, enqueueSpeechChunkUpload, startAsrWithFallback]);

  return {
    audioChunkStatus,
    cumulativeMetrics,
    recentMetrics,
    interimTranscript,
    asrProvider,
    startMediaStreamAndAsr,
    stopMediaStream,
    appendAnswerText,
    chunkUploadFailCount,
  };
}
