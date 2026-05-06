"""面试会话数据仓库 - 负责数据持久化"""

from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any

from supabase import Client

from backend.auth.models import AuthContext
from backend.auth.supabase_client import get_authenticated_client
from backend.interview.session import InterviewSession


class SessionRepository:
    """面试会话数据仓库"""

    def __init__(self, client: Client, user: AuthContext):
        self.client = client
        self.user = user

    @classmethod
    def from_auth_context(cls, user: AuthContext, access_token: str) -> SessionRepository | None:
        """从认证上下文创建数据仓库实例"""
        client = get_authenticated_client(access_token)
        if client is None:
            return None
        return cls(client, user)

    def save_session(self, session: InterviewSession) -> bool:
        """保存面试会话到数据库"""
        try:
            data = self._session_to_dict(session)
            # 使用 upsert 模式，如果存在则更新
            result = self.client.table('interview_sessions').upsert(data).execute()
            return len(result.data) > 0
        except Exception as e:
            print(f"Failed to save session: {e}")
            return False

    def get_session(self, session_id: str) -> InterviewSession | None:
        """从数据库获取面试会话"""
        try:
            result = self.client.table('interview_sessions') \
                .select('*') \
                .eq('id', session_id) \
                .eq('user_id', self.user.user_id) \
                .single() \
                .execute()

            if result.data:
                return self._dict_to_session(result.data)
            return None
        except Exception:
            return None

    def list_sessions(self, limit: int = 50) -> list[dict[str, Any]]:
        """获取用户的面试会话列表"""
        try:
            result = self.client.table('interview_sessions') \
                .select('id, candidate_name, role, created_at, current_index, llm_status') \
                .eq('user_id', self.user.user_id) \
                .order('created_at', desc=True) \
                .limit(limit) \
                .execute()

            return result.data or []
        except Exception as e:
            print(f"Failed to list sessions: {e}")
            return []

    def delete_session(self, session_id: str) -> bool:
        """删除面试会话"""
        try:
            result = self.client.table('interview_sessions') \
                .delete() \
                .eq('id', session_id) \
                .eq('user_id', self.user.user_id) \
                .execute()

            return True
        except Exception as e:
            print(f"Failed to delete session: {e}")
            return False

    def _session_to_dict(self, session: InterviewSession) -> dict[str, Any]:
        """将 InterviewSession 转换为数据库字典"""
        data = asdict(session)
        # 确保 user_id 是字符串格式
        data['user_id'] = self.user.user_id
        # 将复杂对象序列化为 JSON
        data['questions'] = json.dumps(data['questions'], ensure_ascii=False)
        data['answers'] = json.dumps(data['answers'], ensure_ascii=False)
        data['events'] = json.dumps(data['events'], ensure_ascii=False)
        if data.get('video_events'):
            data['video_events'] = json.dumps(data['video_events'], ensure_ascii=False)
        if data.get('keyframes'):
            data['keyframes'] = json.dumps(data['keyframes'], ensure_ascii=False)
        return data

    def _dict_to_session(self, data: dict[str, Any]) -> InterviewSession:
        """将数据库字典转换为 InterviewSession"""
        # 解析 JSON 字段
        for field in ['questions', 'answers', 'events', 'video_events', 'keyframes']:
            if isinstance(data.get(field), str):
                data[field] = json.loads(data[field])

        return InterviewSession(**{
            'id': data['id'],
            'candidate_name': data['candidate_name'],
            'role': data['role'],
            'questions': data.get('questions', []),
            'current_index': data.get('current_index', 0),
            'answers': data.get('answers', []),
            'events': data.get('events', []),
            'user_id': data.get('user_id', ''),
            'llm_status': data.get('llm_status', 'fallback'),
            'video_events': data.get('video_events'),
            'keyframes': data.get('keyframes'),
            'report_visibility': data.get('report_visibility', 'recruiter_only'),
            'meeting_room': data.get('meeting_room', ''),
            'enable_video_observation': data.get('enable_video_observation', True),
        })
