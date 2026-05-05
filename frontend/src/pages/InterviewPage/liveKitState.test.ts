import { describe, expect, it } from "vitest";

import { shouldRequestLiveKitToken } from "./liveKitState";

describe("InterviewPage LiveKit state", () => {
  it("requests a token when the session came from global state but LiveKit is not connected", () => {
    expect(
      shouldRequestLiveKitToken({
        routeSessionId: "session_1",
        loadedSessionId: "session_1",
        candidateName: "陈宇",
        liveKitConnected: false,
        tokenRequestAttempted: false
      })
    ).toBe(true);
  });

  it("does not request a token without a loaded matching session", () => {
    expect(
      shouldRequestLiveKitToken({
        routeSessionId: "session_1",
        loadedSessionId: "session_2",
        candidateName: "陈宇",
        liveKitConnected: false,
        tokenRequestAttempted: false
      })
    ).toBe(false);
  });

  it("does not retry after a token request has already been attempted for the session", () => {
    expect(
      shouldRequestLiveKitToken({
        routeSessionId: "session_1",
        loadedSessionId: "session_1",
        candidateName: "陈宇",
        liveKitConnected: false,
        tokenRequestAttempted: true
      })
    ).toBe(false);
  });
});
