/**
 * 控制面板页面
 * 仪表盘，展示统计数据和快速入口
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Empty, Tag, Statistic, Row, Col, Spin } from "antd";
import {
  PlusOutlined,
  VideoCameraOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { listSessions } from "../../apiClient";

import "./DashboardPage.css";

type SessionSummary = {
  id: string;
  candidate_name: string;
  role: string;
  created_at: string;
  current_index: number;
  llm_status: string;
  total_questions: number;
};

function sessionStatus(s: SessionSummary): "pending" | "active" | "completed" {
  if (s.total_questions === 0 || s.current_index === 0) return "pending";
  if (s.current_index >= s.total_questions) return "completed";
  return "active";
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listSessions()
      .then((res) => setSessions(res.sessions))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const thisWeekSessions = sessions.filter(
    (s) => new Date(s.created_at) >= weekStart
  );

  const uniqueCandidates = new Set(
    sessions.map((s) => s.candidate_name).filter(Boolean)
  ).size;

  const stats = {
    totalInterviews: sessions.length,
    thisWeek: thisWeekSessions.length,
    activeSessions: sessions.filter((s) => sessionStatus(s) === "active").length,
    candidates: uniqueCandidates,
  };

  return (
    <div className="dashboard-page">
      {/* 页面标题 */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">控制面板</h1>
        <p className="dashboard-subtitle">欢迎回来，今天要开始一场新的面试吗？</p>
      </div>

      {/* 快速操作 */}
      <Card className="dashboard-card quick-action-card">
        <div className="quick-action-content">
          <div className="quick-action-info">
            <h2>开始新面试</h2>
            <p>上传简历、配置岗位、生成面试题目</p>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => navigate("/recruiter/setup")}
          >
            创建面试
          </Button>
        </div>
      </Card>

      {/* 统计卡片 */}
      <Row gutter={16} className="stats-row">
        <Col span={6}>
          <Card className="stats-card">
            <Statistic
              title="总面试数"
              value={stats.totalInterviews}
              prefix={<VideoCameraOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stats-card">
            <Statistic
              title="本周面试"
              value={stats.thisWeek}
              prefix={<ClockCircleOutlined />}
              styles={{ content: { color: "var(--color-primary)" } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stats-card">
            <Statistic
              title="活跃面试"
              value={stats.activeSessions}
              prefix={<VideoCameraOutlined />}
              styles={{ content: { color: "var(--color-success)" } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stats-card">
            <Statistic
              title="候选人数"
              value={stats.candidates}
              prefix={<UserOutlined />}
              styles={{ content: { color: "var(--color-primary)" } }}
            />
          </Card>
        </Col>
      </Row>

      {/* 最近面试 */}
      <Spin spinning={loading}>
        <Card
          className="dashboard-card"
          title="最近面试"
          extra={sessions.length > 0 ? <Button type="link" onClick={() => navigate("/recruiter/setup")}>创建新面试</Button> : null}
        >
          {sessions.length > 0 ? (
            <div className="interview-list">
              {sessions.map((s) => {
                const status = sessionStatus(s);
                return (
                <div
                  key={s.id}
                  className="interview-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(status === "completed" ? `/report/${s.id}` : `/interview/${s.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(status === "completed" ? `/report/${s.id}` : `/interview/${s.id}`); } }}
                  aria-label={`${s.candidate_name} - ${status === "completed" ? "查看报告" : "进入面试"}`}
                >
                  <div className="interview-item-left">
                    <div className="interview-avatar">
                      <UserOutlined />
                    </div>
                    <div className="interview-info">
                      <h4>{s.candidate_name}</h4>
                      <p>
                        {s.role}
                        {s.created_at ? ` · ${new Date(s.created_at).toLocaleDateString("zh-CN")}` : ""}
                        {s.total_questions > 0 ? ` · ${s.current_index}/${s.total_questions} 题` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="interview-item-right">
                    <Tag color={status === "completed" ? "success" : status === "active" ? "processing" : "default"}>
                      {status === "completed" ? "已完成" : status === "active" ? "进行中" : "待面试"}
                    </Tag>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <Empty
              description="暂无面试记录"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" onClick={() => navigate("/recruiter/setup")}>
                创建第一场面试
              </Button>
            </Empty>
          )}
        </Card>
      </Spin>

      {/* 快捷入口 */}
      <Row gutter={16}>
        <Col span={12}>
          <Card
            className="dashboard-card shortcut-card"
            hoverable
            role="button"
            tabIndex={0}
            onClick={() => navigate("/recruiter/setup")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/recruiter/setup"); } }}
            aria-label="面试配置 - 创建和管理面试"
          >
            <div className="shortcut-content">
              <div className="shortcut-icon" style={{ background: "rgba(22, 119, 255, 0.1)" }}>
                <PlusOutlined style={{ color: "#1677ff" }} />
              </div>
              <div className="shortcut-info">
                <h3>面试配置</h3>
                <p>创建和管理面试</p>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card
            className="dashboard-card shortcut-card"
            hoverable
            role="button"
            tabIndex={0}
            onClick={() => navigate("/recruiter/setup")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/recruiter/setup"); } }}
            aria-label="面试间 - 进入视频面试"
          >
            <div className="shortcut-content">
              <div className="shortcut-icon" style={{ background: "rgba(82, 196, 26, 0.1)" }}>
                <VideoCameraOutlined style={{ color: "#52c41a" }} />
              </div>
              <div className="shortcut-info">
                <h3>面试间</h3>
                <p>进入视频面试</p>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default DashboardPage;
