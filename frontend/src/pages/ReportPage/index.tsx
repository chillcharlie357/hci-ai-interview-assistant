import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Spin, Empty, App } from "antd";
import {
  DownloadOutlined,
  CalendarOutlined,
  UserOutlined,
} from "@ant-design/icons";

import { fetchReport, getSession } from "@/apiClient";
import type { InterviewSession } from "@/interviewFlow";
import { buildReportFilename, downloadMarkdownReport } from "@/reportDownload";
import { useAppStore } from "@/store";

import { computeDimensionScores, generateRatingSummary } from "./helpers/scoring";
import { RatingCard } from "./components/RatingCard";
import { SkillsRadar } from "./components/SkillsRadar";
import { KeyframesGallery } from "./components/KeyframesGallery";
import { QATimeline } from "./components/QATimeline";
import { FullReportSection } from "./components/FullReportSection";

import "./ReportPage.css";

export function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { message } = App.useApp();
  const globalSession = useAppStore((state) => state.interviewSession);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    if (globalSession && globalSession.id === sessionId) {
      setSession(globalSession);
      void loadReportOnly(sessionId, cancelled);
    } else {
      void loadFullReport(cancelled);
    }

    return () => { cancelled = true; };
  }, [sessionId, globalSession]);

  async function loadReportOnly(id: string, cancelled: boolean) {
    setLoading(true);
    setLoadError("");
    try {
      const reportData = await fetchReport(id);
      if (cancelled) return;
      setReport(reportData.report);
    } catch (error) {
      if (cancelled) return;
      const msg = error instanceof Error ? error.message : "加载报告失败";
      setLoadError(msg);
      message.error(msg);
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  async function loadFullReport(cancelled: boolean) {
    if (!sessionId) return;
    setLoading(true);
    setLoadError("");
    try {
      const [sessionData, reportData] = await Promise.all([
        getSession(sessionId),
        fetchReport(sessionId),
      ]);
      if (cancelled) return;
      setSession(sessionData);
      setReport(reportData.report);
    } catch (error) {
      if (cancelled) return;
      const msg = error instanceof Error ? error.message : "加载报告失败";
      setLoadError(msg);
      message.error(msg);
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  const handleDownload = () => {
    if (!session || !report) return;
    downloadMarkdownReport(buildReportFilename(session.candidateName, session.id), report);
  };

  // 数据计算 memo 化
  const dimensionScores = useMemo(() => session ? computeDimensionScores(session) : {}, [session]);

  const radarData = useMemo(() =>
    Object.entries(dimensionScores).map(([subject, value]) => ({
      subject,
      value: Math.round(value),
      fullMark: 100,
    })),
    [dimensionScores]
  );

  const topSkills = useMemo(() => radarData.slice(0, 4), [radarData]);

  const avgScore = useMemo(() =>
    radarData.length > 0
      ? radarData.reduce((sum, d) => sum + d.value, 0) / radarData.length / 20
      : 0,
    [radarData]
  );

  const ratingSummary = useMemo(() =>
    session ? generateRatingSummary(session, dimensionScores) : "",
    [session, dimensionScores]
  );

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
        <Empty description={loadError || "报告不存在或已过期"} />
      </div>
    );
  }

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
        <div className="report-left">
          <RatingCard avgScore={avgScore} ratingSummary={ratingSummary} />
        </div>

        <div className="report-right">
          <SkillsRadar
            radarData={radarData}
            topSkills={topSkills}
            speechSummary={session.speechSummary}
          />
          <KeyframesGallery keyframes={session.keyframes} />
        </div>
      </div>

      <QATimeline session={session} />
      <FullReportSection report={report} />
    </div>
  );
}

export default ReportPage;
