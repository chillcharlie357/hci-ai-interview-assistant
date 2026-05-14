import { memo, type RefObject } from "react";
import { Button, Tag, Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { StopOutlined, ForwardOutlined } from "@ant-design/icons";

import type { DigitalInterviewerState } from "@/digitalInterviewer";
import type { InterviewQuestion } from "@/interviewFlow";

const { TextArea } = Input;

interface AnswerPanelProps {
  isAnswering: boolean;
  answerText: string;
  onAnswerTextChange: (text: string) => void;
  interimTranscript: string;
  asrProvider: "qwen" | "webspeech" | "none";
  currentQuestion: InterviewQuestion | null;
  interviewerState: DigitalInterviewerState;
  onStartAnswer: () => void;
  onFinishAnswer: () => void;
  finishingAnswer: boolean;
  answerInputRef?: RefObject<TextAreaRef | null>;
}

export const AnswerPanel = memo(function AnswerPanel({
  isAnswering,
  answerText,
  onAnswerTextChange,
  interimTranscript,
  asrProvider,
  currentQuestion,
  interviewerState,
  onStartAnswer,
  onFinishAnswer,
  finishingAnswer,
  answerInputRef,
}: AnswerPanelProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.ctrlKey && e.key === "Enter" && isAnswering && interviewerState !== "speaking") {
      e.preventDefault();
      onFinishAnswer();
    }
  }

  return (
    <div className="caption-bar">
      <div className="caption-input">
        {isAnswering && (interimTranscript || asrProvider !== "none") && (
          <div className="asr-interim-hint" aria-live="polite">
            {asrProvider === "qwen" && <Tag color="green">Qwen3-ASR 实时字幕</Tag>}
            {asrProvider === "webspeech" && <Tag color="orange">浏览器识别（降级）</Tag>}
            {asrProvider === "none" && <Tag>仅手动输入</Tag>}
            {interimTranscript && <span className="asr-interim-text">{interimTranscript}</span>}
          </div>
        )}
        <TextArea
          ref={answerInputRef}
          value={answerText}
          onChange={(e) => onAnswerTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isAnswering ? "语音识别会实时写入这里（Ctrl+Enter 提交）..." : "等待提问结束后开始回答..."}
          autoSize={{ minRows: 2, maxRows: 3 }}
          aria-label="回答输入框"
        />
      </div>

      <div className="caption-actions">
        {!isAnswering ? (
          <Button type="primary" size="large" onClick={onStartAnswer} disabled={!currentQuestion || interviewerState === "speaking"}>
            开始回答
          </Button>
        ) : (
          <>
            <Button
              size="large"
              danger
              onClick={onFinishAnswer}
              loading={finishingAnswer}
              icon={<StopOutlined />}
              disabled={interviewerState === "speaking"}
            >
              结束回答
            </Button>
            <Button
              type="primary"
              size="large"
              onClick={onFinishAnswer}
              icon={<ForwardOutlined />}
              disabled={interviewerState === "speaking"}
            >
              进入下一题
            </Button>
          </>
        )}
      </div>
    </div>
  );
});
