/**
 * 顶部导航栏组件
 * 参考 ai_9-12 设计
 */

import { useNavigate } from "react-router-dom";
import { Button, Space } from "antd";
import { BellOutlined, SettingOutlined, PlusOutlined } from "@ant-design/icons";
import { useAppStore } from "../../store";

interface TopNavBarProps {
  title?: string;
  showActions?: boolean;
}

export function TopNavBar({ title = "AI 智能面试系统", showActions = true }: TopNavBarProps) {
  const navigate = useNavigate();
  const clearAll = useAppStore((state) => state.clearAll);

  const handleNewInterview = () => {
    clearAll();
    navigate("/recruiter/setup");
  };

  return (
    <header className="top-nav-bar">
      <div className="top-nav-bar-left">
        <span className="top-nav-bar-logo">{title}</span>
      </div>
      {showActions && (
        <div className="top-nav-bar-right">
          <Button type="primary" icon={<PlusOutlined />} className="top-nav-bar-action-btn" onClick={handleNewInterview}>
            开启新面试
          </Button>
          <Space size={8}>
            <Button type="text" icon={<BellOutlined />} className="top-nav-bar-icon-btn" />
            <Button type="text" icon={<SettingOutlined />} className="top-nav-bar-icon-btn" />
            <div className="top-nav-bar-avatar">
              <span>HR</span>
            </div>
          </Space>
        </div>
      )}
      <style>{`
        .top-nav-bar {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: var(--topbar-height);
          z-index: 100;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 32px;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 8px 32px rgba(0, 163, 255, 0.1);
        }

        .top-nav-bar-left {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .top-nav-bar-logo {
          font-size: 20px;
          font-weight: 800;
          color: var(--color-primary);
          letter-spacing: -0.02em;
        }

        .top-nav-bar-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .top-nav-bar-action-btn {
          border-radius: var(--radius-full);
          box-shadow: var(--shadow-glow-primary);
        }

        .top-nav-bar-icon-btn {
          color: var(--color-text-secondary);
          border-radius: var(--radius-full);
        }

        .top-nav-bar-icon-btn:hover {
          color: var(--color-primary);
          background: rgba(22, 119, 255, 0.1);
        }

        .top-nav-bar-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--color-primary), #69b1ff);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: transform var(--transition-fast);
        }

        .top-nav-bar-avatar:hover {
          transform: scale(1.05);
        }

        @media (max-width: 768px) {
          .top-nav-bar {
            padding: 0 16px;
          }

          .top-nav-bar-action-btn {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
