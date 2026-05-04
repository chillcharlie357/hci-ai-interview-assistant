# MVP 实施计划

## 阶段 1：Spec Foundation

- 移动 PRD 到 `spec/prd.md`。
- 补充 `spec/goals.md`。
- 补充 `spec/execution-process.md`。
- 补充本实施计划。

## 阶段 2：Question Engine

- 创建 `backend/interview/question_engine.py`。
- 创建 `backend/tests/test_question_engine.py`。
- 实现简历/JD关键词提取。
- 实现按维度生成问题。
- 实现追问和观察点生成。

## 阶段 3：Interview Session

- 创建 `backend/interview/session.py`。
- 创建 `backend/tests/test_session.py`。
- 实现问题队列、数字人提问文本、回答记录。
- 实现填充词、字数、回答用时统计。
- 实现 Markdown 纪要生成。

## 阶段 4：Python API

- 创建 `backend/interview/api.py`。
- 创建 `backend/tests/test_api.py`。
- 实现创建 session、读取 session、记录回答三个 API。
- 使用标准库 HTTP server 暴露本地 MVP API。

## 阶段 5：TypeScript Frontend UI

- 创建 `index.html`。
- 创建 `frontend/src/app.ts`。
- 创建 `styles.css`。
- 串联 Python API、数字人提问、回答记录和纪要生成。

## 阶段 6：验收

- 执行完整测试。
- 检查 Python 核心逻辑与 TypeScript UI 数据流。
- 确认 PRD、目标、执行过程均位于 `spec/`。

## 阶段 7：OpenAI-Compatible LLM

- 新增 Python LLM client，使用 OpenAI Chat Completions 格式。
- 支持通过本地 `.env` 配置 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`，仓库只提交 `.env.example`。
- 创建 session 时可选择 `use_llm_questions: true`，未配置时返回 `llm_status: fallback` 并使用规则问题。
- 提交回答生成纪要时可用 LLM 增强 Markdown；未配置、响应非法或出现录用判断措辞时回退规则纪要。
- 记录回答时优先使用 LLM 判断填充词数量和文本观察；LLM 不可用时才使用 `INTERVIEW_FILLER_WORDS` fallback。
- 覆盖 LLM mock、fallback、非法响应和 API 纪要增强测试。

## 阶段 8：实时摄像头观察

- 前端使用 `getUserMedia` 打开候选人摄像头预览。
- TypeScript 侧基于 Canvas 指标计算亮度、清晰度 proxy、运动量，并保留 MediaPipe Tasks Vision 作为后续 landmark 分析依赖。
- 前端生成 `VideoSignalFrame` / video event，包含 face presence、head pose proxy、gaze proxy、blink proxy、nod proxy、hand activity、body activity、brightness、blur、motion。
- 明显变化或低质量片段生成 base64 JPEG 关键帧，随 video event 上传后端。
- 后端仅在内存 session 保存 `video_events` 和 `keyframes`，不落盘。
- 纪要加入“非语言观察”，只描述可复核观察信号，不输出能力结论或录用建议。

## 阶段 9：一键运行

- 新增 `scripts/dev.sh`，检查 Python 与 pnpm，启动 Python API 和 Vite 前端。
- 新增 `scripts/test.sh`，串行执行 Python unittest、frontend vitest 和 frontend build。
- 新增 `Dockerfile.backend`、`frontend/Dockerfile`、`docker-compose.yml`。
- Docker Compose 暴露 API `http://localhost:8000` 和前端 `http://localhost:5173`。

## 阶段 10：招聘端 / 面试端分离

- 新增 `/recruiter` 招聘端：上传简历、MinerU 解析、LLM 职位追问、生成问题、配置报告权限。
- 新增 `/interview/{sessionId}` 面试端：LiveKit 视频会议、数字人 TTS 提问、Web Speech 语音转文字回答。
- 新增 prep session API：`/api/prep-sessions/resume`、`/api/prep-sessions/{id}/followups`、`/api/prep-sessions/{id}/interview-session`。
- 新增 LiveKit token API：`/api/sessions/{id}/livekit-token`。
- 新增报告权限：默认 `recruiter_only`，可设置 `shared_with_candidate`。

## 阶段 11：数字人会议体验

- 新增 AI 面试官会议卡片，与候选人视频并列展示。
- 当前问题加载和切换后自动 TTS 播报，不再把“点击朗读”作为主流程。
- 增加数字人状态：准备中、提问中、等待回答、已结束、不支持。
- 新增会议字幕流，展示 AI 面试官提问和候选人回答。
- 面试端主流程使用“开始回答 / 结束回答”，不显示“重播问题 / 提交回答”作为主要操作。
- 浏览器不支持语音识别时保留文本字幕 fallback。
- 不引入真实 LiveKit bot participant、第三方数字人服务或口型视频生成。

## 阶段 12：题目预览与报告下载

- 招聘端创建正式面试 session 后展示生成的完整测试题目，包含维度、主问题、追问建议和观察点。
- 候选人端不提前展示完整题库，继续由数字人逐题提问。
- 新增前端 Markdown 下载能力，复用现有 report API，不新增后端文件持久化。
- 招聘端始终可下载面试结果；候选人端仅在 `shared_with_candidate` 时显示下载按钮。
- 下载文件名使用候选人姓名和 session id，并清理不安全字符。

## 阶段 13：前端 UI 优化与 Mock 模式

- 新增独立控制面板页面（DashboardPage），与面试配置页面分离。
- 控制面板展示统计数据、最近面试、快捷入口。
- 新增快速开始 Mock 模式，支持跳过简历解析创建测试面试。
- 后端新增 `/api/mock-session` 端点，预设 4 种岗位模板（前端、后端、AI、产品经理）。
- 报告页面使用 Recharts 实现真实雷达图展示软技能分析。
- 面试间添加摄像头、麦克风、结束面试工具栏，支持实时切换。
- 弹幕字幕区改为透明背景 + 自动滚动，类似抖音直播评论。
- 优化面试间页面高度，确保控制按钮无需滚动即可看到。
- "结束回答"/"进入下一题"按钮在 AI 播报时禁用。
