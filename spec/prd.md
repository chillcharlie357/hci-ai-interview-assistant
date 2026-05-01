# 面试实时分析与智能纪要系统 PRD

版本：v0.2  
日期：2026-05-01  
目标阶段：MVP

## 1. 产品定位

本产品面向技术面试场景，提供两个阶段能力：

- 面试中：实时观察候选人的表达、互动、非语言表现和屏幕内容变化，辅助面试官记录关键现象。
- 面试后：基于完整音视频、转写、关键帧、OCR、时间轴和实时事件，生成结构化智能面试纪要。

核心原则：系统提供证据化辅助分析，不直接替代面试官做最终评价。

## 2. 背景

技术面试视频中包含大量有价值的信息，包括候选人的口头回答、代码实现过程、屏幕共享内容、PPT、白板、终端输出和非语言互动表现。传统面试纪要主要依赖人工记录，容易遗漏关键时间点、代码变化和上下文。

本产品希望通过开源视频处理、OCR、ASR、非语言信号分析和 LLM 组件，自动生成结构化面试纪要，并在面试过程中提供实时辅助观察，帮助面试官更高效、可追溯地完成复盘。

## 3. 产品目标

### 3.1 MVP 目标

- 支持面试过程中的实时 ASR 和基础表达指标分析。
- 支持实时识别屏幕共享内容类型，如代码、PPT、白板、终端、文档、浏览器。
- 支持记录关键事件时间点，如开始回答、长时间停顿、屏幕切换、代码变化、运行失败等。
- 支持面试结束后生成完整智能纪要。
- 所有重要结论必须关联原始证据，包括时间戳、转写文本、截图或音频片段。

### 3.2 暂不追求

- 完整自动化面试评分。
- 直接输出录用或不录用结论。
- 高精度视觉推理。
- 实时复杂多模态大模型分析。
- 对候选人敏感属性进行识别或推断。

## 4. 目标用户

主要用户：

- 技术面试官
- 招聘团队
- 面试复盘人员
- 候选人评估系统开发团队

核心使用场景：

- 面试过程中实时辅助观察候选人的表达和互动状态。
- 面试结束后快速生成结构化纪要。
- 回看候选人解题过程。
- 定位代码实现、白板推导、PPT 讲解和终端调试等关键片段。
- 为面试评价提供可追溯证据链。

## 5. 核心场景

### 5.1 面试中实时分析

面试过程中，系统实时展示候选人的表达和互动指标，覆盖以下评估维度：

- 专业能力
- 专业知识体系
- 技术实现能力
- 项目经验
- 亲和力
- 倾听能力
- 自信程度
- 说服力
- 应变能力

同时捕捉非语言因素：

- 音量
- 语速
- 手势活跃度
- 点头次数
- 眼神接触时间
- 语调变化
- 眨眼频率
- 回答延迟
- 语言间断，如“啊”“嗯”等填充词

### 5.2 面试后智能纪要

面试结束后，系统基于完整音视频和实时分析日志生成完整纪要，包括：

- 面试时间线
- 问答摘要
- 技术能力观察
- 关键截图
- 代码 / PPT / 白板 / 终端变化
- 候选人表达与互动分析
- 待人工确认项
- 面试官复盘建议

## 6. 用户流程

### 6.1 实时分析流程

1. 面试开始，系统接入音频流、摄像头视频流和屏幕共享流。
2. 系统实时转写候选人与面试官对话。
3. 系统计算语速、音量、停顿、填充词和回答延迟。
4. 系统周期性分析视频画面，提取眼神接触、点头、手势活跃度等非语言信号。
5. 系统周期性抽取屏幕共享帧，识别当前画面类型。
6. 系统记录关键事件并展示在实时面板中。
7. 面试官可在面试过程中查看实时事件流和风险提示。

### 6.2 面试后纪要流程

