# 关键执行过程

## 分支策略

本项目使用普通 `git` 命令管理不同 feature 分支：

1. `main`：稳定主分支。
2. `feat/spec-foundation`：spec 目录、目标和执行过程。
3. `feat/question-engine`：简历/JD 解析与问题生成。
4. `feat/interview-session`：数字人提问、回答记录和纪要生成。
5. `feat/static-ui`：浏览器 MVP 页面与交互。

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

## 验证方式

- 使用 Node.js 内置测试运行器执行核心逻辑测试。
- 使用无外部依赖的静态页面验证端到端演示。
- 每个 feature 分支在合并前必须执行 `npm test`。
