"""面试会话数据仓库 - 负责数据持久化"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict
from typing import Any

from supabase import Client

from backend.database.utils import is_valid_uuid
from backend.interview.question_engine import InterviewQuestion
from backend.interview.session import (
    AnswerRecord,
    FollowupState,
    FollowupTurn,
    InterviewEvent,
    InterviewSession,
    KeyframeRecord,
    VideoEvent,
    VideoMetrics,
)
from backend.speech_analysis.aggregate import SpeechAggregateState


log = logging.getLogger("backend.db")


class SessionRepository:
    """面试会话数据仓库，使用 service role client 操作，应用层做 user_id 过滤"""

    def __init__(self, client: Client):
        self.client = client

    def _ensure_profile(self, user_id: str, email: str = "") -> None:
        """确保 profiles 表中有该用户的记录（修复 trigger 未执行的情况）"""
        existing = self.client.table('profiles').select('id').eq('id', user_id).execute()
        if existing.data:
            return
        try:
            self.client.table('profiles').upsert({
                'id': user_id,
                'email': email or f'{user_id}@placeholder.local',
                'full_name': '',
            }).execute()
            log.info("ensure_profile: created profile for user_id=%s", user_id)
        except Exception as e:
            log.warning("ensure_profile: failed for user_id=%s: %s", user_id, e)

    def save_session(self, session: InterviewSession, user_id: str) -> bool:
        """保存面试会话到数据库"""
        if not is_valid_uuid(user_id):
            log.warning("save_session: user_id=%r is not valid UUID, skipping DB persistence", user_id)
            return True
        try:
            self._ensure_profile(user_id)
            data = self._session_to_dict(session, user_id)
            log.info("save_session id=%s user_id=%s", session.id, user_id)
            result = self.client.table('interview_sessions').upsert(data).execute()
            return len(result.data) > 0
        except Exception as e:
            log.warning("save_session: DB write failed for id=%s: %s", session.id, e)
            return False

    def get_session(self, session_id: str, user_id: str) -> InterviewSession | None:
        """从数据库获取面试会话"""
        if not is_valid_uuid(user_id):
            return None
        try:
            result = self.client.table('interview_sessions') \
                .select('*') \
                .eq('id', session_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()

            if result.data:
                return self._dict_to_session(result.data)
            return None
        except Exception:
            return None

    def list_sessions(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        """获取用户的面试会话列表"""
        if not is_valid_uuid(user_id):
            return []
        try:
            result = self.client.table('interview_sessions') \
                .select('id, candidate_name, role, created_at, current_index, llm_status, questions') \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .execute()

            return [self._enrich_session_summary(row) for row in (result.data or [])]
        except Exception as e:
            log.warning("list_sessions failed for user_id=%s: %s", user_id, e)
            return []

    def _enrich_session_summary(self, row: dict[str, Any]) -> dict[str, Any]:
        """为列表返回补充 total_questions，并移除原始 questions JSON"""
        questions_raw = row.get("questions")
        if isinstance(questions_raw, str):
            try:
                questions = json.loads(questions_raw)
                row["total_questions"] = len(questions) if isinstance(questions, list) else 0
            except (json.JSONDecodeError, TypeError):
                row["total_questions"] = 0
        elif isinstance(questions_raw, list):
            row["total_questions"] = len(questions_raw)
        else:
            row["total_questions"] = 0
        row.pop("questions", None)
        return row

    def delete_session(self, session_id: str, user_id: str) -> bool:
        """删除面试会话"""
        if not is_valid_uuid(user_id):
            return False
        try:
            self.client.table('interview_sessions') \
                .delete() \
                .eq('id', session_id) \
                .eq('user_id', user_id) \
                .execute()
            return True
        except Exception as e:
            log.warning("delete_session failed for id=%s: %s", session_id, e)
            return False

    def save_speech_aggregate(self, session_id: str, state: SpeechAggregateState) -> bool:
        try:
            data = asdict(state)
            data['session_id'] = session_id
            self.client.table('speech_aggregates').upsert(data).execute()
            return True
        except Exception as e:
            log.warning("save_speech_aggregate failed for session_id=%s: %s", session_id, e)
            return False

    def get_speech_aggregate(self, session_id: str) -> SpeechAggregateState | None:
        try:
            result = self.client.table('speech_aggregates') \
                .select('*') \
                .eq('session_id', session_id) \
                .single() \
                .execute()
            if result.data:
                return SpeechAggregateState(
                    chunk_count=result.data.get('chunk_count', 0),
                    analyzed_duration_sec=result.data.get('analyzed_duration_sec', 0.0),
                    voiced_duration_sec=result.data.get('voiced_duration_sec', 0.0),
                    speech_run_equivalent=result.data.get('speech_run_equivalent', 0.0),
                    rms_weighted_db_sum=result.data.get('rms_weighted_db_sum', 0.0),
                    rms_weight_count=result.data.get('rms_weight_count', 0.0),
                    pitch_weight_sum=result.data.get('pitch_weight_sum', 0.0),
                    pitch_weighted_mean_sum=result.data.get('pitch_weighted_mean_sum', 0.0),
                    pitch_weighted_second_moment_sum=result.data.get('pitch_weighted_second_moment_sum', 0.0),
                    semitone_weight_sum=result.data.get('semitone_weight_sum', 0.0),
                    semitone_weighted_mean_sum=result.data.get('semitone_weighted_mean_sum', 0.0),
                    semitone_weighted_second_moment_sum=result.data.get('semitone_weighted_second_moment_sum', 0.0),
                    f0_min_hz=result.data.get('f0_min_hz'),
                    f0_max_hz=result.data.get('f0_max_hz'),
                )
            return None
        except Exception:
            return None

    def _session_to_dict(self, session: InterviewSession, user_id: str) -> dict[str, Any]:
        """将 InterviewSession 转换为数据库字典"""
        data = asdict(session)
        data['user_id'] = user_id
        data['questions'] = json.dumps(data['questions'], ensure_ascii=False)
        data['answers'] = json.dumps(data['answers'], ensure_ascii=False)
        data['events'] = json.dumps(data['events'], ensure_ascii=False)
        if data.get('video_events'):
            data['video_events'] = json.dumps(data['video_events'], ensure_ascii=False)
        # keyframes 仅保留在内存中，不写入 DB（spec 要求且单个 keyframe ~20KB，累积易超 Supabase 1MB 限制）
        data['keyframes'] = None
        # followup_states 仅活在内存里：DB schema 未必有该列，丢弃以避免 upsert 报错；
        # 历史/重启场景里恢复 session 时缺失即可，每题完成后 finished=True 不再触发追问。
        data.pop('followup_states', None)
        # 空字符串的 created_at 会让 PostgreSQL 报错，删除让数据库使用默认值
        if not data.get('created_at'):
            data.pop('created_at', None)
        return data

    def _dict_to_session(self, data: dict[str, Any]) -> InterviewSession:
        """将数据库字典转换为 InterviewSession（兼容老记录缺失追问字段）"""
        for field in ['questions', 'answers', 'events', 'video_events', 'keyframes', 'followup_states']:
            if isinstance(data.get(field), str):
                try:
                    data[field] = json.loads(data[field])
                except json.JSONDecodeError:
                    data[field] = None

        questions = [InterviewQuestion(**q) for q in (data.get('questions') or [])]
        answers = [_answer_from_dict(a) for a in (data.get('answers') or [])]
        events = [InterviewEvent(**e) for e in (data.get('events') or [])]
        keyframes = [KeyframeRecord(**k) for k in (data.get('keyframes') or [])]
        video_events = [
            VideoEvent(
                timestamp=ve.get('timestamp', 0),
                event_type=ve.get('event_type', ''),
                confidence=ve.get('confidence', 0),
                metrics=VideoMetrics(**ve['metrics']) if ve.get('metrics') else VideoMetrics(),
                keyframe_index=ve.get('keyframe_index'),
            )
            for ve in (data.get('video_events') or [])
        ]
        followup_states = _followup_states_from_dict(data.get('followup_states'))

        return InterviewSession(**{
            'id': data['id'],
            'candidate_name': data['candidate_name'],
            'role': data['role'],
            'questions': questions,
            'current_index': data.get('current_index', 0),
            'answers': answers,
            'events': events,
            'user_id': data.get('user_id', ''),
            'created_at': data.get('created_at', ''),
            'llm_status': data.get('llm_status', 'fallback'),
            'video_events': video_events if video_events else None,
            'keyframes': keyframes if keyframes else None,
            'enable_video_observation': data.get('enable_video_observation', True),
            'video_path': data.get('video_path'),
            'video_duration_sec': data.get('video_duration_sec'),
            'video_upload_failed': data.get('video_upload_failed', False),
            'followup_states': followup_states,
            'asr_context_terms': data.get('asr_context_terms') or [],
            'max_followup_rounds': data.get('max_followup_rounds', 2),
        })


def _answer_from_dict(raw: dict[str, Any]) -> AnswerRecord:
    """兼容旧记录缺少 is_followup / followup_round / followup_prompt 字段。"""
    return AnswerRecord(
        question_id=raw.get('question_id', ''),
        dimension=raw.get('dimension', ''),
        prompt=raw.get('prompt', ''),
        text=raw.get('text', ''),
        duration_sec=int(raw.get('duration_sec', 0)),
        word_count=int(raw.get('word_count', 0)),
        filler_word_count=int(raw.get('filler_word_count', 0)),
        recorded_at=raw.get('recorded_at', ''),
        speech_rate_wpm=raw.get('speech_rate_wpm'),
        audio_rms_db=raw.get('audio_rms_db'),
        audio_f0_std_hz=raw.get('audio_f0_std_hz'),
        audio_f0_std_semitones=raw.get('audio_f0_std_semitones'),
        is_followup=bool(raw.get('is_followup', False)),
        followup_round=int(raw.get('followup_round', 0)),
        followup_prompt=str(raw.get('followup_prompt', '') or ''),
        video_timestamp_sec=raw.get('video_timestamp_sec'),
        question_start_sec=raw.get('question_start_sec'),
    )


def _followup_states_from_dict(raw: Any) -> dict[str, FollowupState] | None:
    if not isinstance(raw, dict):
        return {} if raw is None else None
    states: dict[str, FollowupState] = {}
    for question_id, value in raw.items():
        if not isinstance(value, dict):
            continue
        turns_raw = value.get('turns') or []
        turns = [
            FollowupTurn(
                role=str(t.get('role', '')),
                text=str(t.get('text', '')),
                timestamp=str(t.get('timestamp', '')),
            )
            for t in turns_raw
            if isinstance(t, dict)
        ]
        states[str(question_id)] = FollowupState(
            question_id=str(value.get('question_id', question_id)),
            turns=turns,
            asked_count=int(value.get('asked_count', 0)),
            finished=bool(value.get('finished', False)),
            pending_question=value.get('pending_question'),
        )
    return states
