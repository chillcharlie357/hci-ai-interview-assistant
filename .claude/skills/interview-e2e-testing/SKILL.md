---
name: interview-e2e-testing
description: E2E test the full interview flow via Playwright: resume upload (PDF) -> LLM question generation -> candidate interview (6 Q&A) -> report page.
---

# 面试 E2E 测试

使用 Playwright 自动化测试完整的面试流程。

## 前置条件

- Podman/Docker dev 环境已启动: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d`
- 后端、前端、ASR 三个容器均正常运行
- 前端可访问 `http://localhost:5173`
- Playwright 插件已加载
- `mock-resumes/` 目录下有 PDF 简历（通过 `scripts/generate_mock_resumes.py` 生成）

## 测试步骤

### 1. 打开招募端配置页

导航到 `http://localhost:5173/recruiter/setup`。

检查要点：
- 页面标题为 "HCI AI Interview Assistant"
- 可见"准备新面试"区块
- "快速开始（调试模式）"按钮组可见（前端工程师/后端工程师/AI 工程师/产品经理）

### 2. 填写候选人信息和岗位信息

填入：
- 候选人姓名（占位符"例如：张三"）
- 岗位名称（占位符"例如：高级前端工程师"）
- 岗位描述（占位符"描述该岗位的核心职责、技术栈要求、职级范围等"）

### 3. 上传 PDF 简历

上传 `mock-resumes/` 中的 PDF 文件。

检查要点：
- 上传后文件名显示在页面上
- "上传并解析"按钮变为可用
- 点击后等待 MinerU 解析完成（检查后端日志 `[create_prep] saving prep session to DB...` + `[RES] ... -> 201`）
- 解析后的简历 markdown 内容回显到页面上

### 4. 生成面试大纲

点击"生成面试大纲并开启"。

检查要点：
- 后端日志出现 `[create_from_prep]` 并返回 HTTP 201
- 页面显示"面试已创建"区块
- 面试链接形如 `http://localhost:5173/interview/session_xxxxxxxxxxxx`
- 页面显示 6 道面试题（由 LLM 生成），覆盖不同维度
- "进入面试间"和"查看报告"按钮可见

### 5. 候选人答题

打开面试链接（新标签页）。

检查要点：
- 页面标题为 "AI 面试间"
- 显示 AI 面试官状态（提问中 -> 等待回答）
- 当前问题、进度（REC 1/6）、采分点、追问建议均正确渲染
- 回答输入框可用（占位符"语音识别会实时写入这里（Ctrl+Enter 提交）..."）

答题循环（重复 6 次）：
1. 等待 AI 状态变为"等待回答"（约 3-8 秒）
2. 在输入框填写回答内容
3. 点击"结束回答"
4. 检查后端日志出现 `[RES] POST /api/sessions/.../answers -> 200`
5. 点击"进入下一题"
6. 等待下一题加载

检查要点（每轮）：
- 问答记录出现在对话字幕区域
- 答题耗时和字数在后端的报告中体现
- 实时分析侧边栏显示语音指标（如可用）

### 6. 查看报告

导航到 `/report/{sessionId}`。

检查要点：
- 页面标题含候选人和岗位信息
- 综合评分及雷达图正常渲染
- 所有 6 个问答在"核心问答追踪"中展示
- 完整 Markdown 报告在页面底部
- "下载 PDF 报告"按钮可用

## 常见问题

### MinerU 解析超时

```
[create_prep] extraction failed: mineru_timeout
```

**原因**: `mineru-open-api flash-extract` 对 docx 格式在云端处理超时（>5分钟）。

**解决**: 使用 PDF 格式简历。mock-resumes 已提供 PDF 版本。

### 简历上传 400 错误

```
[RES] POST /api/prep-sessions/resume -> 400
```

查看后端日志中 `[create_prep] extraction failed:` 后面的错误码：
- `mineru_timeout` — MinerU 云端超时，换 PDF 格式
- `mineru_not_found` — 容器中未安装 `mineru-open-api`，检查 Dockerfile
- `unsupported_resume_format` — 文件后缀不在支持列表（.pdf/.docx/.png/.jpg/.jpeg/.webp）
- `invalid_resume_payload` — Base64 解码失败
- `resume_file_too_large` — 超过 12MB
- `mineru_failed` — MinerU 进程返回非零退出码
- `empty_resume_text` — MinerU 未提取到文本

### LLM 问题生成失败

**检查**:
- `.env` 中 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 是否正确
- 后端日志中是否有 LLM 相关错误
- 可关闭"使用 LLM 生成面试问题"开关使用预设问题

### 数据库保存警告

```
[save_session] WARNING: user_id='dev_user' 不是合法 UUID，跳过数据库持久化
```

当 `REQUIRE_AUTH=false` 时，在内存中保存 session 而非写入 Supabase，不影响功能。

### speech_aggregates 列缺失

```
Failed to save speech aggregate: 'semitone_weight_sum' column not found
```

Supabase 数据库迁移未完成。运行 `backend/database/migrations/` 中的对应 SQL。不影响核心面试流程。

### 面试页卡在"提问中"

AI 面试官的"提问"是模拟超时等待（约 3-8 秒自动切换）。如果长时间无响应，刷新页面重试。

## 验证清单

完成后逐项确认：

- [ ] 简历上传返回 201
- [ ] 简历内容正确回显
- [ ] LLM 生成 6 道面试题
- [ ] 面试链接可访问
- [ ] 所有 6 题均可回答并提交
- [ ] 后端日志全部返回 200 或 201
- [ ] 报告页展示完整面试数据
- [ ] 雷达图正常渲染
- [ ] 无浏览器控制台错误（红色）
