# 面试实时分析与智能纪要系统 PRD

版本：v0.4
日期：2026-05-02  
目标阶段：MVP

## 1. 产品定位

本产品面向技术面试场景，MVP 提供最小的 AI 面试提问回答闭环：

- 面试前：基于候选人简历摘要、岗位 JD 和面试目标生成结构化问题。
- 面试中：数字人面试官按问题逐题提问，并记录候选人回答、用时、基础表达指标和实时摄像头观察信号。
- 面试后：基于问题、回答、事件日志和非语言观察信号生成结构化智能面试纪要。

核心原则：系统提供证据化辅助分析，不直接替代面试官做最终评价。

## 2. 背景

技术面试包含大量有价值的信息，包括面试官问题、候选人口头回答、追问过程、回答时长、表达停顿和关键结论。传统面试纪要主要依赖人工记录，容易遗漏问题上下文、候选人原始回答和后续追问。

本产品 MVP 希望通过问题生成、数字人提问、回答记录、浏览器端实时摄像头观察和 LLM 纪要增强，先跑通最小可用闭环。视频会议、屏幕共享、OCR 和真实数字人渲染仍作为后续增强能力。

## 3. 产品目标

### 3.1 MVP 目标

- 支持从简历摘要、岗位 JD 和面试目标生成结构化面试问题。
- 支持数字人面试官以文本和前端 TTS 的方式逐题提问。
- 支持记录候选人每题回答、回答用时、字数和填充词数量。
- 支持浏览器端实时摄像头观察，记录脸部可见、头动、视线 proxy、眨眼 proxy、点头 proxy、手势/上半身活跃度、亮度、清晰度 proxy 和运动量。
- 支持在明显变化或低质量片段时生成关键帧，MVP 默认只保存到内存 session。
- 支持 OpenAI-compatible LLM 生成结构化问题、判断回答文本观察并增强 Markdown 纪要，未配置时必须 fallback。
- 支持记录基础面试事件，如会话开始、问题提出、回答记录、会话结束。
- 支持面试结束后基于问题与回答生成完整智能纪要。
- 所有重要结论必须关联原始证据，包括问题文本、候选人回答和事件记录。

### 3.2 暂不追求

- 完整自动化面试评分。
- 直接输出录用或不录用结论。
- 高精度视觉推理。
- 实时复杂多模态大模型分析。
- 屏幕共享识别、视频抽帧和 OCR。
- 基于非语言信号自动推断情绪、人格、健康状态或录用结论。
- 对候选人敏感属性进行识别或推断。

## 4. 目标用户

主要用户：

- 技术面试官
- 招聘团队
- 面试复盘人员
- 候选人评估系统开发团队

核心使用场景：

- 面试过程中由数字人按结构化问题完成提问。
- 面试结束后快速生成结构化纪要。
- 回看候选人回答过程。
- 定位关键问题、关键回答和建议追问。
- 为面试评价提供可追溯证据链。

## 5. 核心场景

### 5.1 面试中提问回答

面试过程中，系统展示当前问题、数字人提问文本、候选人回答输入和基础回答指标。问题覆盖以下评估维度：

- 专业能力
- 专业知识体系
- 技术实现能力
- 项目经验
- 亲和力
- 倾听能力
- 自信程度
- 说服力
- 应变能力

MVP 记录以下基础文本、时间和摄像头观察指标：

- 回答延迟
- 语言间断和填充表达，由 LLM 优先判断，fallback 时使用可配置词表
- 回答用时
- 回答字数
- 建议追问
- 脸部可见与画面质量：亮度、清晰度 proxy
- 非语言活动 proxy：头动、视线稳定、眨眼、点头、手势/上半身活跃度、运动量

这些非语言指标只作为可复核观察信号，不作为能力结论、情绪结论或录用判断。

### 5.2 面试后智能纪要

面试结束后，系统基于问题列表、候选人回答和事件日志生成完整纪要，包括：

- 面试时间线
- 问答摘要
- 技术能力观察
- 候选人回答摘要
- 基础表达指标
- 非语言观察与关键帧引用
- 待人工确认项
- 面试官复盘建议

## 6. 用户流程

### 6.1 实时分析流程

