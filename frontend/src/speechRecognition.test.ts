import { describe, expect, it, vi } from "vitest";

import { createSpeechTranscriber, isSpeechRecognitionSupported } from "./speechRecognition";

describe("speechRecognition", () => {
  it("reports unsupported browsers", () => {
    expect(isSpeechRecognitionSupported({})).toBe(false);
  });

  it("starts recognition and emits transcript updates", () => {
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
    }
    const fakeWindow = { webkitSpeechRecognition: FakeRecognition };
    const onTranscript = vi.fn();
    const transcriber = createSpeechTranscriber(fakeWindow, onTranscript);

    transcriber.start();
    transcriber.recognition?.onresult?.({ results: [{ 0: { transcript: "我负责问题生成" } }] });
    transcriber.stop();

    expect(transcriber.supported).toBe(true);
    expect(onTranscript).toHaveBeenCalledWith("我负责问题生成");
    expect(transcriber.recognition?.start).toHaveBeenCalled();
    expect(transcriber.recognition?.stop).toHaveBeenCalled();
  });
});
