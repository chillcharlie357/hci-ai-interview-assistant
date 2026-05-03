/**
 * 无会话提示页面
 * 当用户直接访问 /interview 或 /report 但没有 sessionId 时显示
 */

import { useNavigate } from "react-router-dom";
import { Button, Empty } from "antd";
import { HomeOutlined, PlusOutlined } from "@ant-design/icons";
import { useAppStore } from "../../store";

interface NoSessionPageProps {
  type: "interview" | "report";
}

export function NoSessionPage({ type }: NoSessionPageProps) {
  const navigate = useNavigate();
  const interviewSession = useAppStore((state) => state.interviewSession);

  const content = {
    interview: {
      title: "请先创建面试",
      description: "您需要先在招聘端创建面试，才能进入面试间。请复制面试链接或从控制面板进入。",
    },
    report: {
      title: "请先选择面试",
      description: "您需要先完成一场面试，才能查看评价报告。请从控制面板选择已完成的面试。",
    },
  };

  // 如果有 session，自动跳转到具体页面
  if (interviewSession) {
    const targetPath = type === "interview"
      ? `/interview/${interviewSession.id}`
      : `/report/${interviewSession.id}`;
    navigate(targetPath, { replace: true });
    return null;
  }

  return (
    <div className="no-session-page">
      <Empty
        description={
          <div className="no-session-content">
            <h2>{content[type].title}</h2>
            <p>{content[type].description}</p>
          </div>
        }
      />
      <div className="no-session-actions">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate("/recruiter/setup")}
        >
          创建新面试
        </Button>
        <Button icon={<HomeOutlined />} onClick={() => navigate("/recruiter")}>
          返回控制面板
        </Button>
      </div>

      <style>{`
        .no-session-page {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - var(--topbar-height));
          padding: var(--space-xl);
          gap: var(--space-lg);
        }

        .no-session-content {
          text-align: center;
        }

        .no-session-content h2 {
          font-size: 20px;
          font-weight: 600;
          color: var(--color-text);
          margin-bottom: var(--space-sm);
        }

        .no-session-content p {
          font-size: 14px;
          color: var(--color-text-secondary);
          max-width: 400px;
        }

        .no-session-actions {
          display: flex;
          gap: var(--space-md);
        }
      `}</style>
    </div>
  );
}

export default NoSessionPage;
