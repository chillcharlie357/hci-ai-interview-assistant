/**
 * 报告页
 * 参考 ai_12 设计
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Tag, Spin, Empty, Divider, Progress } from "antd";
import {
  DownloadOutlined,
  SolutionOutlined,
  CalendarOutlined,
  StarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

import { fetchReport, getSession } from "../../apiClient";
import type { InterviewSession } from "../../interviewFlow";
import { buildReportFilename, downloadMarkdownReport } from "../../reportDownload";
import { useAppStore } from "../../store";

export function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const globalSession = useAppStore((state) => state.interviewSession);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    // 如果全局状态中有匹配的 session，直接使用
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

  // 解析报告内容（简化版本）
  const reportLines = report.split("\n");
  const titleMatch = report.match(/#\s+(.+)/);
  const reportTitle = titleMatch ? titleMatch[1] : "面试报告";

  return (
    <div className="report-page">
      {/* 报告头部 */}
      <div className="report-header">
        <div className="report-header-info">
          <h1>{session.candidateName}的面试报告</h1>
          <div className="report-meta">
            <Tag icon={<SolutionOutlined />} color="blue">{session.role}</Tag>
            <Tag icon={<CalendarOutlined />}>{new Date().toLocaleDateString("zh-CN")}</Tag>
          </div>
        </div>
        <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload} className="download-btn">
          下载 PDF 报告
        </Button>
      </div>

      {/* 主内容区 */}
      <div className="report-content">
        {/* 综合评分卡片 */}
        <Card className="rating-card glass-card">
          <h2>AI 综合评分</h2>
          <div className="rating-score">
            <span className="score-value">4.8</span>
            <span className="score-max">/ 5.0</span>
          </div>
          <p className="rating-summary">
            候选人展现出卓越的技术深度和系统架构设计能力。在面对复杂的高并发场景时，逻辑清晰，表达流畅。团队协作意识强，符合高级工程师的岗位模型。建议优先录用。
          </p>
        </Card>

        {/* 技能分析卡片 */}
        <Card className="skills-card glass-card" title="软技能分析">
          <div className="skills-grid">
            <div className="skill-item">
              <div className="skill-header">
                <span>技术深度</span>
                <span className="skill-percent">95%</span>
              </div>
              <Progress percent={95} showInfo={false} strokeColor="#1677ff" />
            </div>
            <div className="skill-item">
              <div className="skill-header">
                <span>沟通表达</span>
                <span className="skill-percent">88%</span>
              </div>
              <Progress percent={88} showInfo={false} strokeColor="#1677ff" />
            </div>
            <div className="skill-item">
              <div className="skill-header">
                <span>逻辑思维</span>
                <span className="skill-percent">92%</span>
              </div>
              <Progress percent={92} showInfo={false} strokeColor="#1677ff" />
            </div>
            <div className="skill-item">
              <div className="skill-header">
                <span>团队协作</span>
                <span className="skill-percent">85%</span>
              </div>
              <Progress percent={85} showInfo={false} strokeColor="#1677ff" />
            </div>
          </div>
        </Card>

        {/* 问答时间线 */}
        <Card className="qa-card glass-card" title="核心问答追踪">
          <div className="qa-timeline">
            {session.questions.map((q, index) => {
              const answer = session.answers.find((a) => a.questionId === q.id);
              return (
                <div key={q.id} className="qa-item">
                  <div className="qa-marker">
                    <div className="qa-marker-dot" />
                  </div>
                  <div className="qa-content">
                    <div className="qa-header">
                      <h4>{q.prompt}</h4>
                      {index === 0 && <Tag color="blue">核心亮点</Tag>}
                    </div>
                    <p className="qa-description">
                      {answer
                        ? `回答耗时 ${answer.durationSec} 秒，${answer.wordCount} 字`
                        : "暂无回答记录"}
                    </p>
                    {answer && (
                      <div className="qa-meta">
                        <Tag icon={<StarOutlined />}>评分: 4.5</Tag>
                        <Tag icon={<ClockCircleOutlined />}>耗时: {answer.durationSec}s</Tag>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 完整报告 */}
        <Card className="full-report-card glass-card" title="完整报告">
          <pre className="full-report-content">{report}</pre>
        </Card>
      </div>

      <style>{`
        .report-page {
          max-width: var(--report-max-width);
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

        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-xl);
        }

        .report-header h1 {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: var(--space-sm);
        }

        .report-meta {
          display: flex;
          gap: var(--space-sm);
        }

        .download-btn {
          border-radius: var(--radius-full);
          box-shadow: var(--shadow-glow-primary);
        }

        .report-content {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
        }

        .rating-card {
          text-align: center;
          padding: var(--space-xl);
        }

        .rating-card h2 {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: var(--space-md);
        }

        .rating-score {
          margin: var(--space-md) 0;
        }

        .score-value {
          font-size: 80px;
          font-weight: 800;
          background: linear-gradient(135deg, #1677ff, #69b1ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .score-max {
          font-size: 24px;
          color: var(--color-text-tertiary);
        }

        .rating-summary {
          color: var(--color-text-secondary);
          text-align: left;
          line-height: 1.8;
        }

        .skills-card {
          padding: var(--space-lg);
        }

        .skills-grid {
          display: grid;
          gap: var(--space-md);
        }

        .skill-item {
          margin-bottom: var(--space-sm);
        }

        .skill-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: var(--space-xs);
        }

        .skill-percent {
          color: var(--color-primary);
          font-weight: 600;
        }

        .qa-card {
          padding: var(--space-lg);
        }

        .qa-timeline {
          position: relative;
          padding-left: var(--space-xl);
        }

        .qa-timeline::before {
          content: "";
          position: absolute;
          left: 10px;
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
        }

        .qa-marker-dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--color-primary-bg);
          border: 4px solid white;
          box-shadow: var(--shadow-sm);
        }

        .qa-content {
          background: var(--color-bg-layout);
          border-radius: var(--radius);
          padding: var(--space-md);
        }

        .qa-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-sm);
        }

        .qa-header h4 {
          font-size: 16px;
          font-weight: 500;
          margin: 0;
          flex: 1;
        }

        .qa-description {
          color: var(--color-text-secondary);
          font-size: 14px;
          margin-bottom: var(--space-sm);
        }

        .qa-meta {
          display: flex;
          gap: var(--space-sm);
        }

        .full-report-card {
          padding: var(--space-lg);
        }

        .full-report-content {
          background: var(--color-bg-layout);
          padding: var(--space-md);
          border-radius: var(--radius);
          max-height: 600px;
          overflow: auto;
          white-space: pre-wrap;
          font-size: 13px;
          line-height: 1.6;
        }

        @media (max-width: 800px) {
          .report-page {
            padding: var(--space-md);
          }

          .report-header {
            flex-direction: column;
            gap: var(--space-md);
          }

          .report-header h1 {
            font-size: 24px;
          }

          .score-value {
            font-size: 60px;
          }
        }
      `}</style>
    </div>
  );
}

export default ReportPage;
