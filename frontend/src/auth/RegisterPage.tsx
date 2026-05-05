/**
 * 注册页面 - 使用 Ant Design Pro LoginFormPage
 * 遵循 spec 前端设计文档：浅色背景 + 玻璃拟态
 */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LoginFormPage, ProFormText } from "@ant-design/pro-components";
import { LockOutlined, UserOutlined, MailOutlined } from "@ant-design/icons";
import { theme, message } from "antd";
import { useAuthStore } from "./authStore";
import { getApiBaseUrl } from "../config";

export function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { token } = theme.useToken();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);

  const handleRegister = async (values: {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    if (values.password !== values.confirmPassword) {
      message.error("两次输入的密码不一致");
      return false;
    }

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          full_name: values.fullName,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "注册失败");
      }

      const data = await response.json();
      setTokens(data.access_token, data.refresh_token);
      setUser({
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.full_name,
        avatarUrl: data.user.avatar_url,
      });

      message.success("注册成功");
      navigate("/recruiter", { replace: true });
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : "注册失败");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: "#f5f5f5", height: "100vh" }}>
      <LoginFormPage
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
        title="创建账户"
        subTitle="开始您的 AI 面试训练之旅"
        // 玻璃拟态容器 - 浅色半透明背景
        containerStyle={{
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          borderRadius: 16,
          border: "1px solid rgba(0, 0, 0, 0.08)",
        }}
        activityConfig={{
          style: {
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
            color: token.colorText,
            borderRadius: 12,
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(8px)",
          },
          title: "已有账号？",
          subTitle: "立即登录继续您的训练",
          action: (
            <Link to="/login">
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
                去登录
              </button>
            </Link>
          ),
        }}
        onFinish={handleRegister}
        submitter={{
          searchConfig: { submitText: "注册" },
          submitButtonProps: {
            loading,
            size: "large",
            style: { width: "100%" },
          },
        }}
      >
        <ProFormText
          name="fullName"
          fieldProps={{
            size: "large",
            prefix: <UserOutlined style={{ color: token.colorText }} />,
          }}
          placeholder="您的姓名"
          rules={[{ required: true, message: "请输入姓名" }]}
        />
        <ProFormText
          name="email"
          fieldProps={{
            size: "large",
            prefix: <MailOutlined style={{ color: token.colorText }} />,
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
          placeholder="设置密码（至少6位）"
          rules={[
            { required: true, message: "请输入密码" },
            { min: 6, message: "密码至少 6 个字符" },
          ]}
        />
        <ProFormText.Password
          name="confirmPassword"
          fieldProps={{
            size: "large",
            prefix: <LockOutlined style={{ color: token.colorText }} />,
          }}
          placeholder="确认密码"
          rules={[{ required: true, message: "请确认密码" }]}
        />
        <div
          style={{
            marginTop: 24,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          <Link to="/login">已有账号？立即登录</Link>
        </div>
      </LoginFormPage>
    </div>
  );
}
