/**
 * 登录页面 - 使用 Ant Design Pro LoginFormPage
 * 遵循 spec 前端设计文档：浅色背景 + 玻璃拟态
 */

import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { LoginFormPage, ProFormText } from "@ant-design/pro-components";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { App, theme } from "antd";
import { useAuthStore } from "./authStore";
import { getApiBaseUrl } from "../config";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/recruiter";

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "登录失败");
      }

      const data = await response.json();
      setTokens(data.access_token, data.refresh_token);
      setUser({
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.full_name,
        avatarUrl: data.user.avatar_url,
      });

      message.success("登录成功");
      navigate(from, { replace: true });
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : "登录失败");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: "#f5f5f5", height: "100vh" }}>
      <LoginFormPage
        // 使用渐变背景，符合 spec 的"科技灵动"风格
        backgroundImageUrl="https://mdn.alipayobjects.com/huamei_gcee1x/afts/img/A*y0ZTS6WLwvgAAAAAAAAAAAAADml6AQ/fmt.webp"
        logo={
          <svg viewBox="0 0 48 48" fill="none" style={{ width: 44, height: 44 }}>
            <path
              d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
              stroke="#1677ff"
              strokeWidth="2"
              fill="none"
            />
            <path d="M24 12L34 18V30L24 36L14 30V18L24 12Z" fill="#1677ff" opacity="0.3" />
            <circle cx="24" cy="24" r="4" fill="#1677ff" />
          </svg>
        }
        backgroundVideoUrl="https://gw.alipayobjects.com/v/huamei_gcee1x/afts/video/jXRBRK_VAwoAAAAAAAAAAAAAK4eUAQBr"
        title="AI 面试助手"
        subTitle="智能面试训练平台"
        // 玻璃拟态容器 - 浅色半透明背景
        containerStyle={{
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          borderRadius: 16,
          border: "1px solid rgba(0, 0, 0, 0.08)",
        }}
        // 活动配置 - 引导注册
        activityConfig={{
          style: {
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
            color: token.colorText,
            borderRadius: 12,
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(8px)",
          },
          title: "开始您的 AI 面试训练",
          subTitle: "智能模拟面试，提升面试技能",
          action: (
            <Link to="/register">
              <button
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  background: "#1677ff",
                  color: "#fff",
                  border: "none",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                立即注册
              </button>
            </Link>
          ),
        }}
        onFinish={handleLogin}
        submitter={{
          searchConfig: { submitText: "登录" },
          submitButtonProps: {
            loading,
            size: "large",
            style: { width: "100%" },
          },
        }}
      >
        <ProFormText
          name="email"
          fieldProps={{
            size: "large",
            prefix: <UserOutlined style={{ color: token.colorText }} />,
          }}
          placeholder="邮箱地址"
          rules={[
            { required: true, message: "请输入邮箱" },
            { type: "email", message: "请输入有效的邮箱地址" },
          ]}
        />
        <ProFormText.Password
          name="password"
          fieldProps={{
            size: "large",
            prefix: <LockOutlined style={{ color: token.colorText }} />,
          }}
          placeholder="密码"
          rules={[{ required: true, message: "请输入密码" }]}
        />
        <div
          style={{
            marginTop: 24,
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Link to="/register">还没有账号？立即注册</Link>
          <a>忘记密码？</a>
        </div>
      </LoginFormPage>
    </div>
  );
}
