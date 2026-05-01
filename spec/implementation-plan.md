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
