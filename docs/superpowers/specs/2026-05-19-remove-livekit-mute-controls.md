# 删除 LiveKit 音视频开关功能

**日期**: 2026-05-19
**状态**: 已批准

## 背景

当前 LiveKit 视频会议集成中，CandidateVideo 组件包含 ControlBar，提供麦克风开关和摄像头开关按钮。麦克风静音状态通过 `onMicrophoneMutedChange` 回调联动到 `useSpeechRecognition`（静音时暂停 ASR）。

在面试场景中，候选人应始终保持音视频开启，这些手动控制没有实际作用，反而增加了代码复杂度。

## 变更范围

### 删除项

1. **ControlBar** — 整个控件栏移除（麦克风、摄像头、离开按钮全部去掉）
2. **mute 事件监听** — `trackMuted`/`trackUnmuted` 监听器移除
3. **mute 状态管理** — `liveKitMicMuted` state 及 `onMicrophoneMutedChange` 回调链路移除
4. **ASR mute 联动** — `useSpeechRecognition` 中的 mute 暂停/恢复逻辑移除
5. **useLocalParticipant** — 不再需要（仅用于 mute 事件监听）

### 保留项

- LiveKit 房间连接（token、URL、room）
- 音视频轨道采集（audio: true, video: true）
- GridLayout + ParticipantTile 视频显示
- RoomAudioRenderer 音频渲染
- 连接状态检测与断连降级 UI
- Egress 服务端录制
- LiveKit token 请求逻辑

## 涉及文件

| 文件 | 改动 |
|---|---|
| `frontend/src/pages/InterviewPage/components/CandidateVideo.tsx` | 删除 ControlBar、mute 事件监听、onMicrophoneMutedChange prop、useLocalParticipant |
| `frontend/src/pages/InterviewPage/index.tsx` | 删除 liveKitMicMuted state 及相关传参 |
| `frontend/src/pages/InterviewPage/hooks/useSpeechRecognition.ts` | 删除 liveKitMicMuted 参数及 ASR 暂停/恢复逻辑 |
| `frontend/src/pages/InterviewPage/components/CandidateVideo.css` | 清理不再需要的样式 |

## 简化后的组件结构

```
CandidateVideo
 └─ LiveKitRoom (audio + video, connect)
     └─ GridLayout + ParticipantTile
     └─ RoomAudioRenderer
     └─ 连接状态检测（断连降级 UI）
```
