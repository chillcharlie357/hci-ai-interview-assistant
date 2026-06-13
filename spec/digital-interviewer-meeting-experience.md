# Digital Interviewer Meeting Experience

## Goal

Make the candidate interview room feel like a real online interview hosted by an AI interviewer, instead of a text panel where the candidate clicks a button to hear the current question.

## Scope

- Show an AI interviewer tile in the meeting area beside the candidate video.
- Automatically speak the current question when the candidate enters the room and when the interview advances to the next question.
- Show a subtitle stream below the meeting conversation, with AI interviewer prompts and candidate answers.
- Replace the form-like "replay / submit" interaction with a voice-first answer flow.
- Show AI interviewer state: preparing, speaking, waiting for answer, finished, or unsupported.
- Preserve text fallback, typed answer fallback, and existing LiveKit candidate meeting behavior.

## Out of Scope

- Real LiveKit bot participant.
- Third-party avatar or digital-human rendering service.
- Generated lip-sync video.
- Screen sharing.
- New sensitive inference or automated hiring judgment.

## Avatar Design (2026-06-07)

The digital interviewer is rendered via pre-recorded MP4 video clips instead of the original SVG avatar. Four clips map to interviewer expressions:

| Clip | File | Trigger |
|------|------|---------|
| 说话 (speak) | `speak.mp4` | Loop while TTS is speaking |
| 微笑 (smile) | `smile.mp4` | Loop while listening; static frame for other states |
| 点头 (nod) | `nod.mp4` | Play once — triggered every 4~9s while listening, or when answer is 10-200 chars |
| 摇头 (shake) | `shake.mp4` | Play once — triggered when answer <10 or >200 chars |

### Video Switching

`VideoAvatar.tsx` uses dual `<video>` layers with A/B crossfade (0.25s CSS opacity transition). The inactive layer preloads and starts playing the next clip, then layers swap when `play()` resolves — avoiding blank frames during transitions.

### Reaction Logic

After the candidate finishes an answer, the interviewer reacts based on answer text length:

- `< 10` chars → shake head (too short, prompting elaboration)
- `10 ~ 200` chars → nod (acceptable)
- `> 200` chars → shake head (too verbose)

The reaction clip plays once with priority over the state-driven clip. Normal state flow resumes after the reaction ends.

### TTS Voice

`speakQuestion()` prefers a male `zh-CN` voice (Microsoft Yunyang). Falls back to the first available `zh-CN` voice if unavailable.

## UX Requirements

1. Candidate enters `/interview/{sessionId}`.
2. The meeting area shows two meeting participants:
   - AI interviewer tile with video avatar, state-driven expression, and orbit animation.
   - Candidate video tile or LiveKit unavailable placeholder.
3. Once the session is loaded, the AI interviewer automatically speaks the current question using Web Speech.
4. The current AI question appears as an AI subtitle under the meeting stage.
5. The candidate answers by speaking; recognized text appears as the candidate subtitle.
6. The primary action is "开始回答" / "结束回答", not "提交回答".
7. Ending an answer records the response, advances the interview, and automatically speaks the next question.
8. If all questions are complete, the AI interviewer state changes to finished and no speech is attempted.
9. If Web Speech is unavailable, the tile shows an unsupported state and a typed subtitle fallback remains available.

## Implementation Plan

- `frontend/src/pages/InterviewPage/components/VideoAvatar.tsx` — dual-layer video avatar component.
- `frontend/src/pages/InterviewPage/components/InterviewerTile.tsx` — simplified video-only tile.
- `frontend/src/pages/InterviewPage/InterviewPage.css` — video avatar sizing and crossfade styles.
- `frontend/src/digitalInterviewer.ts` — state helpers and type definitions.
- `frontend/public/videos/` — speak.mp4, smile.mp4, nod.mp4, shake.mp4.
- Verify with Vitest, frontend build, and Playwright.