1. 面试开始，用户输入候选人、简历摘要、岗位 JD 和面试目标。
2. 系统生成结构化问题列表。
3. 用户可授权摄像头，前端开始实时观察候选人画面质量和活动 proxy。
4. 数字人面试官展示并朗读当前问题。
5. 用户输入或粘贴候选人回答。
6. 系统记录回答文本、回答用时、字数、填充词数量和摄像头事件。
7. 系统进入下一题并持续记录事件。
8. 所有问题结束后生成面试纪要。

### 6.2 面试后纪要流程

1. 面试结束，系统保存问题、回答、事件日志、video events 和内存关键帧引用。
2. 系统按问题维度整理回答记录。
3. 系统统计基础指标，如回答用时、字数、填充词数量；其中填充词数量优先由 LLM 判断。
4. 系统生成建议追问和待人工确认项。
5. LLM 或规则模板基于结构化证据生成智能纪要；LLM 未配置时使用规则 fallback。
6. 用户查看纪要、问题、回答和待确认项。

## 7. 产品模块

### 7.1 面试提问回答模块

输入：

- 候选人姓名
- 简历摘要
- 岗位 JD
- 面试目标
- 候选人回答文本
- 回答用时

会话输出示例：

```json
{
  "timestamp": 735.2,
  "event_type": "answer_recorded",
  "question": {
    "id": "q_001",
    "dimension": "项目经验",
    "prompt": "请介绍你做过的智能面试项目。"
  },
  "answer": {
    "text": "我主要负责问题生成和面试纪要模块。",
    "duration_sec": 76,
    "word_count": 21,
    "filler_words": 1
  }
}
```

实时页面建议包含：

- 当前问题
- 数字人提问文本
- 候选人回答输入
- 回答用时 / 字数 / 填充词
- 问题列表和当前进度
- 关键事件流：会话开始、问题提出、回答记录、会话结束
- 纪要生成入口

### 7.2 问题生成模块

职责：

- 解析简历摘要、岗位 JD 和面试目标。
- 提取岗位、技能、项目和评估维度。
- 生成结构化问题。
- 为每道题生成追问建议和观察点。

MVP 推荐组件：

- 规则模板：用于 MVP 的可解释问题生成。
- LLM：后续用于更自然的问题生成和追问。

### 7.3 数字人提问模块

职责：

- 展示当前问题。
- 使用前端 TTS 朗读当前问题。
- 后续可替换为 LiveKit Agents、Pipecat 或 LiveTalking。

MVP 推荐组件：

- Web Speech API：前端 TTS 的 MVP 实现。
- 静态头像：作为 MVP 数字人占位。

### 7.4 智能纪要生成模块

职责：

- 汇总问题、回答、回答指标和事件日志。
- 生成结构化 Markdown / JSON / Web 报告。
- 保留证据链引用。
- 标记低置信度和待人工确认项。

### 7.5 实时摄像头观察模块

职责：

- 由浏览器端 `getUserMedia` 获取候选人摄像头预览。
- 前端计算亮度、清晰度 proxy、运动量，并估算 face presence、head pose proxy、gaze proxy、blink proxy、nod proxy、hand activity 和 body activity。
- 在明显变化、低亮度、低清晰度或高运动片段生成关键帧。
- 通过 `POST /api/sessions/{id}/video-events` 上传 video event 和可选 base64 JPEG 关键帧。
- 后端只保存到当前内存 session，不默认落盘。

### 7.6 OpenAI-Compatible LLM 模块

职责：

- 使用 OpenAI Chat Completions 格式调用外部或本地兼容模型。
- 从本地 `.env` 读取 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`。
- 用于结构化问题生成、回答文本观察和 Markdown 纪要增强。
- 未配置、返回非法 JSON 或输出录用判断措辞时回退规则生成。

## 8. 功能需求

### 8.1 P0 必须支持

- 简历摘要、岗位 JD 和面试目标输入。
- 结构化面试问题生成。
- 数字人文本提问和前端 TTS 朗读。
- 候选人回答录入。
- 回答用时、字数和填充词统计。
- 记录关键事件时间点。
- 面试结束后生成完整纪要。
- 浏览器端实时摄像头观察和指标面板。
- video event 与关键帧上传到后端内存 session。
- OpenAI-compatible LLM 问题生成和纪要增强，带规则 fallback。
- 本地脚本和 Docker Compose 一键运行。
- 所有分析结果必须关联原始证据：问题文本、候选人回答和事件记录。

### 8.2 P1 增强能力

- 更高精度的眼神接触时间估计。
- 更高精度的点头次数统计。
- 更高精度的手势活跃度估计。
- 表情 / 情绪趋势。
- 代码内容变化 diff。
- 面试问题与回答自动分段。
- 技术关键词覆盖分析。
- 输出可点击时间点，便于跳转到原视频。
- 真实 ASR 和 TTS 流式对话。

### 8.3 P2 后续能力

- 视频会议和屏幕共享。
- OCR、视频抽帧和关键帧分析。
- CLIP / SigLIP 做语义去重和画面分类。
- Qwen-VL / InternVL / LLaVA 做视觉摘要。
- 候选人能力雷达图。
- 面试官提问质量分析。
- 多候选人横向对比。
- 与 ATS / 招聘系统集成。

## 9. 技术方案

### 9.0 技术栈

- 后端 / 核心逻辑：Python。
- 前端 UI：TypeScript。
- MVP 前端形态：轻量 Web UI。
- 测试：Python 单元测试覆盖问题生成和会话逻辑，TypeScript 测试覆盖 UI 数据流。

### 9.1 MVP 技术链路

```text
简历摘要 / 岗位 JD / 面试目标
  ↓
