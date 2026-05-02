# 关键执行过程

## 分支策略

本项目使用普通 `git` 命令管理不同 feature 分支：

1. `main`：稳定主分支。
2. `feat/spec-foundation`：spec 目录、目标和执行过程。
3. `feat/question-engine`：简历/JD 解析与问题生成。
4. `feat/interview-session`：数字人提问、回答记录和纪要生成。
5. `feat/frontend-ui`：TypeScript 前端 MVP 页面与交互。
6. `feat/realtime-video-llm-run`：实时摄像头观察、OpenAI-compatible LLM、一键运行脚本和 Docker。

执行顺序：

1. 从 `main` 创建 feature 分支。
2. 在 feature 分支内按 TDD 完成实现。
3. 运行测试。
4. 测试通过后提交 feature 分支。
5. 切回 `main`。
6. 使用 `git merge --no-ff <feature-branch>` 合并回 `main`。

## Spec 驱动开发流程

1. 将 PRD 移动到 `spec/prd.md`。
2. 在 `spec/goals.md` 明确 MVP 目标、范围和非目标。
3. 在 `spec/execution-process.md` 记录执行策略、分支策略和验证方式。
4. 按 feature 写测试。
5. 运行测试观察失败。
6. 编写最小实现。
7. 测试通过后合并到 `main`。

## MVP 模块拆分

### 问题生成模块

输入：

- 候选人简历摘要
- 岗位 JD
- 面试目标

输出：

- 面试问题列表
- 问题维度
- 追问建议
- 评分观察点

### 面试会话模块

输入：

- 问题列表
- 候选人回答

输出：

- 回答记录
- 回答用时
- 填充词数量
- 事件日志
- 面试纪要

### 静态 UI 模块

输入：

- 用户填写的简历、JD、目标和回答

输出：

- 实时问题区
- 数字人提问区
- 回答输入区
- 实时事件流
- 面试后纪要

### 实时摄像头观察模块

输入：

- 浏览器摄像头视频流
- Canvas 当前帧与上一帧像素

输出：

- face presence
- brightness
- blur / sharpness proxy
- motion amount
- head pose / gaze / blink / nod / hand / body activity proxy
- video event
- 内存关键帧 data URL

执行边界：

- 前端负责指标计算和关键帧生成。
- 后端只接收结构化事件和 base64 JPEG，不做自动评分。
- 关键帧默认只存在当前内存 session。

### OpenAI-Compatible LLM 模块

输入：

- 简历摘要
- 岗位 JD
- 面试目标
- 问题、回答、事件和 video events

输出：

- 结构化问题
- Markdown 智能纪要
- `llm_status`

执行边界：

- 本地敏感配置写入 `.env`，仓库只提交 `.env.example`；LLM 配置为 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`。
- 未配置、返回非法 JSON 或出现录用判断措辞时使用规则 fallback。
- 回答文本指标优先由 LLM 判断，fallback 才使用 `INTERVIEW_FILLER_WORDS`。
- LLM 不作为全流程 Agent，只增强问题和纪要。

## 验证方式

- 使用 Python 测试框架验证核心面试逻辑。
- 使用 TypeScript 前端测试验证关键 UI 数据流。
- 使用 `scripts/test.sh` 执行 Python unittest、frontend vitest 和 frontend build。
- 使用 `scripts/e2e.sh` 执行完整浏览器端到端验收，覆盖 mock 摄像头、mock 麦克风、mock TTS/STT、mock MinerU、招聘端题目展示、候选人字幕面试、报告下载和报告权限。
- 使用 `docker compose config` 验证 Docker Compose 配置。
- 每个 feature 分支在合并前必须执行对应测试命令。

## Mock E2E 边界

- `scripts/e2e.sh` 默认设置 `INTERVIEW_DISABLE_DOTENV=1`，不会读取 `.env` 中的 LLM、LiveKit 或其他敏感配置。
- `MINERU_COMMAND` 默认使用 `scripts/mock_mineru_open_api.py`，不调用外部 MinerU 服务。
- 浏览器端通过 Playwright 注入 `getUserMedia`、`SpeechSynthesisUtterance`、`SpeechRecognition` / `webkitSpeechRecognition` mock。
- 下载报告和截图默认写入 `/private/tmp`，不进入 git。