1. 面试结束，系统保存完整音视频和实时分析日志。
2. 系统提取音频并执行完整 ASR。
3. 系统进行场景检测和关键帧抽取。
4. 系统对关键帧去重并执行 OCR。
5. 系统将关键帧、OCR、ASR 和实时事件对齐到统一时间轴。
6. LLM 基于结构化证据生成智能纪要。
7. 用户查看纪要、关键截图、时间点和待确认项。

## 7. 产品模块

### 7.1 实时分析模块

输入：

- 麦克风音频流
- 摄像头视频流
- 屏幕共享流
- 面试官问题文本或实时 ASR
- 候选人实时 ASR

实时输出示例：

```json
{
  "timestamp": 735.2,
  "event_type": "answering",
  "speaker": "candidate",
  "text": "我这里用小根堆来维护每个链表的当前节点",
  "signals": {
    "speech_rate": "normal",
    "volume": "stable",
    "filler_words": 2,
    "response_latency_sec": 1.8,
    "eye_contact_ratio": 0.62,
    "gesture_activity": "medium"
  },
  "screen_context": {
    "frame_type": "code",
    "ocr_summary": "出现 PriorityQueue 和 ListNode 相关代码"
  }
}
```

实时页面建议包含：

- 当前问题
- 候选人实时回答
- 语速 / 音量 / 停顿 / 填充词
- 眼神接触 / 点头 / 手势活跃度
- 当前屏幕类型：代码、PPT、白板、终端、文档、浏览器
- 关键事件流：开始回答、长时间停顿、切换代码、运行失败、修改方案等
- 风险提示：偏题、长时间沉默、音频异常、屏幕无变化

### 7.2 视频处理模块

职责：

- 基础抽帧
- 场景变化检测
- 关键帧去重
- 屏幕内容 OCR
- 屏幕类型识别
- 关键帧与 ASR 对齐

MVP 推荐组件：

- FFmpeg：音视频分离、基础抽帧。
- PySceneDetect：场景变化检测。
- OpenCV：按时间戳取帧、相似度计算。
- imagehash / SSIM：关键帧去重。
- PaddleOCR：屏幕内容识别。

### 7.3 ASR 与说话人模块

职责：

- 实时转写。
- 面试后完整转写。
- 生成句级或词级时间戳。
- 区分候选人与面试官。

MVP 推荐组件：

- Whisper / faster-whisper：实时转写。
- WhisperX：面试后高精度转写、word-level timestamps、speaker diarization。
- pyannote.audio：说话人分离。

### 7.4 智能纪要生成模块

职责：

- 汇总 ASR、关键帧、OCR、实时事件和非语言指标。
- 生成结构化 Markdown / JSON / Web 报告。
- 保留证据链引用。
- 标记低置信度和待人工确认项。

## 8. 功能需求

### 8.1 P0 必须支持

- 实时 ASR 转写。
- 实时语速、音量、停顿、填充词统计。
- 实时回答延迟计算。
- 每隔固定时间抽取屏幕帧。
- 识别当前画面类型：代码、PPT、终端、白板、文档、浏览器、未知。
- 记录关键事件时间点。
- 面试结束后生成完整纪要。
- 所有分析结果必须关联原始证据：时间戳、文本、截图或音频片段。

### 8.2 P1 增强能力

- 眼神接触时间估计。
- 点头次数统计。
- 手势活跃度估计。
- 表情 / 情绪趋势。
- 代码内容变化 diff。
- 面试问题与回答自动分段。
- 技术关键词覆盖分析。
- 输出可点击时间点，便于跳转到原视频。

### 8.3 P2 后续能力

- CLIP / SigLIP 做语义去重和画面分类。
- Qwen-VL / InternVL / LLaVA 做视觉摘要。
- 候选人能力雷达图。
- 面试官提问质量分析。
- 多候选人横向对比。
- 与 ATS / 招聘系统集成。

## 9. 技术方案

### 9.1 实时分析技术链路

