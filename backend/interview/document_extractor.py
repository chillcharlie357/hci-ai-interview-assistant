from __future__ import annotations

import base64
from dataclasses import dataclass
import logging
import subprocess
import tempfile
from pathlib import Path

from backend.interview.config import get_env


log = logging.getLogger("backend.document_extractor")

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
    log.info("extracting resume: file_name=%s, base64_len=%d", file_name, len(data_base64))
    suffix = Path(file_name).suffix.lower()
    if suffix not in SUPPORTED_RESUME_SUFFIXES:
        log.warning("unsupported resume format: suffix=%s, file_name=%s", suffix, file_name)
        raise DocumentExtractionError("unsupported_resume_format", "支持 PDF、DOCX、PNG、JPG、JPEG、WEBP 简历。")

    try:
        raw = base64.b64decode(data_base64, validate=True)
    except Exception as exc:
        log.warning("resume base64 decode failed: %s", exc)
        raise DocumentExtractionError("invalid_resume_payload", "简历文件 base64 内容无效。") from exc

    file_size_kb = len(raw) / 1024
    log.info("resume decoded: file_size=%.1fKB, suffix=%s", file_size_kb, suffix)

    if not raw:
        log.warning("resume file is empty: file_name=%s", file_name)
        raise DocumentExtractionError("empty_resume_file", "简历文件为空。")
    if len(raw) > MAX_RESUME_BYTES:
        log.warning("resume file too large: %.1fKB > max=%.1fKB", file_size_kb, MAX_RESUME_BYTES / 1024)
        raise DocumentExtractionError("resume_file_too_large", "简历文件超过 12MB。")

    command = get_env("MINERU_COMMAND", "mineru-open-api")
    timeout = int(get_env("MINERU_TIMEOUT_SEC", "120") or "120")
    log.info("calling mineru: command=%s, timeout=%ds, file=%s", command, timeout, file_name)
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
            handle.write(raw)
            temp_path = handle.name
        log.debug("temp file written: %s", temp_path)
        import time as _time
        _start = _time.time()
        completed = subprocess.run(
            [command, "flash-extract", temp_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        elapsed = _time.time() - _start
        log.info("mineru completed in %.2fs: returncode=%d, stdout_len=%d, stderr_len=%d",
                 elapsed, completed.returncode, len(completed.stdout), len(completed.stderr))
        if completed.stderr.strip():
            log.debug("mineru stderr: %s", completed.stderr.strip()[:500])
    except FileNotFoundError as exc:
        log.error("mineru command not found: %s", command)
        raise DocumentExtractionError("mineru_not_found", "未找到 mineru-open-api，请先安装 MinerU CLI。") from exc
    except subprocess.TimeoutExpired as exc:
        log.warning("mineru timed out after %ds: file=%s", timeout, file_name)
        raise DocumentExtractionError("mineru_timeout", "MinerU 解析超时，请压缩简历或稍后重试。") from exc
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
            log.debug("temp file cleaned: %s", temp_path)

    if completed.returncode != 0:
        stderr_snippet = (completed.stderr.strip() or "MinerU 解析失败。")[:300]
        log.warning("mineru failed: returncode=%d, stderr=%s", completed.returncode, stderr_snippet)
        raise DocumentExtractionError("mineru_failed", completed.stderr.strip() or "MinerU 解析失败。")
    markdown = completed.stdout.strip()
    if not markdown:
        log.warning("mineru returned empty text: file=%s", file_name)
        raise DocumentExtractionError("empty_resume_text", "MinerU 未提取到简历文本。")
    log.info("resume extraction succeeded: file=%s, extracted_len=%d chars", file_name, len(markdown))
    return ExtractedDocument(markdown=markdown)
