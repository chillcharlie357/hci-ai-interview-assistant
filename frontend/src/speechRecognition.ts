type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
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

export function createSpeechTranscriber(
  target: SpeechWindow,
  onTranscript: (text: string) => void,
  onError: (message: string) => void = () => undefined
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
  recognition.onresult = (event) => {
    const latest = event.results[event.results.length - 1];
    onTranscript(latest?.[0]?.transcript ?? "");
  };
  recognition.onerror = (event) => onError(event.error || "语音识别失败。");

  return {
    supported: true,
    recognition,
    start: () => recognition.start(),
    stop: () => recognition.stop()
  };
}