```text
音频流
  ↓
VAD 分段
  ↓
Whisper / faster-whisper 实时转写
  ↓
语速、音量、停顿、填充词统计

摄像头视频流
  ↓
OpenCV 采样
  ↓
MediaPipe / OpenFace 分析人脸、视线、点头、姿态
  ↓
非语言指标生成

屏幕共享流
  ↓
FFmpeg / OpenCV 抽帧
  ↓
imagehash / SSIM 去重
  ↓
PaddleOCR 识别文字
  ↓
规则分类 code / slide / terminal / document / browser / whiteboard

实时事件
  ↓
时间轴事件存储
  ↓
面试后纪要生成
```

### 9.2 面试后处理技术链路

```text
interview.mp4
  ↓
FFmpeg 提取音频
  ↓
WhisperX 转写 + 时间戳 + 说话人
  ↓
FFmpeg 每 5 秒抽基础帧
  ↓
PySceneDetect 抽场景变化帧
  ↓
OpenCV / imagehash 去重
  ↓
PaddleOCR 识别屏幕文字
  ↓
帧分类：face / code / slide / document / whiteboard / terminal / browser
  ↓
把关键帧和 ASR segment 对齐
  ↓
LLM 生成智能面试纪要
```

## 10. 核心数据结构

### 10.1 实时事件

```json
{
  "event_id": "evt_001",
  "timestamp": 735.2,
  "event_type": "long_pause",
  "speaker": "candidate",
  "duration_sec": 4.8,
  "related_question_id": "q_003",
  "evidence": {
    "asr_segment_id": "asr_102",
    "audio_clip": "audio_735_740.wav"
  },
  "confidence": 0.86
}
```

### 10.2 关键帧

```json
{
  "timestamp": 1285.4,
  "frame_type": "code",
  "source": "scene_change",
  "image_path": "frames/frame_001285.jpg",
  "ocr_text": "PriorityQueue<ListNode> pq = new PriorityQueue<>...",
  "asr_context": {
    "speaker": "candidate",
    "text": "我这里用小根堆来维护每个链表的当前节点",
    "start": 1281.2,
    "end": 1288.6
  },
  "keep_reason": "代码内容发生明显变化",
  "confidence": 0.82
}
```

### 10.3 面试问题片段

```json
{
  "question_id": "q_003",
  "start": 720.0,
  "end": 860.0,
  "interviewer_question": "请讲一下合并 K 个有序链表的思路",
  "candidate_answer_summary": "候选人选择小根堆方案，并解释了每次弹出最小节点再补入下一节点的过程。",
  "related_frames": ["frame_001285.jpg"],
  "related_events": ["evt_001", "evt_002"]
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
- 00:03:12 候选人开始解释整体思路。
- 00:12:15 候选人开始实现小根堆方案。
- 00:21:40 终端出现测试失败，候选人开始排查边界条件。

## 3. 问答记录
| 时间 | 问题 | 回答摘要 | 证据 |
|---|---|---|---|

## 4. 技术能力观察
- 解题思路：
- 代码实现：
- Debug 能力：
- 项目经验：
- 知识体系：

## 5. 表达与互动观察
- 语速：
- 停顿：
- 填充词：
- 眼神接触：
- 倾听反馈：
- 应变表现：

## 6. 关键截图
| 时间点 | 类型 | 摘要 | 截图 |
|---|---|---|---|

## 7. 待人工确认
- OCR 低置信度片段
- ASR 可能识别错误片段
- 非语言指标异常但证据不足的片段
```

## 12. 实时页面建议

实时页面可分为四个区域：

### 12.1 当前对话区

- 当前问题
- 候选人实时回答
- 当前说话人
- 回答时长
- 回答延迟

### 12.2 表达与互动指标区

- 语速
- 音量
- 停顿
- 填充词
- 点头反馈
- 眼神接触比例
- 手势活跃度

### 12.3 屏幕内容区

- 当前画面类型
- OCR 摘要
- 代码 / PPT / 终端变化提示
- 最近关键截图

### 12.4 事件流区

- 开始回答
- 长时间停顿
- 追问发生
- 屏幕切换
- 代码变化
- 运行失败
- 修改方案
- 低置信度提示

## 13. 验收标准

### 13.1 MVP 功能验收

