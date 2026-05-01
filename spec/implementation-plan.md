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
