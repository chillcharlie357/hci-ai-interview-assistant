import { useCallback, useRef, useState } from "react";
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

export type SpeechTranscriptEvent = {
  text: string;
  phase: "interim" | "final";
  provider: "qwen" | "webspeech";
};

export type SpeechRecognitionHandle = {
  audioChunkStatus: string;
  cumulativeMetrics: SpeechChunkResponse["cumulative"] | null;
  recentMetrics: SpeechChunkResponse["chunk"] | null;
  interimTranscript: string;
  asrProvider: "qwen" | "webspeech" | "none";
  startMediaStreamAndAsr: (asrContextTerms?: string[]) => Promise<void>;
  stopMediaStream: () => Promise<void>;
  appendAnswerText: (text: string) => void;
  chunkUploadFailCount: number;
  micStreamRef: React.RefObject<MediaStream | null>;
};

export function useSpeechRecognition(
  sessionId: string | undefined,
  onInterimTranscript: (text: string) => void,
  onFinalTranscript: (text: string) => void,
  shouldAcceptTranscript?: (event: SpeechTranscriptEvent) => boolean,
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

  const acceptTranscript = useCallback((event: SpeechTranscriptEvent) => (
    shouldAcceptTranscript ? shouldAcceptTranscript(event) : true
  ), [shouldAcceptTranscript]);

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
        if (!acceptTranscript({ text, phase: "final", provider: "webspeech" })) return;
        setInterimTranscript("");
        onFinalTranscript(text);
      },
      () => {},
      (text) => {
        if (!acceptTranscript({ text, phase: "interim", provider: "webspeech" })) {
          setInterimTranscript("");
          onInterimTranscript("");
          return;
        }
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
  }, [acceptTranscript, onFinalTranscript, onInterimTranscript]);

  const startAsrWithFallback = useCallback(async (stream: MediaStream, asrContextTerms: string[] = []) => {
    const preferQwen =
      (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
        .env?.VITE_ASR_PROVIDER !== "webspeech";

    if (preferQwen && isQwenAsrSupported()) {
      const qwen = createQwenAsrStream(stream, {
        onReady: () => setAsrProvider("qwen"),
        onInterim: (text) => {
          if (!acceptTranscript({ text, phase: "interim", provider: "qwen" })) {
            setInterimTranscript("");
            onInterimTranscript("");
            return;
          }
          setInterimTranscript(text);
          onInterimTranscript(text);
        },
        onFinal: (text) => {
          if (!acceptTranscript({ text, phase: "final", provider: "qwen" })) {
            setInterimTranscript("");
            onInterimTranscript("");
            return;
          }
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
      }, {
        contextTerms: asrContextTerms,
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
  }, [acceptTranscript, asrProvider, message, onFinalTranscript, onInterimTranscript, startWebSpeechTranscriber]);

  const startMediaStreamAndAsr = useCallback(async (asrContextTerms: string[] = []) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAudioChunkStatus("当前浏览器不支持麦克风采集");
      return;
    }

    // 停止旧的麦克风流（录制流中的轨道不受影响，它独立存在）
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 24000 },
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
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

    await startAsrWithFallback(stream, asrContextTerms);
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
    micStreamRef: mediaStreamRef,
  };
}
