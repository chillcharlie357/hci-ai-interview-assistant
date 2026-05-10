"""业务异常类型"""


class PersistenceError(Exception):
    """数据库写入失败，handler 层捕获后返回 500"""
    pass
