# 面试评估指标规范

本文件为面试评估指标的需求定义、设计决策与实现状态的单一权威来源。

---

## 一、评估维度

### 专业维度

问题引擎（`question_engine.py`）生成的问题覆盖以下维度：

| 维度 | 说明 |
|------|------|
| 专业能力 | 候选人在专业领域的综合能力 |
| 项目经验 | 过往项目的深度与广度 |
| 技术实现能力 | 将知识转化为实际方案的能力 |
| 应变能力 | 面对意外问题的反应与调整 |
| 表达能力 | 语言组织与信息传达的清晰度 |
| 协作能力 | 团队沟通与配合的倾向 |

### 软技能维度

软技能通过非语言观察信号间接反映，不直接评分：

| 维度 | 观察信号来源 |
|------|-------------|
| 亲和力 | 音量、语速、手势活动度 |
| 倾听能力 | 点头次数、眼神接触时间 |
| 自信程度 | 眼神接触时间、语调变化、眨眼频率 |
| 说服力 | 语速、音量、眼神接触时间 |
| 应变能力 | 提问到回答的时间差、填充词频率 |

---

## 二、衡量指标与参考范围

| 指标 | 参考范围 | 单位 | 采集方式 | 实现状态 |
|------|---------|------|---------|---------|
| 音量 | 60–75 | dB | 后端 `speech_analysis`，前端 PCM 分块上传 | 已实现 |
| 眨眼频率 | 15–20 | 次/分钟 | 前端 MediaPipe 面部关键点 | 已实现 |
| 眼神接触占比 | 60–70% | — | 前端 MediaPipe 头部偏转估算 | 已实现 |
| 语速 | 120–160 | 字/分钟 | 后端 `speech_rate_sps` 转换 + `AnswerRecord.speech_rate_wpm` | 已实现 |
| 语调变化 | 1.5–4.0 | st（半音标准差） | 后端 `speech_analysis` f0 统计 | 已实现 |
| 点头频率 | 3–5 | 次/分钟 | 前端 MediaPipe 鼻尖 Y 坐标状态机检测 | 已实现 |

> **产品红线**：以上数值范围为文献参考值，仅作为观察信号使用。严禁据此推断人格、情绪、健康状态、受保护属性或录用结论。报告使用谨慎措辞："观察到"、"检测到"、"需复核"。

---

## 三、数据流设计

### 3.1 视频指标（前端采集）

```
摄像头 → getUserMedia
  ├── Canvas 像素帧差 → 亮度、模糊、整体运动量
  │     └── 区域帧差 → topMotion / midMotion / bottomMotion
  │           ├── handActivity ← midMotion（手部区域）
  │           └── bodyActivity ← bottomMotion（身体区域）
  └── MediaPipe FaceLandmarker（可选）
        ├── 眨眼检测（EAR + 个人基线序列判定）
        ├── 眼神接触（头部偏转 + 双眼连线倾斜，偏差 < 10° 判定）
        └── 点头检测（鼻尖 Y 坐标状态机：idle → down → recovery）
```

**采样策略**：`requestAnimationFrame` 循环分析帧，但 React state 仅每 2 秒取快照更新 UI，避免高频重渲染。

### 3.2 语音指标（前端采集 + 后端分析）

```
麦克风 → pcmRecorder（4s WAV 分块）
  └── POST /api/sessions/{id}/speech-chunks（Base64 上传）
        └── 后端 SpeechAnalyzer.analyze()
              ├── 音量：RMS dBFS → rms_db_mean
              ├── 语速：speech_rate_sps → 前端转换为 字/分钟
              └── 语调：f0 基频统计 → f0_std_semitones（半音标准差）
                    └── SpeechAggregateState 累积
                          └── serialize_session() 注入 speech_summary
```

### 3.3 答案文本指标（后端计算）

提交答案时，`record_answer()` 自动计算：

- `word_count`：答案字数
- `filler_word_count`：填充词数量（`VITE_INTERVIEW_FILLER_WORDS` 配置）
- `speech_rate_wpm`：`word_count / (duration_sec / 60)`
- `duration_sec`：回答耗时

---

## 四、报告输出

### 4.1 Markdown 报告章节

