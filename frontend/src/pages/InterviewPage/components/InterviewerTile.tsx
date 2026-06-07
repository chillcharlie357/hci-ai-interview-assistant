import { memo } from "react";

import type { DigitalInterviewerState } from "@/digitalInterviewer";

import { VideoAvatar } from "./VideoAvatar";

interface InterviewerTileProps {
  state: DigitalInterviewerState;
  reaction?: { type: "nod" | "shake"; key: number } | null;
}

export const InterviewerTile = memo(function InterviewerTile({
  state,
  reaction,
}: InterviewerTileProps) {
  return (
    <div
      className="digital-interviewer-tile"
      style={{ aspectRatio: "3 / 4", height: "100%", width: "auto" }}
    >
      <div className="digital-avatar">
        <div className="avatar-orbit" />
        <div className="avatar-core">
          <VideoAvatar state={state} reaction={reaction} />
        </div>
      </div>
    </div>
  );
});