- 面试过程中能实时展示候选人回答文本和基础表达指标。
- 实时事件延迟控制在 3-8 秒内。
- 面试后可生成完整纪要。
- 关键截图中明显的代码、PPT、终端、白板变化能被保留。
- 重复截图数量明显减少。
- 每个关键截图能关联到附近语音上下文。
- 每条重要结论都有时间点、截图或转写文本证据。
- 系统不直接输出录用 / 不录用判断。
- 面试官可以在 5 分钟内通过纪要回顾主要表现。

### 13.2 MVP 效果指标

- 30-60 分钟面试视频可完成离线处理。
- 面试后纪要生成耗时低于视频时长的 1.5 倍。
- 关键截图重复率低于 30%。
- 主要代码 / PPT / 白板变化召回率达到 70% 以上。
- 人工补充纪要时间相比纯手工减少 50% 以上。

## 14. 风险与约束

### 14.1 技术风险

- OCR 对代码、终端和低清晰度画面识别不稳定。
- 场景变化阈值过低会产生大量无效帧，过高会漏掉关键变化。
- ASR 说话人分离在远程会议音频中可能不准。
- 非语言信号容易受摄像头角度、光线、网络质量影响。
- LLM 可能过度总结，导致证据链丢失。

### 14.2 产品与合规约束

- 非语言分析必须谨慎使用。
- 不应把眼神、眨眼、语速等单一指标作为能力结论。
- 所有非语言结果只作为观察信号，不能作为最终评分依据。
- 需要展示置信度或提示“需人工确认”。
- 候选人应提前知情并授权录制与分析。
- 避免分析敏感属性，如年龄、性别、种族、健康状态等。

### 14.3 应对策略

- 第一版以规则和证据抽取为主。
- 所有总结都保留原始时间点和截图引用。
- 对低置信度 OCR / ASR / 非语言指标标记“需人工确认”。
- 先支持离线批处理和轻量实时分析，再考虑实时复杂视觉理解。

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
问题生成：FoloUp / Flo-Interviewer / CVQuest 参考实现
会议房间：LiveKit + LiveKit Components / LiveKit Meet
AI 面试官：LiveKit Agents 或 Pipecat
数字人：先用 TTS + 静态头像，POC LiveTalking
实时分析：LiveKit 音视频流 + OpenCV / ASR / OCR
面试后纪要：WhisperX + PySceneDetect + PaddleOCR + LLM
```

如果要最快做可演示 Demo：

```text
Jitsi React SDK 或 LiveKit Meet
+ 简历/JD 解析生成问题
+ TTS 语音提问
+ 候选人 ASR 回答
+ 面试后 Markdown 纪要
```

如果要做可持续产品架构：

```text
LiveKit
+ LiveKit Components
+ LiveKit Agents / Pipecat
+ LiveTalking 数字人 POC
+ 自研问题生成与追问策略
+ 自研证据链纪要生成
```

## 16. 里程碑

### M1：基础实时链路

- 接入音频流。
- 实现实时 ASR。
- 实现语速、音量、停顿、填充词统计。
- 展示实时对话与基础指标。

### M2：屏幕理解链路

- 接入屏幕共享流。
- 实现固定间隔抽帧。
- 实现 OCR。
- 实现画面类型分类。
- 实现关键事件记录。

### M3：面试后处理链路

- 完成视频输入、音频提取、完整 ASR。
- 完成场景检测、关键帧抽取、去重和 OCR。
- 完成关键帧与 ASR 对齐。

### M4：智能纪要生成

- 基于统一时间轴生成 Markdown 纪要。
- 支持关键截图和证据链引用。
- 支持待人工确认项。

### M5：复核体验

- 支持查看截图、时间点、ASR 原文。
- 支持人工编辑纪要。
- 支持导出 Markdown / JSON / Web 报告。

## 17. 一句话总结

这个产品不是简单的“面试录音转纪要”，而是一个两阶段系统：面试中实时捕捉表达、互动、屏幕和非语言信号；面试后基于完整证据链生成可复盘、可追溯的智能面试纪要。
