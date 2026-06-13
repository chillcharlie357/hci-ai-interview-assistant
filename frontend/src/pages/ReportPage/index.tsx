import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Spin, Empty, App } from "antd";
import {
  DownloadOutlined,
  CalendarOutlined,
  UserOutlined,
} from "@ant-design/icons";

import { fetchKeyframeDataUrl, fetchReport, fetchVideoUrl, getSession } from "@/apiClient";
import type { InterviewSession, KeyframeRecord } from "@/interviewFlow";
import {
  downloadPdfReport,
} from "@/reportDownload";
import { useAppStore } from "@/store";

import {
  computeDimensionScores,
  generateRatingSummary,
} from "./helpers/scoring";
import { RatingCard } from "./components/RatingCard";
import { SkillsRadar } from "./components/SkillsRadar";
import { KeyframesGallery } from "./components/KeyframesGallery";
import { QATimeline } from "./components/QATimeline";
import { FullReportSection } from "./components/FullReportSection";
import { VideoPlaybackCard } from "./components/VideoPlaybackCard";

import "./ReportPage.css";

export function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { message } = App.useApp();
  const globalSession = useAppStore((state) => state.interviewSession);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    if (globalSession && globalSession.id === sessionId) {
      setSession(globalSession);
      void loadKeyframeImages(sessionId, globalSession, () => cancelled);
      void loadReportOnly(sessionId, cancelled);
    } else {
      void loadFullReport(cancelled);
    }

    return () => {
      cancelled = true;
    };
  }, [sessionId, globalSession]);

  useEffect(() => {
    if (session?.videoPath && !videoUrl && !videoLoading) {
      void loadVideo();
    }
  }, [session?.videoPath]);

  async function loadVideo() {
    if (!sessionId || !session?.videoPath) return;
    setVideoLoading(true);
    setVideoError("");
    try {
      const url = await fetchVideoUrl(sessionId);
      if (url) setVideoUrl(url);
    } catch (e) {
      setVideoError("视频加载失败，请稍后重试");
    } finally {
      setVideoLoading(false);
    }
  }

  const seekTo = useCallback(
    (timestampSec: number) => {
      const video = videoRef.current;
      if (!video) {
        if (!videoUrl && !videoLoading) {
          // 视频尚未加载，先触发加载
          void loadVideo().then(() => {
            const v = videoRef.current;
            if (v) {
              v.currentTime = timestampSec;
              v.play().catch(() => {});
            }
          });
        }
        return;
      }
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        video.currentTime = timestampSec;
        video.play().catch(() => {});
      } else {
        video.addEventListener(
          "loadeddata",
          () => {
            video.currentTime = timestampSec;
            video.play().catch(() => {});
          },
          { once: true }
        );
      }
    },
    [videoUrl, videoLoading, sessionId]
  );

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
      void loadKeyframeImages(sessionId, sessionData, () => cancelled);
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
    if (!session) return;
    void downloadPdfReport(session.candidateName, session.id, ".report-page");
  };

  async function loadKeyframeImages(
    id: string,
    sourceSession: InterviewSession,
    isCancelled: () => boolean
  ) {
    const keyframes = sourceSession.keyframes || [];
    const indexes = keyframes
      .slice(0, 4)
      .map((kf, index) => ({ kf, index }))
      .filter(({ kf }) => !kf.dataUrl)
      .map(({ index }) => index);
    if (indexes.length === 0) return;

    try {
      const images = await Promise.all(
        indexes.map(async (index) => ({
          index,
          dataUrl: await fetchKeyframeDataUrl(id, index),
        }))
      );
      if (isCancelled()) return;

      const imageByIndex = new Map(
        images
          .filter((item): item is { index: number; dataUrl: string } => Boolean(item.dataUrl))
          .map((item) => [item.index, item.dataUrl])
      );
      if (imageByIndex.size === 0) return;

      setSession((prev) => {
        if (!prev || prev.id !== id) return prev;
        const nextKeyframes: KeyframeRecord[] = (prev.keyframes || []).map((kf, index) => {
          const dataUrl = imageByIndex.get(index);
          return dataUrl ? { ...kf, dataUrl } : kf;
        });
        return { ...prev, keyframes: nextKeyframes };
      });
    } catch {
      // 缩略图只是报告增强能力；失败时保留可跳转的视频时间戳卡片。
    }
  }

  const dimensionScores = useMemo(
    () => (session ? computeDimensionScores(session) : {}),
    [session]
  );

  const radarData = useMemo(
    () =>
      Object.entries(dimensionScores).map(([subject, value]) => ({
        subject,
        value: Math.round(value),
        fullMark: 100,
      })),
    [dimensionScores]
  );

  const topSkills = useMemo(() => radarData.slice(0, 4), [radarData]);

  const avgScore = useMemo(
    () =>
      radarData.length > 0
        ? radarData.reduce((sum, d) => sum + d.value, 0) /
          radarData.length /
          20
        : 0,
    [radarData]
  );

  const ratingSummary = useMemo(
    () =>
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
      <header className="report-header">
        <div className="report-header-left">
          <h1>{session.candidateName}的面试报告</h1>
          <div className="report-meta">
            <span className="meta-item">
              <UserOutlined /> {session.role}
            </span>
            <span className="meta-divider">|</span>
            <span className="meta-item">
              <CalendarOutlined />{" "}
              {session.createdAt
                ? new Date(session.createdAt).toLocaleDateString("zh-CN")
                : "日期未知"}
            </span>
          </div>
        </div>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleDownload}
          className="download-btn"
        >
          下载 PDF 报告
        </Button>
      </header>

      <div className="report-body">
        {session.videoPath && (
          <VideoPlaybackCard
            videoUrl={videoUrl}
            videoLoading={videoLoading}
            videoError={videoError}
            videoDurationSec={session.videoDurationSec}
            videoRef={videoRef}
          />
        )}

        <RatingCard avgScore={avgScore} ratingSummary={ratingSummary} />

        <SkillsRadar
          radarData={radarData}
          topSkills={topSkills}
          speechSummary={session.speechSummary ?? null}
        />

        <KeyframesGallery
          keyframes={session.keyframes || []}
          hasVideo={!!session.videoPath}
          onSeekVideo={seekTo}
        />

        <QATimeline session={session} onSeekVideo={seekTo} />

        <FullReportSection report={report} />
      </div>
    </div>
  );
}

export default ReportPage;
