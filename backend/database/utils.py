"""数据库工具函数"""

import uuid


def is_valid_uuid(value: str) -> bool:
    """检查字符串是否为合法 UUID"""
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError):
        return False
