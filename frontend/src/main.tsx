import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  buildAvatarPrompt,
  createDraft,
  createSessionFromDraft,
  generateMarkdownReport,
  recordAnswer,
  type DraftInput,
  type InterviewSession
} from "./interviewFlow";
import "./styles.css";

function App() {
  const [draft, setDraft] = useState<DraftInput>(createDraft());
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [durationSec, setDurationSec] = useState(90);
  const report = useMemo(() => (session ? generateMarkdownReport(session) : ""), [session]);

  const avatarPrompt = session ? buildAvatarPrompt(session) : "填写材料后开始生成面试问题。";

  function updateDraft(field: keyof DraftInput, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startInterview() {
    setSession(createSessionFromDraft(draft));
    setAnswerText("");
  }

  function submitAnswer() {
    if (!session) {
      return;
    }
    setSession(recordAnswer(session, { text: answerText, durationSec }));
    setAnswerText("");
  }

  function speakQuestion() {
    if (!("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(avatarPrompt);
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <main className="app-shell">
      <section className="panel setup-panel">
        <p className="eyebrow">Python + TypeScript MVP</p>
        <h1>HCI AI 辅助面试</h1>
        <label>
          候选人
          <input value={draft.candidateName} onChange={(event) => updateDraft("candidateName", event.target.value)} />
        </label>
        <label>
          简历摘要
          <textarea value={draft.resume} rows={6} onChange={(event) => updateDraft("resume", event.target.value)} />
        </label>
        <label>
          岗位 JD
          <textarea
            value={draft.jobDescription}
            rows={6}
            onChange={(event) => updateDraft("jobDescription", event.target.value)}
          />
        </label>
        <label>
          面试目标
          <textarea
            value={draft.interviewGoal}
            rows={4}
            onChange={(event) => updateDraft("interviewGoal", event.target.value)}
          />
        </label>
        <button type="button" onClick={startInterview}>
          生成问题并开始
        </button>
      </section>

      <section className="panel interview-panel">
        <div className="avatar-row">
          <div className="avatar-face" aria-hidden="true">
            AI
          </div>
          <div>
            <p className="eyebrow">数字人面试官</p>
            <h2>{avatarPrompt}</h2>
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={speakQuestion} disabled={!session}>
            朗读当前问题
          </button>
          <span>{session ? `${session.currentIndex + 1}/${session.questions.length}` : "未开始"}</span>
        </div>
        <ol className="question-list">
          {(session?.questions ?? []).map((question, index) => (
            <li key={question.id} className={session?.currentQuestion?.id === question.id ? "active" : ""}>
              <span>{index + 1}</span>
              <strong>{question.dimension}</strong>
              <p>{question.prompt}</p>
            </li>
          ))}
        </ol>
        <div className="answer-box">
          <label>
            候选人回答
            <textarea
              value={answerText}
              rows={7}
              placeholder="输入或粘贴候选人的回答..."
              onChange={(event) => setAnswerText(event.target.value)}
            />
          </label>
          <label>
            回答用时（秒）
            <input
              type="number"
              min={0}
              value={durationSec}
              onChange={(event) => setDurationSec(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={submitAnswer} disabled={!session?.currentQuestion}>
            记录回答并进入下一题
          </button>
        </div>
      </section>

      <section className="panel output-panel">
        <div>
          <p className="eyebrow">事件日志</p>
          <ul className="events">
            {(session?.events ?? []).map((event, index) => (
              <li key={`${event.timestamp}-${index}`}>{event.message}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow">智能纪要</p>
          <pre>{session && session.answers.length > 0 ? report : "完成至少一道回答后，可生成面试纪要。"}</pre>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
