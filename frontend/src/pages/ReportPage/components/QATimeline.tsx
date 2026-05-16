import { memo } from "react";
import { Tag } from "antd";
import { StarOutlined, ClockCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";

import type { InterviewSession } from "@/interviewFlow";
import { computeAnswerScore } from "../helpers/scoring";

interface QATimelineProps {
  session: InterviewSession;
}

export const QATimeline = memo(function QATimeline({ session }: QATimelineProps) {
  return (
    <div className="glass-card qa-card">
      <h3>核心问答追踪</h3>
      <div className="qa-timeline">
        {session.questions.map((q, index) => {
          const answer = session.answers.find((a) => a.questionId === q.id);
          const score = answer ? computeAnswerScore(answer) : null;
          return (
            <div key={q.id} className="qa-item">
              <div className="qa-marker">
                {index === 0 ? <StarOutlined /> : <CheckCircleOutlined />}
              </div>
              <div className="qa-content">
                <div className="qa-header">
                  <h4>{q.prompt}</h4>
                  {index === 0 && <Tag color="blue">核心亮点</Tag>}
                </div>
                <p className="qa-description">
                  {answer
                    ? answer.text.slice(0, 150) + (answer.text.length > 150 ? "..." : "")
                    : "暂无回答记录"}
                </p>
                <div className="qa-meta">
                  <Tag icon={<StarOutlined style={{ color: "var(--color-primary)" }} />}>
                    评分: {score !== null ? score.toFixed(1) : "未评"}
                  </Tag>
                  <Tag icon={<ClockCircleOutlined style={{ color: "var(--color-primary)" }} />}>
                    耗时: {answer ? `${Math.floor(answer.durationSec / 60)}m ${answer.durationSec % 60}s` : "-"}
                  </Tag>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