`generate_markdown_report()` 输出以下观察章节：

1. **视频观察**（`_build_video_observations`）：眼神接触占比、眨眼频率、视线偏转、点头频率，与参考范围对比生成观察文本
2. **语音观察**（`_build_speech_observations`）：平均响度、语速、语调变化，与参考范围对比生成观察文本

### 4.2 前端可视化

- **雷达图**（`SkillsRadar`）：各专业维度得分 + 技能条
- **语音指标卡片**（`SpeechMetricCard`）：语速/音量/语调 + 分类标签（偏低/合理/偏高）+ 进度条
- **问答时间线**（`QATimeline`）：每题评分、耗时

---

## 五、实现细节

### 5.1 点头检测算法

位置：`frontend/src/videoAnalyzer.ts` → `detectNod()`

- 追踪鼻尖关键点（landmark 1）的 Y 坐标时序
- 状态机：`idle` → `down`（Y 下降超过 `NOD_MIN_AMPLITUDE=0.03`）→ `recovery`（Y 回升超过 `NOD_RECOVERY_AMPLITUDE=0.015`）
- 持续时间限制 < `NOD_MAX_DURATION_MS=1200ms`
- 输出：`nodCount`、`nodRatePerMinute`

### 5.2 手部/身体活动估算

位置：`frontend/src/videoAnalyzer.ts` → `computeRegionalMotion()`

- 将像素缓冲区水平分割为上/中/下三等分
- `handActivity ← clamp01(midMotion * 2.5)`（手部区域运动）
- `bodyActivity ← clamp01(bottomMotion * 2.5)`（身体区域运动）
- 标注为 proxy 级别，基于区域帧差而非关键点检测

### 5.3 语音聚合

位置：`backend/speech_analysis/aggregate.py` → `SpeechAggregateState`

- 后端 `SessionStore.speech_aggregates` 字典独立于 `InterviewSession` 数据类
- 序列化时通过 `serialize_session()` 注入 `speech_summary` 字段到 API 响应
- 前端 `InterviewSession` 类型通过 `speechSummary?: SpeechSummary` 接收

### 5.4 语速单位转换

- 后端 `speech_rate_sps`：音节/秒（AcousticFeatures 原始输出）
- 报告展示：字/分钟（`speech_rate_wpm = word_count / (duration_sec / 60)`）
- 前端 `SpeechMetricCard`：将 `speechRateSps` × 60 转换为字/分钟

---

## 六、不建议实现的指标

| 指标 | 原因 |
|------|------|
| 高精度人脸识别 | 产品红线明确禁止 |
| 情绪推断 | 产品红线明确禁止 |
| 敏感属性推断 | 产品红线明确禁止 |
| 自动录用决策 | 产品红线明确禁止 |
| parselmouth 音质指标（jitter/shimmer/HNR） | 依赖重，对面试评估价值有限，更偏临床/语音病理学用途 |

---

## 七、参考文献

### 综述与系统

1. Multimodal AI-Based Mock Interview System: Integrating Facial Expression Analysis, Speech Emotion Recognition, and NLP for Holistic Candidate Evaluation
2. IVAS: A multimodal AI system for objective video interview assessment with facial emotion, gaze, and audio analysis
3. SkillSight: An AI-Powered Platform for Soft Skills Interview & Assessment
4. Multi-Modal Method for Candidate Interview Assessment Based on Computer Vision and Large Language Models

### 学术论文

- Hickman, M., et al. (2025). Automated video interviews: A review and research agenda. *Journal of Applied Psychology*, 110(3), 453–472.
- Hershman, R., et al. (2018). Spontaneous eye blinks as markers of internal cognitive processes. *Journal of Neuroscience*, 38(47), 10020–10027.
- Argyle, M., & Dean, J. (1965). Eye-contact, distance and affiliation. *Sociometry*, 28(3), 289–304.
- Grosz, B. J., & Sidner, C. L. (1986). Attention, intentions, and the structure of discourse. *Computational Linguistics*, 12(3), 175–204.
- Kato, H., et al. (2026). Identifying eye movement behavior indicators of social competence during conversation listening: A study using HoloLens 2. *Empathic Computing*, 2, 202522.
