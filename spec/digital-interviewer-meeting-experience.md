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

## UX Requirements

1. Candidate enters `/interview/{sessionId}`.
2. The meeting area shows two meeting participants:
   - AI interviewer tile with avatar, state, speaking animation, and current progress.
   - Candidate video tile or LiveKit unavailable placeholder.
3. Once the session is loaded, the AI interviewer automatically speaks the current question using Web Speech.
4. The current AI question appears as an AI subtitle under the meeting stage.
5. The candidate answers by speaking; recognized text appears as the candidate subtitle.
6. The primary action is "开始回答" / "结束回答", not "提交回答".
7. Ending an answer records the response, advances the interview, and automatically speaks the next question.
8. If all questions are complete, the AI interviewer state changes to finished and no speech is attempted.
9. If Web Speech is unavailable, the tile shows an unsupported state and a typed subtitle fallback remains available.

## Implementation Plan

- Add `frontend/src/digitalInterviewer.ts` for testable state helpers.
- Add `frontend/src/digitalInterviewer.test.ts` before production code.
- Update `frontend/src/main.tsx`:
  - Track AI interviewer state and the last auto-spoken question id.
  - Automatically speak each new current question once.
  - Render an AI interviewer tile next to the candidate LiveKit tile.
  - Render a subtitle stream below the meeting stage.
  - Use voice-first answer controls and typed fallback, without visible replay/submit buttons as the main flow.
- Update `frontend/src/styles.css` for meeting-like two-tile layout and speaking animation.
- Verify with Vitest, frontend build, and Playwright.
