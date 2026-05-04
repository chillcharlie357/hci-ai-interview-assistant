from __future__ import annotations

import base64
from dataclasses import dataclass
import subprocess
import tempfile
from pathlib import Path

from backend.interview.config import get_env


SUPPORTED_RESUME_SUFFIXES = {".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"}
MAX_RESUME_BYTES = 12 * 1024 * 1024


@dataclass(frozen=True)
class ExtractedDocument:
    markdown: str


class DocumentExtractionError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def extract_resume_markdown(file_name: str, data_base64: str) -> ExtractedDocument:
    suffix = Path(file_name).suffix.lower()
    if suffix not in SUPPORTED_RESUME_SUFFIXES:
        raise DocumentExtractionError("unsupported_resume_format", "支持 PDF、DOCX、PNG、JPG、JPEG、WEBP 简历。")

    try:
        raw = base64.b64decode(data_base64, validate=True)
    except Exception as exc:
        raise DocumentExtractionError("invalid_resume_payload", "简历文件 base64 内容无效。") from exc

    if not raw:
        raise DocumentExtractionError("empty_resume_file", "简历文件为空。")
    if len(raw) > MAX_RESUME_BYTES:
        raise DocumentExtractionError("resume_file_too_large", "简历文件超过 12MB。")

    command = get_env("MINERU_COMMAND", "mineru-open-api")
    timeout = int(get_env("MINERU_TIMEOUT_SEC", "120") or "120")
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
            handle.write(raw)
            temp_path = handle.name
        completed = subprocess.run(
            [command, "flash-extract", temp_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise DocumentExtractionError("mineru_not_found", "未找到 mineru-open-api，请先安装 MinerU CLI。") from exc
    except subprocess.TimeoutExpired as exc:
        raise DocumentExtractionError("mineru_timeout", "MinerU 解析超时，请压缩简历或稍后重试。") from exc
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)

    if completed.returncode != 0:
        raise DocumentExtractionError("mineru_failed", completed.stderr.strip() or "MinerU 解析失败。")
    markdown = completed.stdout.strip()
    if not markdown:
        raise DocumentExtractionError("empty_resume_text", "MinerU 未提取到简历文本。")
    return ExtractedDocument(markdown=markdown)
