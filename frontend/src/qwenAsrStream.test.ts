import { describe, expect, it } from "vitest";

import { getAsrWebSocketUrl, sanitizeAsrTranscript } from "./qwenAsrStream";

describe("qwenAsrStream", () => {
  it("adds ASR context terms to the websocket URL", () => {
    const url = new URL(getAsrWebSocketUrl({
      wsUrl: "wss://example.com/asr",
      contextTerms: ["RAG", "TypeScript", "检索增强生成"],
    }));

    expect(url.protocol).toBe("wss:");
    expect(url.pathname).toBe("/asr");
    expect(url.searchParams.getAll("term")).toEqual(["RAG", "TypeScript", "检索增强生成"]);
  });

  it("sanitizes isolated filler words from final transcripts", () => {
    const cleaned = sanitizeAsrTranscript("嗯，啊，我主要负责 RAG，那个，使用 Supabase；um, TypeScript 也做过。");

    expect(cleaned).toBe("我主要负责 RAG，使用 Supabase；TypeScript 也做过。");
  });
});
