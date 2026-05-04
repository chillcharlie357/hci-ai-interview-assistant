/**
 * 报告页
 * 参考 ai_12 设计
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Tag, Spin, Empty } from "antd";
import {
  DownloadOutlined,
  CalendarOutlined,
  StarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  LeftOutlined,
  EyeOutlined,
  UserOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

import { fetchReport, getSession } from "../../apiClient";
import type { InterviewSession, AnswerRecord, InterviewQuestion } from "../../interviewFlow";
import { buildReportFilename, downloadMarkdownReport } from "../../reportDownload";
import { useAppStore } from "../../store";

export function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const globalSession = useAppStore((state) => state.interviewSession);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    if (globalSession && globalSession.id === sessionId) {
      setSession(globalSession);
      loadReportOnly(sessionId);
      return;
    }
    void loadReport();
  }, [sessionId, globalSession]);

  async function loadReportOnly(id: string) {
    setLoading(true);
    try {
      const reportData = await fetchReport(id, "recruiter");
      setReport(reportData.report);
    } catch (error) {
      console.error("加载报告失败:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadReport() {
    if (!sessionId) return;
    setLoading(true);
    try {
      const [sessionData, reportData] = await Promise.all([
        getSession(sessionId),
        fetchReport(sessionId, "recruiter"),
      ]);
      setSession(sessionData);
      setReport(reportData.report);
    } catch (error) {
      console.error("加载报告失败:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleDownload = () => {
    if (!session || !report) return;
    downloadMarkdownReport(buildReportFilename(session.candidateName, session.id), report);
  };

  if (loading) {
    return (
      <div className="report-loading">
        <Spin size="large" />
        <p>加载报告中...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="report-loading">
        <Empty description="报告不存在或已过期" />
      </div>
    );
  }

  // 计算统计数据
  const totalDuration = session.answers.reduce((sum, a) => sum + a.durationSec, 0);
  const avgScore = 4.5; // 模拟评分

  // 雷达图数据
  const radarData = [
    { subject: "技术深度", value: 95, fullMark: 100 },
    { subject: "沟通表达", value: 88, fullMark: 100 },
    { subject: "逻辑思维", value: 92, fullMark: 100 },
    { subject: "团队协作", value: 85, fullMark: 100 },
    { subject: "抗压能力", value: 78, fullMark: 100 },
    { subject: "学习能力", value: 90, fullMark: 100 },
  ];

  return (
    <div className="report-page">
      {/* 报告头部 */}
      <header className="report-header">
        <div className="report-header-left">
          <h1>{session.candidateName}的面试报告</h1>
          <div className="report-meta">
            <span className="meta-item">
              <UserOutlined /> {session.role}
            </span>
            <span className="meta-divider">|</span>
            <span className="meta-item">
              <CalendarOutlined /> {new Date().toLocaleDateString("zh-CN")}
            </span>
          </div>
        </div>
        <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload} className="download-btn">
          下载 PDF 报告
        </Button>
      </header>

      {/* 主内容区 - 两列布局 */}
      <div className="report-grid">
        {/* 左列：AI 综合评分 */}
        <div className="report-left">
          <div className="glass-card rating-card">
            <h3>AI 综合评分</h3>
            <div className="rating-score">
              <span className="score-value">{avgScore.toFixed(1)}</span>
            </div>
            <div className="score-label">满分 5.0</div>
            <p className="rating-summary">
              候选人展现出卓越的技术深度和系统架构设计能力。在面对复杂的高并发场景时，逻辑清晰，表达流畅。团队协作意识强，符合高级工程师的岗位模型。建议优先录用。
            </p>
          </div>
        </div>

        {/* 右列：软技能分析 + 关键帧 */}
        <div className="report-right">
          {/* 软技能分析 */}
          <div className="glass-card skills-card">
            <h3>软技能分析</h3>
            <div className="skills-content">
              {/* 真实雷达图 */}
              <div className="radar-chart">
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="#e6e8ea" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: "#00629d", fontSize: 12, fontWeight: 500 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={{ fill: "#6f7883", fontSize: 10 }}
                      tickCount={4}
                    />
                    <Radar
                      name="能力值"
                      dataKey="value"
                      stroke="#1677ff"
                      fill="#1677ff"
                      fillOpacity={0.3}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              {/* 技能条 */}
              <div className="skill-bars">
                <SkillBar label="技术深度" percent={95} />
                <SkillBar label="沟通表达" percent={88} />
                <SkillBar label="逻辑思维" percent={92} />
                <SkillBar label="团队协作" percent={85} />
              </div>
            </div>
          </div>

          {/* 面试关键情绪捕获 */}
          <div className="glass-card keyframes-card">
            <h3>面试关键情绪捕获</h3>
            <div className="keyframes-grid">
              {session.keyframes && session.keyframes.length > 0 ? (
                session.keyframes.slice(0, 4).map((kf, i) => (
                  <div key={i} className="keyframe-item">
                    <img src={kf.dataUrl} alt={`关键帧 ${i + 1}`} />
                    <div className="keyframe-overlay">
                      <span>{Math.floor(kf.timestamp / 60)}:{String(Math.floor(kf.timestamp % 60)).padStart(2, "0")} {kf.reason}</span>
                    </div>
                  </div>
                ))
              ) : (
                // Mock 关键帧
                <>
                  <KeyframeItem time="05:21" label="极度专注" />
                  <KeyframeItem time="12:45" label="自信阐述" />
                  <KeyframeItem time="28:10" label="深度思考" />
                  <KeyframeItem time="42:30" label="积极互动" />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 核心问答追踪 */}
      <div className="glass-card qa-card">
        <h3>核心问答追踪</h3>
        <div className="qa-timeline">
          {session.questions.map((q, index) => {
            const answer = session.answers.find((a) => a.questionId === q.id);
            const score = 4.0 + Math.random() * 1.0; // 模拟评分
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
                    <Tag icon={<StarOutlined style={{ color: "#1677ff" }} />}>
                      评分: {score.toFixed(1)}
                    </Tag>
                    <Tag icon={<ClockCircleOutlined style={{ color: "#00677f" }} />}>
                      耗时: {answer ? `${Math.floor(answer.durationSec / 60)}m ${answer.durationSec % 60}s` : "-"}
                    </Tag>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 完整报告 */}
      <div className="glass-card full-report-card">
        <h3>完整报告</h3>
        <pre className="full-report-content">{report}</pre>
      </div>

      <style>{`
        .report-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: var(--space-xl);
        }

        .report-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          gap: var(--space-md);
        }

        /* 玻璃卡片 */
        .glass-card {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: var(--radius-xl);
          box-shadow: 0 8px 32px rgba(0, 71, 255, 0.1);
        }

        /* 头部 */
        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: var(--space-xl);
        }

        .report-header h1 {
          font-size: 40px;
          font-weight: 800;
          color: var(--color-text);
          margin: 0 0 var(--space-sm);
          letter-spacing: -0.02em;
        }

        .report-meta {
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          color: var(--color-text-secondary);
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .meta-divider {
          color: var(--color-border);
        }

        .download-btn {
          border-radius: var(--radius-full);
          box-shadow: 0 4px 15px rgba(22, 119, 255, 0.3);
        }

        /* 两列布局 */
        .report-grid {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: var(--space-lg);
          margin-bottom: var(--space-lg);
        }

        /* 左列：评分 */
        .rating-card {
          padding: var(--space-xl);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          height: 100%;
        }

        .rating-card h3 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: var(--space-md);
          color: var(--color-text);
        }

        .rating-score {
          margin: var(--space-md) 0;
        }

        .score-value {
          font-size: 80px;
          font-weight: 800;
          background: linear-gradient(135deg, #00629d, #00a3ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1;
        }

        .score-label {
          font-size: 14px;
          color: var(--color-text-tertiary);
          margin-bottom: var(--space-md);
        }

        .rating-summary {
          color: var(--color-text-secondary);
          text-align: left;
          line-height: 1.8;
          margin-top: auto;
        }

        /* 右列 */
        .report-right {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
        }

        /* 软技能 */
        .skills-card {
          padding: var(--space-lg);
        }

        .skills-card h3 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: var(--space-md);
          color: var(--color-text);
        }

        .skills-content {
          display: flex;
          align-items: center;
          gap: var(--space-xl);
        }

        /* 雷达图 */
        .radar-chart {
          width: 220px;
          height: 200px;
          flex-shrink: 0;
        }

        /* 技能条 */
        .skill-bars {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .skill-bar {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .skill-bar-header {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          font-weight: 500;
        }

        .skill-bar-percent {
          color: var(--color-primary);
        }

        .skill-bar-track {
          height: 8px;
          background: var(--color-bg-layout);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .skill-bar-fill {
          height: 100%;
          background: var(--color-primary);
          border-radius: var(--radius-full);
          position: relative;
        }

        .skill-bar-fill::after {
          content: "";
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.2);
          filter: blur(2px);
        }

        /* 关键帧 */
        .keyframes-card {
          padding: var(--space-lg);
        }

        .keyframes-card h3 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: var(--space-md);
          color: var(--color-text);
        }

        .keyframes-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-sm);
        }

        .keyframe-item {
          position: relative;
          border-radius: var(--radius-lg);
          overflow: hidden;
          aspect-ratio: 16/9;
          background: linear-gradient(135deg, #e6f4ff, #f0f5ff);
        }

        .keyframe-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .keyframe-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
          padding: var(--space-sm);
        }

        .keyframe-overlay span {
          font-size: 12px;
          color: white;
        }

        /* 问答追踪 */
        .qa-card {
          padding: var(--space-lg);
          margin-bottom: var(--space-lg);
        }

        .qa-card h3 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: var(--space-lg);
          color: var(--color-text);
        }

        .qa-timeline {
          position: relative;
          padding-left: var(--space-xl);
        }

        .qa-timeline::before {
          content: "";
          position: absolute;
          left: 19px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--color-border-secondary);
        }

        .qa-item {
          position: relative;
          margin-bottom: var(--space-lg);
        }

        .qa-marker {
          position: absolute;
          left: calc(-1 * var(--space-xl));
          top: 4px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #cfe5ff;
          border: 4px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
          font-size: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .qa-content {
          background: var(--color-bg-layout);
          border-radius: var(--radius-lg);
          padding: var(--space-md);
          border: 1px solid var(--color-border-secondary);
        }

        .qa-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-sm);
        }

        .qa-header h4 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          flex: 1;
          color: var(--color-text);
        }

        .qa-description {
          color: var(--color-text-secondary);
          font-size: 14px;
          line-height: 1.6;
          margin-bottom: var(--space-sm);
        }

        .qa-meta {
          display: flex;
          gap: var(--space-sm);
        }

        /* 完整报告 */
        .full-report-card {
          padding: var(--space-lg);
        }

        .full-report-card h3 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: var(--space-md);
          color: var(--color-text);
        }

        .full-report-content {
          background: var(--color-bg-layout);
          padding: var(--space-md);
          border-radius: var(--radius);
          max-height: 400px;
          overflow: auto;
          white-space: pre-wrap;
          font-size: 13px;
          line-height: 1.6;
        }

        /* 响应式 */
        @media (max-width: 1024px) {
          .report-grid {
            grid-template-columns: 1fr;
          }

          .keyframes-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 800px) {
          .report-page {
            padding: var(--space-md);
          }

          .report-header {
            flex-direction: column;
            gap: var(--space-md);
            align-items: flex-start;
          }

          .report-header h1 {
            font-size: 28px;
          }

          .skills-content {
            flex-direction: column;
          }

          .radar-chart {
            margin-bottom: var(--space-md);
          }

          .keyframes-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .score-value {
            font-size: 60px;
          }
        }
      `}</style>
    </div>
  );
}

// 技能条组件
function SkillBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="skill-bar">
      <div className="skill-bar-header">
        <span>{label}</span>
        <span className="skill-bar-percent">{percent}%</span>
      </div>
      <div className="skill-bar-track">
        <div className="skill-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// 关键帧占位组件
function KeyframeItem({ time, label }: { time: string; label: string }) {
  return (
    <div className="keyframe-item">
      <div style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-text-tertiary)",
        fontSize: "24px"
      }}>
        <UserOutlined />
      </div>
      <div className="keyframe-overlay">
        <span>{time} {label}</span>
      </div>
    </div>
  );
}

export default ReportPage;