规则解析岗位、技能、项目和评估维度
  ↓
生成结构化面试问题
  ↓
数字人面试官展示并朗读当前问题
  ↓
用户输入候选人回答
  ↓
记录回答用时、字数、填充词和事件
  ↓
浏览器端摄像头指标与关键帧事件
  ↓
进入下一题
  ↓
生成 Markdown 智能纪要
```

### 9.2 后续可替换组件

- 问题生成：MVP 使用 Python 规则模板，已支持 OpenAI-compatible LLM 可选增强。
- 数字人提问：MVP 使用 TypeScript UI、前端 TTS 和静态头像，后续可接入 LiveKit Agents、Pipecat 或 LiveTalking。
- 回答输入：MVP 使用 TypeScript 表单输入，后续可接入实时 ASR。
- 纪要生成：MVP 使用 Python 规则模板，已支持 OpenAI-compatible LLM 增强和规则 fallback。
- 摄像头观察：MVP 使用浏览器端 Canvas + MediaPipe Tasks Vision 扩展依赖；后续可接入更高精度姿态和 landmark 模型。

## 10. 核心数据结构

### 10.1 实时事件

```json
{
  "event_id": "evt_001",
  "timestamp": 735.2,
  "event_type": "answer_recorded",
  "related_question_id": "q_003",
  "message": "已记录技术实现能力回答，用时 76 秒。"
}
```

### 10.2 面试问题

```json
{
  "id": "q_003",
  "dimension": "技术实现能力",
  "prompt": "如果要实现一个 AI 面试系统的实时问题生成和回答记录模块，你会如何设计前后端数据流？",
  "followUps": ["如果候选人回答中断，你会怎么保证状态一致？"],
  "evidenceHints": ["关注模块拆分、状态管理、异常处理和工程落地能力。"]
}
```

### 10.3 候选人回答

```json
{
  "question_id": "q_003",
  "dimension": "技术实现能力",
  "prompt": "如果要实现一个 AI 面试系统的实时问题生成和回答记录模块，你会如何设计前后端数据流？",
  "text": "我会先把问题生成、会话状态和纪要生成拆成三个模块。",
  "duration_sec": 76,
  "word_count": 28,
  "filler_word_count": 1
}
```

### 10.4 摄像头观察事件

```json
{
  "timestamp": 12.5,
  "event_type": "low_light",
  "confidence": 0.82,
  "metrics": {
    "face_present": true,
    "brightness": 0.18,
    "blur": 0.74,
    "motion": 0.22,
    "gaze_proxy": 0.61,
    "head_pose_proxy": 0.31,
    "blink_proxy": 0.1,
    "nod_proxy": 0.0,
    "hand_activity": 0.44,
    "body_activity": 0.2
  },
  "keyframe": {
    "reason": "low_light",
    "data_url": "data:image/jpeg;base64,..."
  }
}
```

### 10.5 Session 扩展字段

```json
{
  "llm_status": "fallback",
  "video_events": [],
  "keyframes": [],
  "video_summary": {
    "event_count": 0,
    "keyframe_count": 0,
    "event_types": []
  }
}
```

## 11. 纪要输出结构

```markdown
# 智能面试纪要

## 1. 面试概览
- 候选人：
- 面试官：
- 面试时长：
- 岗位：
- 题目：

## 2. 时间线摘要
- q_001 候选人介绍项目经验。
- q_002 候选人说明技术实现方案。
- q_003 候选人回答异常场景下的追问策略。

