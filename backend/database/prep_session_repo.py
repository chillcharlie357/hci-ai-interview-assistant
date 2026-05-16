"""准备会话数据仓库 - 负责数据持久化"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict
from typing import Any

from supabase import Client

from backend.database.utils import is_valid_uuid
from backend.interview.prep_session import FollowupTurn, PrepSession, ReadySummary


log = logging.getLogger("backend.db")


class PrepSessionRepository:
    """准备会话数据仓库，使用 service role client 操作，应用层做 user_id 过滤"""

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

    def save_prep_session(self, session: PrepSession, user_id: str) -> bool:
        import time as _time
        if not is_valid_uuid(user_id):
            log.warning("save_prep_session: user_id=%r is not valid UUID, skipping DB persistence (prep_id=%s)",
                        user_id, session.id)
            return True
        try:
            self._ensure_profile(user_id)
            data = self._prep_to_dict(session, user_id)
            _t0 = _time.time()
            result = self.client.table('prep_sessions').upsert(data).execute()
            _t1 = _time.time()
            ok = len(result.data) > 0
            log.info("save_prep_session id=%s user_id=%s ok=%s duration=%.2fs",
                     session.id, user_id, ok, _t1 - _t0)
            if not ok:
                log.warning("save_prep_session returned 0 rows: id=%s, user_id=%s", session.id, user_id)
            return ok
        except Exception as e:
            log.warning("save_prep_session failed for id=%s, user_id=%s: %s", session.id, user_id, e)
            return False

    def get_prep_session(self, prep_session_id: str, user_id: str) -> PrepSession | None:
        import time as _time
        if not is_valid_uuid(user_id):
            log.warning("get_prep_session: user_id=%r is not valid UUID (prep_id=%s)", user_id, prep_session_id)
            return None
        try:
            _t0 = _time.time()
            result = self.client.table('prep_sessions') \
                .select('*') \
                .eq('id', prep_session_id) \
                .eq('user_id', user_id) \
                .single() \
                .execute()
            _t1 = _time.time()
            if result.data:
                log.info("get_prep_session found: id=%s, user_id=%s, duration=%.2fs",
                         prep_session_id, user_id, _t1 - _t0)
                return self._dict_to_prep(result.data)
            log.info("get_prep_session not found: id=%s, user_id=%s, duration=%.2fs",
                     prep_session_id, user_id, _t1 - _t0)
            return None
        except Exception as e:
            log.warning("get_prep_session failed for id=%s, user_id=%s: %s", prep_session_id, user_id, e)
            return None

    def list_prep_sessions(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        if not is_valid_uuid(user_id):
            return []
        try:
            result = self.client.table('prep_sessions') \
                .select('id, candidate_name, ready, created_at') \
                .eq('user_id', user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .execute()
            return result.data or []
        except Exception as e:
            log.warning("list_prep_sessions failed for user_id=%s: %s", user_id, e)
            return []

    # TODO: 添加 DELETE /api/prep-sessions/{id} 路由后启用此方法
    def delete_prep_session(self, prep_session_id: str, user_id: str) -> bool:
        if not is_valid_uuid(user_id):
            return False
        try:
            self.client.table('prep_sessions') \
                .delete() \
                .eq('id', prep_session_id) \
                .eq('user_id', user_id) \
                .execute()
            return True
        except Exception as e:
            log.warning("delete_prep_session failed for id=%s: %s", prep_session_id, e)
            return False

    def _prep_to_dict(self, session: PrepSession, user_id: str) -> dict[str, Any]:
        data = asdict(session)
        data['user_id'] = user_id
        data['followup_questions'] = json.dumps(data['followup_questions'], ensure_ascii=False)
        data['turns'] = json.dumps(data['turns'], ensure_ascii=False)
        if data.get('ready_summary'):
            data['ready_summary'] = json.dumps(data['ready_summary'], ensure_ascii=False)
        return data

    def _dict_to_prep(self, data: dict[str, Any]) -> PrepSession:
        for field in ['followup_questions', 'turns', 'ready_summary']:
            if isinstance(data.get(field), str):
                data[field] = json.loads(data[field])

        ready_summary = None
        if data.get('ready_summary') and isinstance(data['ready_summary'], dict):
            ready_summary = ReadySummary(**data['ready_summary'])

        turns = []
        for turn in (data.get('turns') or []):
            if isinstance(turn, dict):
                turns.append(FollowupTurn(**turn))
            else:
                turns.append(turn)

        return PrepSession(
            id=data['id'],
            candidate_name=data['candidate_name'],
            resume_markdown=data.get('resume_markdown', ''),
            followup_questions=data.get('followup_questions', []),
            turns=turns,
            ready=data.get('ready', False),
            ready_summary=ready_summary,
            llm_status=data.get('llm_status', 'fallback'),
            user_id=data.get('user_id', ''),
        )
