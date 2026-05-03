type SpeechRecognitionResultLike = {
  0: { transcript: string };
  isFinal?: boolean;
};

type SpeechRecognitionEventLike = {
  resultIndex?: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function isSpeechRecognitionSupported(target: SpeechWindow = window): boolean {
  return Boolean(target.SpeechRecognition || target.webkitSpeechRecognition);
}

/**
 * 创建语音转写器。
 *
 * 关键修复：浏览器 `SpeechRecognition` 每次 `onresult` 事件会返回累积结果集，
 * 其中既包含 final 也包含 interim 条目；我们只把「尚未追加过的 final 片段」
 * 作为增量回调推出，避免用户说「123」被重复追加成「123123123…」。
 *
 * interim 文本通过 onInterim 回调暴露，UI 可自行选择是否展示，但不会参与
 * 最终答案的拼接。
 */
export function createSpeechTranscriber(
  target: SpeechWindow,
  onFinalTranscript: (text: string) => void,
  onError: (message: string) => void = () => undefined,
  onInterim: (text: string) => void = () => undefined
) {
  const SpeechRecognition = target.SpeechRecognition || target.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return {
      supported: false,
      recognition: null,
      start: () => onError("当前浏览器不支持语音转文字。"),
      stop: () => undefined
    };
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "zh-CN";

  // 已经作为 final 推送过的 result 索引阈值，新一轮 final 只推大于它的。
  let nextFinalIndex = 0;

  recognition.onresult = (event) => {
    const startIndex = typeof event.resultIndex === "number" ? event.resultIndex : 0;
    const total = event.results.length;

    let interimBuffer = "";
    for (let i = startIndex; i < total; i += 1) {
      const entry = event.results[i];
      const transcript = entry?.[0]?.transcript ?? "";
      if (entry?.isFinal) {
        if (i >= nextFinalIndex && transcript.trim()) {
          onFinalTranscript(transcript);
          nextFinalIndex = i + 1;
        }
      } else if (transcript) {
        interimBuffer += transcript;
      }
    }
    if (interimBuffer) {
      onInterim(interimBuffer);
    }
  };
  recognition.onerror = (event) => onError(event.error || "语音识别失败。");

  return {
    supported: true,
    recognition,
    start: () => {
      nextFinalIndex = 0;
      recognition.start();
    },
    stop: () => recognition.stop()
  };
}
