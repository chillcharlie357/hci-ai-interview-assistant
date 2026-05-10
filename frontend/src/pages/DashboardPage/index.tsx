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

type SessionSummary = {
  id: string;
  candidate_name: string;
  role: string;
  created_at: string;
  current_index: number;
  llm_status: string;
};

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
    activeSessions: sessions.filter((s) => s.current_index > 0 && s.llm_status !== "completed").length,
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
              styles={{ content: { color: "#1677ff" } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stats-card">
            <Statistic
              title="活跃面试"
              value={stats.activeSessions}
              prefix={<VideoCameraOutlined />}
              styles={{ content: { color: "#52c41a" } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stats-card">
            <Statistic
              title="候选人数"
              value={stats.candidates}
              prefix={<UserOutlined />}
              styles={{ content: { color: "#722ed1" } }}
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
              {sessions.slice(0, 10).map((s) => (
                <div
                  key={s.id}
                  className="interview-item"
                  onClick={() => navigate(`/report/${s.id}`)}
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
                      </p>
                    </div>
                  </div>
                  <div className="interview-item-right">
                    <Tag color={s.current_index > 0 ? "processing" : "default"}>
                      {s.current_index > 0 ? "进行中" : "待面试"}
                    </Tag>
                  </div>
                </div>
              ))}
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
            onClick={() => navigate("/recruiter/setup")}
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
            onClick={() => navigate("/recruiter/setup")}
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

      <style>{`
        .dashboard-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: var(--space-xl);
        }

        .dashboard-header {
          margin-bottom: var(--space-xl);
        }

        .dashboard-title {
          font-size: 32px;
          font-weight: 700;
          color: var(--color-text);
          margin-bottom: var(--space-sm);
        }

        .dashboard-subtitle {
          font-size: 16px;
          color: var(--color-text-secondary);
        }

        .dashboard-card {
          margin-bottom: var(--space-lg);
          border-radius: var(--radius-xl);
        }

        /* 快速操作卡片 */
        .quick-action-card {
          background: linear-gradient(135deg, rgba(22, 119, 255, 0.05), rgba(82, 196, 26, 0.05));
        }

        .quick-action-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .quick-action-info h2 {
          margin: 0 0 var(--space-xs);
          font-size: 20px;
          font-weight: 600;
          color: var(--color-text);
        }

        .quick-action-info p {
          margin: 0;
          color: var(--color-text-secondary);
        }

        /* 统计卡片 */
        .stats-row {
          margin-bottom: var(--space-lg);
        }

        .stats-card {
          border-radius: var(--radius-lg);
        }

        .stats-card .ant-statistic-title {
          color: var(--color-text-secondary);
        }

        /* 面试列表 */
        .interview-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
        }

        .interview-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-md);
          background: var(--color-bg-layout);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: all 0.2s;
        }

        .interview-item:hover {
          background: rgba(22, 119, 255, 0.05);
        }

        .interview-item-left {
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }

        .interview-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #1677ff, #69b1ff);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 20px;
        }

        .interview-info h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--color-text);
        }

        .interview-info p {
          margin: 4px 0 0;
          font-size: 13px;
          color: var(--color-text-tertiary);
        }

        .interview-item-right {
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }

        .interview-progress {
          font-size: 13px;
          color: var(--color-text-tertiary);
        }

        /* 快捷入口 */
        .shortcut-card {
          border-radius: var(--radius-xl);
        }

        .shortcut-content {
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }

        .shortcut-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-lg);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }

        .shortcut-info h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--color-text);
        }

        .shortcut-info p {
          margin: 4px 0 0;
          font-size: 13px;
          color: var(--color-text-tertiary);
        }
      `}</style>
    </div>
  );
}

export default DashboardPage;
