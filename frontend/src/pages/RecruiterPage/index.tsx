/**
 * 招聘端页面
 * 参考 ai_10 设计
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Input,
  Select,
  Switch,
  Upload,
  Card,
  Spin,
  Tag,
  Divider,
  App,
  Space,
} from "antd";
import {
  UploadOutlined,
  RocketOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  EyeOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

import {
  createInterviewSessionFromPrep,
  createMockSession,
  submitPrepFollowup,
  submitResume,
  fetchReport,
} from "../../apiClient";
import type { PrepSession, InterviewSession } from "../../interviewFlow";
import { buildQuestionPreviewItems } from "../../questionPreview";
import { toBase64 } from "@/utils/file";
import { buildReportFilename, downloadMarkdownReport } from "../../reportDownload";
import { useAppStore } from "../../store";

import "./RecruiterPage.css";

const { Dragger } = Upload;
const { TextArea } = Input;

// 预设岗位模板
const JOB_TEMPLATES = [
  {
    label: "前端工程师",
    value: "frontend",
    role: "前端工程师",
    jobDescription: "负责 Web 前端开发，熟悉 React/Vue 框架，有良好的工程化实践。",
    interviewGoal: "评估前端技术能力、项目经验和工程落地能力。",
  },
  {
    label: "后端工程师",
    value: "backend",
    role: "后端工程师",
    jobDescription: "负责服务端开发，熟悉 Python/Java/Go，有分布式系统经验。",
    interviewGoal: "评估后端技术深度、系统设计能力和问题解决能力。",
  },
  {
    label: "全栈工程师",
    value: "fullstack",
    role: "全栈工程师",
    jobDescription: "负责前后端开发，熟悉 React + Python/Node.js，有完整项目经验。",
    interviewGoal: "评估全栈技术能力、项目经验和端到端交付能力。",
  },
  {
    label: "AI/LLM 工程师",
    value: "ai",
    role: "AI/LLM 工程师",
    jobDescription: "负责 LLM 应用开发，熟悉 RAG、Agent、Prompt Engineering。",
    interviewGoal: "评估 LLM 应用能力、技术理解和产品落地经验。",
  },
  {
    label: "产品经理",
    value: "pm",
    role: "产品经理",
    jobDescription: "负责产品规划和迭代，有用户研究、数据分析和跨团队协作经验。",
    interviewGoal: "评估产品思维、沟通协作能力和项目推动能力。",
  },
];

export function RecruiterPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const prep = useAppStore((state) => state.prepSession);
  const setPrep = useAppStore((state) => state.setPrepSession);
  const session = useAppStore((state) => state.interviewSession);
  const setSession = useAppStore((state) => state.setInterviewSession);

  const [candidateName, setCandidateName] = useState(prep?.candidateName || "候选人");
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  // 岗位配置
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [interviewGoal, setInterviewGoal] = useState("");

  const [useLlmQuestions, setUseLlmQuestions] = useState(true);
  const [enableVideoObservation, setEnableVideoObservation] = useState(true);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);

  // 选择预设模板
  const handleTemplateChange = (value: string) => {
    setSelectedTemplate(value);
    const template = JOB_TEMPLATES.find((t) => t.value === value);
    if (template) {
      setRole(template.role);
      setJobDescription(template.jobDescription);
      setInterviewGoal(template.interviewGoal);
    }
  };

  // 上传简历
  const handleUploadResume = async () => {
    if (!resumeFile) {
      message.error("请先选择简历文件");
      return;
    }
    setLoading(true);
    try {
      const dataBase64 = await toBase64(resumeFile);
      const result = await submitResume({
        candidateName,
        fileName: resumeFile.name,
        contentType: resumeFile.type || "application/octet-stream",
        dataBase64,
      });
      setPrep(result);
      message.success("简历解析成功");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "简历上传失败");
    } finally {
      setLoading(false);
    }
  };

  // 创建面试
  const handleCreateInterview = async () => {
    if (!prep) {
      message.error("请先上传简历");
      return;
    }
    if (!role.trim() || !jobDescription.trim()) {
      message.error("请填写岗位信息");
      return;
    }

    setLoading(true);
    try {
      // 先提交岗位信息
      const jobInfoText = `岗位：${role}\n岗位描述：${jobDescription}\n面试目标：${interviewGoal}`;
      const updatedPrep = await submitPrepFollowup(prep.id, jobInfoText);
      setPrep(updatedPrep);

      // 创建面试
      const result = await createInterviewSessionFromPrep(updatedPrep.id, {
        useLlmQuestions,
        enableVideoObservation,
      });
      setSession(result);
      message.success("面试创建成功");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "创建面试失败");
    } finally {
      setLoading(false);
    }
  };

  // 快速开始 - 使用 mock 数据
  const handleQuickStart = async (template: "frontend" | "backend" | "ai" | "pm") => {
    setLoading(true);
    try {
      const result = await createMockSession({
        template,
        candidateName: candidateName || "测试候选人",
        enableVideoObservation,
      });
      setSession(result);
      message.success("面试创建成功（Mock 模式）");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "创建面试失败");
    } finally {
      setLoading(false);
    }
  };

  // 查看报告
  const handleViewReport = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const result = await fetchReport(session.id);
      setReport(result.report);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取报告失败");
    } finally {
      setLoading(false);
    }
  };

  // 下载报告
  const handleDownloadReport = async () => {
    if (!session) return;
    try {
      const result = report ? { report } : await fetchReport(session.id);
      if (!report) {
        setReport(result.report);
      }
      downloadMarkdownReport(buildReportFilename(session.candidateName, session.id), result.report);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "下载报告失败");
    }
  };

  // 复制链接
  const handleCopyLink = () => {
    if (!session) return;
    const url = `${window.location.origin}/interview/${session.id}`;
    navigator.clipboard.writeText(url);
    message.success("链接已复制");
  };

  const interviewUrl = session ? `${window.location.origin}/interview/${session.id}` : "";
  const questionItems = session ? buildQuestionPreviewItems(session.questions) : [];

  // 是否可以创建面试
  const canCreateInterview = prep && role.trim() && jobDescription.trim();

  return (
    <Spin spinning={loading}>
      <div className="recruiter-page">
        {/* 页面标题 */}
        <div className="recruiter-page-header">
          <h1 className="recruiter-page-title">准备新面试</h1>
          <p className="recruiter-page-subtitle">配置候选人信息，AI 将为您生成专属面试大纲。</p>
        </div>

        {/* 快速开始 - Mock 模式 */}
        <Card className="recruiter-page-card quick-start-card">
          <div className="quick-start-header">
            <ThunderboltOutlined className="quick-start-icon" />
            <div>
              <h3>快速开始（调试模式）</h3>
              <p>跳过简历解析，使用预设数据快速创建面试</p>
            </div>
          </div>
          <div className="quick-start-buttons">
            <Button onClick={() => handleQuickStart("frontend")}>前端工程师</Button>
            <Button onClick={() => handleQuickStart("backend")}>后端工程师</Button>
            <Button onClick={() => handleQuickStart("ai")}>AI 工程师</Button>
            <Button onClick={() => handleQuickStart("pm")}>产品经理</Button>
          </div>
        </Card>

        {/* 两列布局：简历卡片 + 岗位配置卡片 */}
        <div className="recruiter-cards-row">
          {/* 左侧：简历上传卡片 */}
          <Card className="recruiter-page-card glass-card" title="候选人信息">
            {/* 候选人姓名 */}
            <div className="setup-section">
              <label className="setup-label">候选人姓名</label>
              <Input
                size="large"
                placeholder="例如：张三"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
              />
            </div>

            {/* 简历上传 */}
            <div className="setup-section">
              <label className="setup-label">简历上传 (PDF/Word)</label>
              <Dragger
                accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
                beforeUpload={(file) => {
                  setResumeFile(file);
                  return false;
                }}
                showUploadList={false}
                className="setup-uploader"
              >
                <p className="ant-upload-drag-icon">
                  <CloudUploadOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽上传简历</p>
                <p className="ant-upload-hint">AI 将自动解析经历并生成题库</p>
              </Dragger>
              {resumeFile && (
                <Tag color="blue" style={{ marginTop: 8 }}>
                  {resumeFile.name}
                </Tag>
              )}
            </div>

            <Button
              type="primary"
              size="large"
              block
              onClick={handleUploadResume}
              disabled={!resumeFile}
              icon={<UploadOutlined />}
            >
              上传并解析
            </Button>

            {/* 简历预览 */}
            {prep?.resumeMarkdownPreview && (
              <div className="resume-preview">
                <pre>{prep.resumeMarkdownPreview}</pre>
              </div>
            )}
          </Card>

          {/* 右侧：岗位配置卡片 */}
          <Card className="recruiter-page-card glass-card" title="岗位配置">
            {/* 预设岗位选择 */}
            <div className="setup-section">
              <label className="setup-label">快速选择岗位模板（可选）</label>
              <Select
                size="large"
                placeholder="选择预设岗位模板，快速填入信息"
                value={selectedTemplate || undefined}
                onChange={handleTemplateChange}
                allowClear
                options={JOB_TEMPLATES.map((t) => ({ value: t.value, label: t.label }))}
                style={{ width: "100%" }}
              />
            </div>

            <Divider />

            {/* 岗位名称 */}
            <div className="setup-section">
              <label className="setup-label">岗位名称 <span className="required">*</span></label>
              <Input
                size="large"
                placeholder="例如：高级前端工程师"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>

            {/* 岗位描述 */}
            <div className="setup-section">
              <label className="setup-label">岗位描述 <span className="required">*</span></label>
              <TextArea
                rows={3}
                placeholder="描述该岗位的核心职责、技术栈要求、职级范围等"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
            </div>

            {/* 面试目标 */}
            <div className="setup-section">
              <label className="setup-label">面试目标</label>
              <TextArea
                rows={2}
                placeholder="本轮面试重点考察哪些能力？例如：技术深度、项目经验、应变能力"
                value={interviewGoal}
                onChange={(e) => setInterviewGoal(e.target.value)}
              />
            </div>

            <Divider />

            {/* 面试配置 */}
            <div className="setup-section">
              <label className="setup-label">面试配置</label>
              <div className="config-item">
                <span>使用 LLM 生成面试问题</span>
                <Switch checked={useLlmQuestions} onChange={setUseLlmQuestions} />
              </div>
              <div className="config-item">
                <span>允许面试端摄像头观察信号</span>
                <Switch checked={enableVideoObservation} onChange={setEnableVideoObservation} />
              </div>
            </div>

            <Button
              type="primary"
              size="large"
              block
              onClick={handleCreateInterview}
              disabled={!canCreateInterview}
              icon={<RocketOutlined />}
              className="create-interview-btn"
            >
              生成面试大纲并开启
            </Button>
          </Card>
        </div>

        {/* 面试链接 */}
        {session && (
          <Card className="recruiter-page-card glass-card">
            <div className="interview-link-section">
              <h3>面试已创建</h3>
              <Space.Compact block>
                <Input style={{ width: "calc(100% - 100px)" }} readOnly value={interviewUrl} />
                <Button type="primary" icon={<CopyOutlined />} onClick={handleCopyLink}>
                  复制
                </Button>
              </Space.Compact>
              <div className="interview-link-actions">
                <Button type="primary" onClick={() => navigate(`/interview/${session.id}`)}>
                  进入面试间
                </Button>
                <Button onClick={() => navigate(`/report/${session.id}`)}>
                  查看报告
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* 问题列表 */}
        {session && questionItems.length > 0 && (
          <Card
            className="recruiter-page-card glass-card"
            title={`生成题目 (${questionItems.length} 道)`}
            extra={
              <>
                <Button onClick={handleViewReport}>查看招聘端报告</Button>
                <Button icon={<DownloadOutlined />} onClick={handleDownloadReport}>
                  下载面试结果
                </Button>
              </>
            }
          >
            <div className="question-list">
              {questionItems.map((item, index) => (
                <div key={index} className="question-item">
                  <div className="question-item-header">
                    <Tag color="orange">{item.dimension}</Tag>
                    <span className="question-item-index">Q{item.index}</span>
                  </div>
                  <p className="question-item-prompt">{item.prompt}</p>
                  <div className="question-item-meta">
                    <div>
                      <strong>追问建议：</strong>
                      {item.followUp}
                    </div>
                    <div>
                      <strong>观察点：</strong>
                      {item.evidenceHint}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 报告预览 */}
        {report && (
          <Card className="recruiter-page-card glass-card" title="面试报告">
            <pre className="report-preview">{report}</pre>
          </Card>
        )}
      </div>
    </Spin>
  );
}

export default RecruiterPage;
