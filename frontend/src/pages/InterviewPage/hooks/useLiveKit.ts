import { useEffect, useRef, useState } from "react";

import { requestLiveKitToken } from "@/apiClient";
import type { InterviewSession } from "@/interviewFlow";
import { shouldRequestLiveKitToken } from "../liveKitState";

export type LiveKitHandle = {
  liveKit: { url: string; token: string; room: string } | null;
  meetingError: string;
};

export function useLiveKit(
  sessionId: string | undefined,
  session: InterviewSession | null
): LiveKitHandle {
  const [liveKit, setLiveKit] = useState<{ url: string; token: string; room: string } | null>(null);
  const [meetingError, setMeetingError] = useState("");
  const liveKitRequestedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !shouldRequestLiveKitToken({
        routeSessionId: sessionId,
        loadedSessionId: session?.id,
        candidateName: session?.candidateName,
        liveKitConnected: Boolean(liveKit),
        tokenRequestAttempted: liveKitRequestedSessionIdRef.current === session?.id
      })
    ) {
      return;
    }
    liveKitRequestedSessionIdRef.current = session!.id;
    void loadLiveKitToken(session!);
  }, [sessionId, session?.id, session?.candidateName, liveKit]);

  async function loadLiveKitToken(loaded: InterviewSession) {
    try {
      setLiveKit(await requestLiveKitToken(loaded.id, {
        participantName: loaded.candidateName,
        participantRole: "candidate",
      }));
      setMeetingError("");
    } catch (error) {
      setMeetingError(error instanceof Error ? error.message : "会议服务未配置");
    }
  }

  return { liveKit, meetingError };
}
