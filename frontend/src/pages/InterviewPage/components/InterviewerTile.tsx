import { memo } from "react";

import type { DigitalInterviewerState } from "@/digitalInterviewer";
import { describeDigitalInterviewerState } from "@/digitalInterviewer";

import { AnimatedAvatar } from "./AnimatedAvatar";

interface InterviewerTileProps {
  candidateName: string;
  currentStep: number;
  totalSteps: number;
  state: DigitalInterviewerState;
}

export const InterviewerTile = memo(function InterviewerTile({
  candidateName,
  currentStep,
  totalSteps,
  state,
}: InterviewerTileProps) {
  const description = describeDigitalInterviewerState(state, Math.max(currentStep, 0), Math.max(totalSteps, 0));

  return (
    <div className={`digital-interviewer-tile ${description.isAnimated ? "speaking" : ""}`}>
      <div className="digital-avatar">
        <div className="avatar-orbit" />
        <div className="avatar-core">
          <AnimatedAvatar state={state} />
        </div>
      </div>
      <div className="digital-name-row">
        <strong>AI 面试官</strong>
        <span className="status-tag">{description.label}</span>
      </div>
      <p>{candidateName}，我会按题目顺序主持本轮面试。</p>
      <div className="voice-bars">
        <span /><span /><span /><span />
      </div>
      <small>{description.detail}</small>
    </div>
  );
});