## 3. 问答记录
| 序号 | 问题 | 回答摘要 | 证据 |
|---|---|---|---|

## 4. 技术能力观察
- 解题思路：
- 代码实现：
- Debug 能力：
- 项目经验：
- 知识体系：

## 5. 表达与互动观察
- 填充词：
- 回答用时：
- 回答字数：
- 应变表现：

## 6. 非语言观察
- 画面质量：
- 脸部可见：
- 运动量：
- 关键帧：
- 说明：仅作为观察信号，不代表能力结论。

## 7. 待人工确认
- 回答过短的问题
- 填充词较多的问题
- 尚未回答的问题
```

## 12. 实时页面建议

实时页面可分为四个区域：

### 12.1 当前对话区

- 当前问题
- 数字人提问文本
- 候选人回答输入
- 回答时长

### 12.2 问题列表区

- 问题维度
- 当前问题
- 建议追问
- 观察点

### 12.3 回答指标区

- 回答用时
- 回答字数
- 填充词数量
- 回答完成状态

### 12.4 事件流区

- 会话开始
- 开始回答
- 回答记录
- 追问发生
- 会话结束
- 待人工确认提示

### 12.5 摄像头观察区

- 摄像头授权与预览
- 实时非语言指标面板
- 最近 video event
- 关键帧列表
- 提示非语言指标仅用于人工复核

## 13. 验收标准

### 13.1 MVP 功能验收

- 可以输入候选人、简历摘要、岗位 JD 和面试目标。
- 可以生成不少于 6 个结构化面试问题。
- 数字人面试官可以展示并朗读当前问题。
- 可以记录每道题的候选人回答、回答用时、字数和填充词数量。
- 可以逐题推进到下一题。
- 面试后可生成完整 Markdown 纪要。
- 可以开启摄像头并看到实时指标面板。
- 明显低亮度、低清晰度、高运动或脸部不可见事件可以保存内存关键帧。
- OpenAI-compatible LLM 未配置时仍可完成全流程，并返回 `llm_status: fallback`。
- 每条重要结论都有问题文本、候选人回答或事件记录证据。
- 系统不直接输出录用 / 不录用判断。
- 面试官可以在 5 分钟内通过纪要回顾主要问答表现。

### 13.2 MVP 效果指标

- 从输入材料到生成问题耗时低于 2 秒。
- 纪要生成耗时低于 2 秒。
- 浏览器端视频指标采样间隔默认约 1.5 秒。
- 关键帧默认不写入磁盘。
- 问题覆盖专业能力、项目经验、技术实现能力和应变能力。
- 人工整理纪要时间相比纯手工减少 50% 以上。

## 14. 风险与约束

### 14.1 技术风险

- 规则生成问题可能不够自然或不够贴合复杂岗位。
- 文本输入无法覆盖真实语音面试中的停顿、打断和说话人切换。
- 前端 TTS 声音表现有限，不等同于真实数字人。
- LLM 可能过度总结，导致证据链丢失。
- 摄像头观察受光照、摄像头角度、浏览器权限和设备性能影响。
- Canvas proxy 指标不能等同于高精度姿态、视线或情绪识别。

### 14.2 产品与合规约束

- 表达指标必须谨慎使用。
- 不应把回答用时、填充词等单一指标作为能力结论。
- 所有表达和摄像头指标只作为观察信号，不能作为最终评分依据。
- 需要展示置信度或提示“需人工确认”。
- 候选人应提前知情并授权记录与分析。
- 避免分析敏感属性，如年龄、性别、种族、健康状态等。
- 禁止将非语言观察转写成情绪、人格、健康状态或录用建议。

### 14.3 应对策略

- 第一版以规则和证据抽取为主。
- 所有总结都保留原始问题和回答引用。
- 对回答过短、未回答或填充词较多的片段标记“需人工确认”。
- 非语言观察只输出事件和关键帧引用，不输出能力结论。
- 先支持最小提问回答闭环，再考虑真实语音、会议和数字人能力。

## 15. 开源项目复用候选

本节用于记录可复用的 GitHub 开源项目。初期建议不要直接寻找“完整可用的智能面试系统”，而是按模块复用：问题生成、AI 面试官、会议房间、数字人、实时语音 Agent、面试后分析。

### 15.1 AI 面试与问题生成

| 项目 | 地址 | 可复用点 | 适合程度 |
|---|---|---|---|
| FoloUp | https://github.com/FoloUp/FoloUp | 从 JD 生成面试问题、生成候选人面试链接、AI 语音面试、回答分析、候选人看板 | 高 |
| Flo-Interviewer | https://github.com/buildfastwithai/flo-interviewer | JD / PDF / 文本上传生成面试模板，LiveKit 实时音视频，AI 语音面试官，录制与转写 | 高 |
| CVQuest | https://github.com/odysa/CVQuest | 从简历生成技术问题和行为问题，适合作为“简历解析生成问题”模块参考 | 中 |
| Open Interview | https://github.com/dsdanielpark/open-interview | 从简历和 JD 生成技术问答，支持文档和音频输出，适合作为问题生成包参考 | 中 |
| Ai-Video-Interviewer | https://github.com/SatyamPote/Ai-Video-Interviewer | 简单视频面试体验，支持简历和 JD 上传、动态问题、STT、TTS | 中 |
| AI-Recruitment-Agent | https://github.com/devpayoub/AI-Recruitment-Agent | 招聘端创建面试、按岗位生成问题、语音 Agent 面试、面试后评分 | 中 |

优先建议：

- 第一优先看 FoloUp 和 Flo-Interviewer。它们最接近“招聘方创建面试 + AI 提问 + 候选人回答 + 后续分析”的产品流。
- CVQuest / Open Interview 更适合拆出来做“简历和 JD 解析生成问题”模块。
- 需要注意 OpenCluely 类项目偏候选人作弊辅助，不建议作为本产品方向复用，只能参考其截图捕获和本地窗口技术。

### 15.2 会议与音视频房间

| 项目 | 地址 | 可复用点 | 适合程度 |
|---|---|---|---|
| LiveKit | https://github.com/livekit/livekit | 开源 WebRTC SFU，支持音频、视频、数据通道、录制、Agent 接入，适合深度定制 | 高 |
| LiveKit Components | https://github.com/livekit/components-js | React 会议组件、Agent UI 组件，可快速搭建候选人端和面试官端 | 高 |
| LiveKit Meet | https://github.com/livekit-examples/meet | 基于 LiveKit Components 和 Next.js 的开源视频会议应用，可直接参考房间 UI | 高 |
| Jitsi Meet | https://github.com/jitsi/jitsi-meet | 成熟开源视频会议，支持嵌入、屏幕共享、聊天、举手、移动端 | 中 |
| Jitsi React SDK | https://github.com/jitsi/jitsi-meet-react-sdk | React 中快速嵌入 Jitsi 会议，用于低成本 MVP | 中 |
| MiroTalk SFU | https://github.com/miroslavpejic85/mirotalksfu | 自托管 WebRTC SFU 会议，含屏幕共享、录制、白板、文件、REST API | 中 |
| plugNmeet | https://github.com/mynaparrot/plugNmeet-server | 基于 LiveKit 的可定制会议系统，含白板、录制、转写、AI 会议能力 | 中 |

优先建议：

- 如果要做“面试会议 + 实时分析 + 数字人/Agent 作为参会者”，优先 LiveKit。
- 如果只想快速验证候选人视频会议和屏幕共享，Jitsi React SDK 嵌入最快。
- 如果需要现成白板、录制、聊天、会议管理，可评估 plugNmeet 或 MiroTalk SFU，但二次定制成本可能高于 LiveKit 组件化搭建。

### 15.3 数字人和语音驱动头像

| 项目 | 地址 | 可复用点 | 适合程度 |
|---|---|---|---|
| LiveTalking | https://github.com/lipku/LiveTalking | 实时交互流式数字人，支持 MuseTalk、Wav2Lip、WebRTC、RTMP、虚拟摄像头、自定义形象 | 高 |
| Duix Mobile | https://github.com/duixcom/Duix.mobile | 移动端 / 端侧实时交互数字人，支持本地部署、ASR / TTS / LLM 接入、低延迟 | 中 |
| Duix Avatar | https://github.com/duixcom/Duix-Avatar | 离线数字人视频生成和克隆，更适合面试官形象制作或非实时视频生成 | 中 |
| AvatarAI | https://github.com/PunithVT/ai-avatar-system | 上传照片、声音克隆、Whisper + LLM + XTTS + MuseTalk 实时对话链路 | 中 |
| SadTalker | https://github.com/OpenTalker/SadTalker | 单张图生成说话人视频，适合离线素材生成，不适合强实时 | 低到中 |
| Wav2Lip | https://github.com/Rudrabha/Wav2Lip | 经典唇形同步模块，可作为底层组件，不建议直接承担完整产品 | 低到中 |

优先建议：

- MVP 如果需要“数字人实时提问”，优先评估 LiveTalking。
- 如果早期只需要“AI 面试官声音 + 静态头像/简单动效”，可以先不上高成本数字人，先用 TTS + 头像 + LiveKit Agent 跑通流程。
- Duix Avatar 更适合离线生成面试官介绍视频或固定开场，不适合作为第一版实时面试核心。

### 15.4 实时语音 Agent / 对话编排

| 项目 | 地址 | 可复用点 | 适合程度 |
|---|---|---|---|
| LiveKit Agents | https://github.com/livekit/agents | 实时语音 / 多模态 Agent，可作为 AI 面试官接入会议房间 | 高 |
| Pipecat | https://github.com/pipecat-ai/pipecat | 实时语音和多模态 Agent 框架，适合编排 STT、LLM、TTS、Transport | 高 |
| Intervo | https://github.com/Intervo/Intervo | 开源语音和聊天 Agent 平台，支持多步骤对话工作流 | 中 |
| Mini-Omni | https://github.com/gpt-omni/mini-omni | 端到端语音输入与流式语音输出模型，适合研究实时语音交互 | 低到中 |

优先建议：

- 如果会议层选 LiveKit，则 Agent 层也优先 LiveKit Agents，集成路径最顺。
- 如果希望后续兼容 Daily、WebRTC、WebSocket、电话等不同传输层，可评估 Pipecat。
- 早期不要把 Agent、数字人、会议房间全部自研，应该先复用会议组件和 Agent 框架，把精力放在面试问题生成、追问策略和纪要证据链。

### 15.5 推荐 MVP 组合

第一版推荐组合：

```text
后端 / 核心逻辑：Python
前端 UI：TypeScript
问题生成：Python 规则模板 + OpenAI-compatible LLM 可选增强，参考 FoloUp / Flo-Interviewer / CVQuest
数字人：TypeScript UI + 前端 TTS + 静态头像
回答记录：文本输入 + 回答用时 + 字数 + 填充词统计
摄像头观察：浏览器 getUserMedia + Canvas 指标 + 内存关键帧
面试后纪要：Python 规则模板 + OpenAI-compatible LLM 可选增强生成 Markdown
```

如果要最快做可演示 Demo：

```text
Python 问题生成
+ TypeScript 单页 UI
+ 前端 TTS 语音提问
+ 候选人文本回答
+ 实时摄像头观察信号
+ 面试后 Markdown 纪要
```

如果要做可持续产品架构：

```text
Python API 服务
+ TypeScript 前端应用
+ LiveKit Agents / Pipecat 语音 Agent
+ LiveTalking 数字人 POC
+ 自研问题生成与追问策略
+ 自研证据链纪要生成
```

## 16. 里程碑

### M1：Python 问题生成

- 实现简历摘要、岗位 JD 和面试目标解析。
- 实现结构化问题生成。
- 实现追问建议和观察点生成。
- 补充 Python 单元测试。

### M2：Python 面试会话

- 实现问题队列。
- 实现数字人提问文本。
- 实现候选人回答记录。
- 实现回答用时、字数和填充词统计。
- 实现事件日志。

### M3：Python 智能纪要

- 基于问题、回答和事件日志生成 Markdown 纪要。
- 支持待人工确认项。
- 保留问题和回答证据链。
- 支持 OpenAI-compatible LLM 增强和规则 fallback。

### M4：TypeScript 前端 UI

- 实现候选人、简历、JD 和目标输入。
- 实现问题列表和当前问题展示。
- 实现前端 TTS 提问。
- 实现回答录入和纪要展示。
- 实现摄像头授权、预览、实时指标和关键帧列表。

### M5：复核体验

- 支持查看问题、回答、指标和事件。
- 支持查看非语言观察信号和内存关键帧。
- 支持人工编辑纪要。
- 支持导出 Markdown / JSON / Web 报告。

## 17. 一句话总结

这个产品的 MVP 不是自动评分系统，而是一个最小 AI 辅助面试闭环：面试前基于简历和 JD 生成问题，面试中由数字人逐题提问并记录回答与可复核观察信号，面试后基于问题、回答、事件和非语言观察生成可复盘、可追溯的智能纪要。
